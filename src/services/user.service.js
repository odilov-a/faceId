const { User } = require("../entities/User.js");
const { AppDataSource } = require("../config/data-source.js");
const { sign } = require("../utils/jwt.js");
const { FaceUtils, FaceConfig } = require("../utils/face-utils.js");
const faceIndex = require('./face-index.js');

class UserService {
  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  /**
   * Create a new user with face embeddings
   * @param {string} firstName - User's first name
   * @param {string} lastName - User's last name
   * @param {number[]|number[][]} faceEmbeddingOrEmbeddings - Single embedding or array of embeddings
   * @returns {Object} Created user object
   */
  async createUser(firstName, lastName, faceEmbeddingOrEmbeddings) {
    try {
      if (!firstName || !lastName) {
        throw new Error("firstName & lastName required");
      }
      
      if (!faceEmbeddingOrEmbeddings) {
        throw new Error("face embeddings required");
      }

      // Normalize input to array of embeddings
      let embeddings = Array.isArray(faceEmbeddingOrEmbeddings[0]) 
        ? faceEmbeddingOrEmbeddings 
        : [faceEmbeddingOrEmbeddings];

      // Validate and normalize each embedding
      embeddings = embeddings
        .filter(e => Array.isArray(e) && e.every(v => typeof v === 'number' && Number.isFinite(v)))
        .map(e => FaceUtils.normalize(e));

      if (embeddings.length === 0) {
        throw new Error("No valid embeddings supplied");
      }

      // Ensure uniform length
      const dimension = embeddings[0].length;
      if (!embeddings.every(e => e.length === dimension)) {
        throw new Error("Embeddings length mismatch");
      }

      // Validate embedding quality
      const qualityResult = FaceUtils.validateEmbeddingQuality(embeddings);
      if (!qualityResult.isValid) {
        FaceUtils.logDebug('UserService', `Low quality embeddings: ${qualityResult.reason}`);
      }

      // Aggregate embeddings
      const aggregated = FaceUtils.aggregateEmbeddings(embeddings);

      const newUser = this.userRepository.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        faceEmbedding: aggregated.mean, // backward compatibility
        faceEmbeddings: {
          samples: embeddings,
          mean: aggregated.mean,
          median: aggregated.median
        },
        embeddingVersion: 2,
        lastEmbeddingUpdate: new Date()
      });

      const saved = await this.userRepository.save(newUser);
      
      // Add to face index
      try {
        faceIndex.addUser(saved);
      } catch (e) {
        FaceUtils.logDebug('UserService', `Failed to add user to index: ${e.message}`);
      }

