// In-memory face embedding index for faster + more robust matching
// NOTE: Resets on server restart. For production persist or rebuild on boot.
const { User } = require('../entities/User.js');
const { AppDataSource } = require('../config/data-source.js');
const { FaceUtils, FaceConfig } = require('../utils/face-utils.js');

class FaceIndex {
  constructor() {
    this.entries = []; // { id, embeddings: [mean, median, ...samples] }
    this.version = 0;
    this.loaded = false;
  }

  /**
   * Rebuild the face index from database
   * @returns {Object} Rebuild statistics
   */
  async rebuild() {
    try {
      const repo = AppDataSource.getRepository(User);
      const users = await repo.find();
      
      this.entries = users
        .filter(user => user.faceEmbeddings?.mean)
        .map(user => ({
          id: user.id,
          embeddings: [
            user.faceEmbeddings.mean,
            user.faceEmbeddings.median,
            ...(user.faceEmbeddings.samples || []).slice(0, 5)
          ].filter(emb => Array.isArray(emb) && emb.length > 0)
        }))
        .filter(entry => entry.embeddings.length > 0);

      this.version++;
      this.loaded = true;
      
      FaceUtils.logDebug('FaceIndex', `Rebuilt with ${this.entries.length} users`);
      
      return { 
        count: this.entries.length, 
        version: this.version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Rebuild failed: ${error.message}`);
      throw new Error(`Failed to rebuild face index: ${error.message}`);
    }
  }

  /**
   * Ensure the index is loaded
   */
  ensureLoaded() {
    if (!this.loaded) {
      throw new Error('Face index not loaded. Call rebuild() first.');
    }
  }

  /**
   * Search for the best matching face in the index
   * @param {number[]} queryEmbedding - The face embedding to search for
   * @param {Object} options - Search options
   * @returns {Object|null} Best match result or null if no match found
   */
  search(queryEmbedding, options = {}) {
    const {
      threshold = FaceConfig.COSINE_DISTANCE_THRESHOLD,
      margin = FaceConfig.DISTANCE_MARGIN,
      maxResults = 5
    } = options;

    this.ensureLoaded();

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new Error('Query embedding must be a non-empty array');
    }

    // Use the centralized matching logic
    const result = FaceUtils.findBestMatch(queryEmbedding, this.entries, {
      threshold,
      margin,
      distanceFunction: 'cosine'
    });

    if (result) {
      FaceUtils.logDebug('FaceIndex', {
        operation: 'search',
        matchId: result.match.id,
        distance: result.distance,
        confidence: result.confidence,
        margin: result.margin
      });

      return {
        id: result.match.id,
        distance: result.distance,
        secondDistance: result.secondDistance,
        confidence: result.confidence,
        ranked: result.allMatches.slice(0, maxResults)
      };
    }

    return null;
  }

  /**
   * Add or update a user in the index
   * @param {Object} user - User object with face embeddings
   */
  addUser(user) {
    if (!user || !user.id || !user.faceEmbeddings?.mean) {
      FaceUtils.logDebug('FaceIndex', 'Invalid user data for addUser');
      return;
    }

    try {
      const embeddings = [
        user.faceEmbeddings.mean,
        user.faceEmbeddings.median,
        ...(user.faceEmbeddings.samples || []).slice(0, 5)
      ].filter(emb => Array.isArray(emb) && emb.length > 0);

      if (embeddings.length === 0) {
        FaceUtils.logDebug('FaceIndex', `No valid embeddings for user ${user.id}`);
        return;
      }

      const entry = {
        id: user.id,
        embeddings
      };

      // Replace if exists, otherwise add new entry
      const existingIndex = this.entries.findIndex(e => e.id === user.id);
      if (existingIndex >= 0) {
        this.entries[existingIndex] = entry;
      } else {
        this.entries.push(entry);
      }

      this.version++;
      this.loaded = true;
      
      FaceUtils.logDebug('FaceIndex', {
        operation: 'addUser',
        userId: user.id,
        embeddingCount: embeddings.length,
        version: this.version
      });
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Failed to add user ${user.id}: ${error.message}`);
    }
  }

  /**
   * Remove a user from the index
   * @param {string|number} userId - User ID to remove
   */
  removeUser(userId) {
    const initialCount = this.entries.length;
    this.entries = this.entries.filter(entry => entry.id !== userId);
    
    if (this.entries.length < initialCount) {
      this.version++;
      FaceUtils.logDebug('FaceIndex', {
        operation: 'removeUser',
        userId,
        version: this.version
      });
    }
  }

  /**
   * Get index statistics
   * @returns {Object} Index statistics
   */
  getStats() {
    return {
      userCount: this.entries.length,
      version: this.version,
      loaded: this.loaded,
      totalEmbeddings: this.entries.reduce((sum, entry) => sum + entry.embeddings.length, 0)
    };
  }

  /**
   * Clear the index
   */
  clear() {
    this.entries = [];
    this.version++;
    this.loaded = false;
    FaceUtils.logDebug('FaceIndex', 'Index cleared');
  }
}

module.exports = new FaceIndex();