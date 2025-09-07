// In-memory face embedding index for faster + more robust matching
// NOTE: Resets on server restart. For production persist or rebuild on boot.
const { User } = require('../entities/User.js');
const { AppDataSource } = require('../config/data-source.js');
const { FaceUtils, FaceConfig } = require('../utils/face-utils.js');
const FaceDetectionService = require('./face-detection.js');

class FaceIndex {
  constructor() {
    this.entries = []; // { id, embeddings: [mean, median, ...samples] }
    this.version = 0;
    this.loaded = false;
    this.initializeDetection();
  }

  /**
   * Initialize face detection service
   */
  async initializeDetection() {
    try {
      await FaceDetectionService.initialize();
      FaceUtils.logDebug('FaceIndex', 'Face detection service initialized');
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Face detection initialization warning: ${error.message}`);
    }
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
   * Process face image and extract high-quality descriptors
   * @param {Buffer} imageBuffer - Face image buffer
   * @param {Object} options - Processing options
   * @returns {Object} Processed face data with descriptors
   */
  async processFaceImage(imageBuffer, options = {}) {
    try {
      const detection = await FaceDetectionService.detectFaces(imageBuffer, {
        minFaceSize: 120,
        scoreThreshold: 0.6,
        maxFaces: 1,
        requireLandmarks: true,
        requireDescriptors: true,
        ...options
      });

      if (!detection.success || detection.faces.length === 0) {
        throw new Error(detection.error || 'No valid face detected');
      }

      const face = detection.faces[0];
      const validation = FaceDetectionService.validateDetection(detection);
      
      if (!validation.valid) {
        throw new Error(`Face validation failed: ${validation.reason}`);
      }

      return {
        success: true,
        descriptor: face.descriptor,
        quality: face.quality,
        confidence: face.confidence,
        landmarks: face.landmarks,
        pose: face.pose,
        metadata: {
          method: detection.metadata.method,
          boundingBox: face.boundingBox,
          size: face.size
        }
      };
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Face processing failed: ${error.message}`);
      throw new Error(`Face processing failed: ${error.message}`);
    }
  }

  /**
   * Generate face embeddings from multiple images for better accuracy
   * @param {Buffer[]} imageBuffers - Array of face image buffers
   * @returns {Object} Aggregated embeddings with quality metrics
   */
  async generateEmbeddings(imageBuffers) {
    if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
      throw new Error('At least one image required for embedding generation');
    }

    try {
      const descriptors = await FaceDetectionService.extractMultipleDescriptors(imageBuffers);
      
      if (descriptors.length === 0) {
        throw new Error('No valid face descriptors could be extracted');
      }

      // Filter high-quality descriptors
      const qualityDescriptors = descriptors
        .filter(desc => desc.quality >= 0.6)
        .sort((a, b) => b.quality - a.quality);

      if (qualityDescriptors.length === 0) {
        throw new Error('No high-quality face descriptors found');
      }

      // Use centralized embedding aggregation
      const embeddings = qualityDescriptors.map(desc => desc.descriptor);
      const aggregated = FaceUtils.aggregateEmbeddings(embeddings);

      return {
        success: true,
        embeddings: aggregated,
        qualityMetrics: {
          totalImages: imageBuffers.length,
          validDescriptors: descriptors.length,
          highQualityDescriptors: qualityDescriptors.length,
          averageQuality: qualityDescriptors.reduce((sum, desc) => sum + desc.quality, 0) / qualityDescriptors.length,
          bestQuality: qualityDescriptors[0].quality
        },
        samples: qualityDescriptors.slice(0, 5).map(desc => ({
          descriptor: desc.descriptor,
          quality: desc.quality,
          metadata: desc.metadata
        }))
      };
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Embedding generation failed: ${error.message}`);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Enhanced search with advanced matching
   * @param {Buffer} imageBuffer - Query face image
   * @param {Object} options - Search options
   * @returns {Object|null} Enhanced search result
   */
  async searchByImage(imageBuffer, options = {}) {
    try {
      const faceData = await this.processFaceImage(imageBuffer, options);
      
      if (!faceData.success || !faceData.descriptor) {
        throw new Error('Could not extract face descriptor from query image');
      }

      // Perform traditional embedding search
      const searchResult = this.search(faceData.descriptor, options);
      
      if (searchResult) {
        // Enhance result with face quality metrics
        searchResult.faceQuality = faceData.quality;
        searchResult.faceMetadata = faceData.metadata;
        searchResult.searchMethod = 'advanced';
      }

      return searchResult;
    } catch (error) {
      FaceUtils.logDebug('FaceIndex', `Image search failed: ${error.message}`);
      throw new Error(`Image search failed: ${error.message}`);
    }
  }

  /**
   * Get index statistics
   * @returns {Object} Index statistics
   */
  getStats() {
    const detectionMethod = FaceDetectionService.useHaarCascade ? 'haar-cascade' : 
                           (FaceDetectionService.modelsLoaded ? 'advanced' : 'fallback');
    
    return {
      userCount: this.entries.length,
      version: this.version,
      loaded: this.loaded,
      totalEmbeddings: this.entries.reduce((sum, entry) => sum + entry.embeddings.length, 0),
      faceDetectionService: detectionMethod,
      capabilities: {
        haarCascadeDetection: FaceDetectionService.useHaarCascade,
        advancedDetection: FaceDetectionService.modelsLoaded,
        landmarkDetection: FaceDetectionService.modelsLoaded || FaceDetectionService.useHaarCascade,
        poseEstimation: FaceDetectionService.modelsLoaded || FaceDetectionService.useHaarCascade,
        qualityAssessment: true
      }
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