      return saved;
    } catch (error) {
      FaceUtils.logDebug('UserService', `User creation failed: ${error.message}`);
      throw new Error(`User creation failed: ${error.message}`);
    }
  }

  /**
   * Create a new user with face embeddings from images
   * @param {string} firstName - User's first name
   * @param {string} lastName - User's last name
   * @param {Buffer|Buffer[]} imageBuffers - Single image buffer or array of image buffers
   * @returns {Object} Created user object
   */
  async createUserFromImages(firstName, lastName, imageBuffers) {
    try {
      if (!firstName || !lastName) {
        throw new Error("firstName & lastName required");
      }
      
      if (!imageBuffers) {
        throw new Error("face images required");
      }

      // Normalize to array
      const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers];
      
      if (buffers.length === 0) {
        throw new Error("At least one face image required");
      }

      // Generate embeddings using advanced face detection
      const embeddingResult = await faceIndex.generateEmbeddings(buffers);
      
      if (!embeddingResult.success) {
        throw new Error("Failed to generate face embeddings from images");
      }

      const { embeddings, qualityMetrics, samples } = embeddingResult;

      const newUser = this.userRepository.create({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        faceEmbedding: embeddings.mean, // backward compatibility
        faceEmbeddings: {
          samples: samples.map(s => s.descriptor),
          mean: embeddings.mean,
          median: embeddings.median,
          qualityMetrics: qualityMetrics
        },
        embeddingVersion: 3, // Advanced version
        lastEmbeddingUpdate: new Date()
      });

      const saved = await this.userRepository.save(newUser);
      
      // Add to face index
      try {
        faceIndex.addUser(saved);
      } catch (e) {
        FaceUtils.logDebug('UserService', `Failed to add user to index: ${e.message}`);
      }

      FaceUtils.logDebug('UserService', {
        operation: 'createUserFromImages',
        userId: saved.id,
        qualityMetrics: qualityMetrics
      });

      return {
        ...saved,
        faceProcessingResult: embeddingResult
      };
    } catch (error) {
      FaceUtils.logDebug('UserService', `User creation failed: ${error.message}`);
      throw new Error(`User creation failed: ${error.message}`);
    }
  }

  async login(faceEmbedding) {
    return await this.findByEmbedding(faceEmbedding);
  }

  /**
   * Login user using face image with advanced detection
   * @param {Buffer} imageBuffer - Face image buffer
   * @param {Object} options - Login options
   * @returns {Object} Login result with user and token
   */
  async loginByImage(imageBuffer, options = {}) {
    try {
      const searchResult = await faceIndex.searchByImage(imageBuffer, {
        threshold: options.threshold || FaceConfig.COSINE_DISTANCE_THRESHOLD,
        margin: options.margin || FaceConfig.DISTANCE_MARGIN
      });

      if (!searchResult) {
        return {
          success: false,
          message: "No matching face found",
          faceQuality: null
        };
      }

      const user = await this.getUserById(searchResult.id);
      if (!user) {
        return {
          success: false,
          message: "User not found",
          faceQuality: searchResult.faceQuality
        };
      }

      const token = sign({ id: user.id });

      FaceUtils.logDebug('UserService', {
        operation: 'loginByImage',
        userId: user.id,
        confidence: searchResult.confidence,
        faceQuality: searchResult.faceQuality,
        method: searchResult.searchMethod
      });

      return {
        success: true,
        message: "Authentication successful",
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName
        },
        token,
        authMetadata: {
          confidence: searchResult.confidence,
          distance: searchResult.distance,
          faceQuality: searchResult.faceQuality,
          method: searchResult.searchMethod
        }
      };
    } catch (error) {
      FaceUtils.logDebug('UserService', `Image login failed: ${error.message}`);
      return {
        success: false,
        message: `Authentication failed: ${error.message}`,
        error: error.message
      };
    }
  }

  async getAllUsers() {
    try {
      return await this.userRepository.find();
    } catch (error) {
      throw new Error(`Error retrieving users: ${error.message}`);
    }
  }

  async getUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      return await this.userRepository.findOne({ where: { id } });
    } catch (error) {
      throw new Error(`Error retrieving user: ${error.message}`);
    }
  }

  async updateUserById(id, updateData) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      if (!updateData || Object.keys(updateData).length === 0) {
        throw new Error("Update data is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        Object.assign(user, updateData);
        return await this.userRepository.save(user);
      }
      return null;
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  async deleteUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        await this.userRepository.remove(user);
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }

  /**
   * Authenticate user by face embedding
   * @param {number[]|number[][]} faceEmbeddingOrEmbeddings - Single or multiple embeddings
   * @param {Object} options - Authentication options
   * @returns {Object|null} Authentication result with user and token, or null
   */
  async findByEmbedding(faceEmbeddingOrEmbeddings, options = {}) {
    try {
      FaceUtils.logDebug('UserService', `Starting findByEmbedding search`);
      
      // Normalize input to array of embeddings
      let embeddings = Array.isArray(faceEmbeddingOrEmbeddings[0]) 
        ? faceEmbeddingOrEmbeddings 
        : [faceEmbeddingOrEmbeddings];

      // Validate and normalize embeddings
      embeddings = embeddings
        .filter(e => Array.isArray(e) && e.every(v => typeof v === 'number' && Number.isFinite(v)))
        .map(e => FaceUtils.normalize(e));

      if (embeddings.length === 0) {
        throw new Error("faceEmbedding(s) required");
      }

      // Use mean of input embeddings for matching
      const inputAggregate = FaceUtils.aggregateEmbeddings(embeddings);
      const queryEmbedding = inputAggregate.mean;

      const users = await this.userRepository.find();
      if (users.length === 0) {
        FaceUtils.logDebug('UserService', 'No users in database to compare against');
        return null;
      }

      // Ensure index is loaded
      if (!faceIndex.loaded) {
        try {
          await faceIndex.rebuild();
        } catch (e) {
          FaceUtils.logDebug('UserService', `Index rebuild failed: ${e.message}`);
        }
      }

      let matchResult = null;

      // Try index-based search first
      if (faceIndex.loaded) {
        try {
          const indexMatch = faceIndex.search(queryEmbedding, {
            threshold: FaceConfig.COSINE_DISTANCE_THRESHOLD,
            margin: FaceConfig.DISTANCE_MARGIN
          });

          if (indexMatch) {
            const matchedUser = users.find(u => u.id === indexMatch.id);
            if (matchedUser) {
              matchResult = {
                user: matchedUser,
                distance: indexMatch.distance,
                secondDistance: indexMatch.secondDistance,
                confidence: indexMatch.confidence,
                method: 'index'
              };
            }
          }
        } catch (e) {
          FaceUtils.logDebug('UserService', `Index search failed: ${e.message}`);
        }
      }

      // Fallback to linear search if no index match
      if (!matchResult) {
        const candidates = users.map(user => {
          let embeddings = [];
          if (user.faceEmbeddings && user.faceEmbeddings.samples) {
            embeddings = [
              user.faceEmbeddings.mean, 
              user.faceEmbeddings.median, 
              ...user.faceEmbeddings.samples.slice(0, 3)
            ];
          } else if (user.faceEmbedding) {
            embeddings = [user.faceEmbedding];
          }

          return {
            id: user.id,
            user: user,
            embeddings: embeddings.filter(emb => 
              Array.isArray(emb) && emb.length === queryEmbedding.length
            )
          };
        }).filter(candidate => candidate.embeddings.length > 0);

        FaceUtils.logDebug('UserService', `Linear search with ${candidates.length} candidates from ${users.length} total users`);
        FaceUtils.logDebug('UserService', `Query embedding length: ${queryEmbedding.length}`);
        
        candidates.forEach(candidate => {
          FaceUtils.logDebug('UserService', `Candidate ${candidate.id} (${candidate.user.firstName} ${candidate.user.lastName}): ${candidate.embeddings.length} embeddings`);
        });

        const bestMatch = FaceUtils.findBestMatch(queryEmbedding, candidates, {
          threshold: FaceConfig.COSINE_DISTANCE_THRESHOLD,
          margin: FaceConfig.DISTANCE_MARGIN
        });

        if (bestMatch) {
          matchResult = {
            user: bestMatch.match.user,
            distance: bestMatch.distance,
            secondDistance: bestMatch.secondDistance,
            confidence: bestMatch.confidence,
            method: 'linear'
          };
        }
      }

      FaceUtils.logDebug('UserService', {
        operation: 'findByEmbedding',
        inputEmbeddings: embeddings.length,
        totalUsers: users.length,
        matchFound: !!matchResult,
        method: matchResult?.method,
        distance: matchResult?.distance,
        confidence: matchResult?.confidence
      });

      // Generate token if match found
      if (matchResult) {
        const token = sign({
          id: matchResult.user.id,
          role: "user",
          firstName: matchResult.user.firstName,
          lastName: matchResult.user.lastName,
          createdAt: matchResult.user.createdAt,
        });

        return {
          user: matchResult.user,
          token: token,
          meta: FaceConfig.DEBUG_ENABLED ? {
            distance: matchResult.distance,
            secondDistance: matchResult.secondDistance,
            margin: matchResult.secondDistance - matchResult.distance,
            confidence: matchResult.confidence,
            threshold: FaceConfig.COSINE_DISTANCE_THRESHOLD,
            marginRequired: FaceConfig.DISTANCE_MARGIN,
            method: matchResult.method
          } : undefined
        };
      }

      return null;
    } catch (error) {
      throw new Error(`Error finding user by embedding: ${error.message}`);
    }
  }

  /**
   * Login user with face embedding (alias for findByEmbedding)
   */
  async login(faceEmbedding) {
    return await this.findByEmbedding(faceEmbedding);
  }

  async getAllUsers() {
    try {
      return await this.userRepository.find();
    } catch (error) {
      throw new Error(`Error retrieving users: ${error.message}`);
    }
  }

  async getUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      return await this.userRepository.findOne({ where: { id } });
    } catch (error) {
      throw new Error(`Error retrieving user: ${error.message}`);
    }
  }

  async updateUserById(id, updateData) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      if (!updateData || Object.keys(updateData).length === 0) {
        throw new Error("Update data is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        Object.assign(user, updateData);
        const updated = await this.userRepository.save(user);
        
        // Update face index if face data changed
        if (updateData.faceEmbedding || updateData.faceEmbeddings) {
          try {
            faceIndex.addUser(updated);
          } catch (e) {
            FaceUtils.logDebug('UserService', `Failed to update user in index: ${e.message}`);
          }
        }
        
        return updated;
      }
      return null;
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  async deleteUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        await this.userRepository.remove(user);
        
        // Remove from face index
        try {
          faceIndex.removeUser(id);
        } catch (e) {
          FaceUtils.logDebug('UserService', `Failed to remove user from index: ${e.message}`);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }
}

module.exports = new UserService();
