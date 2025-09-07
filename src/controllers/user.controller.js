const userService = require("../services/user.service.js");
const { FaceUtils } = require("../utils/face-utils.js");

class UserController {
  /**
   * Register a new user with face embeddings
   */
  async register(req, res) {
    try {
      const { firstName, lastName, faceEmbedding, faceEmbeddings } = req.body;
      
      // Validate required fields
      if (!firstName?.trim() || !lastName?.trim()) {
        return res.status(400).json({ 
          error: "First name and last name are required" 
        });
      }

      // Check for face embeddings
      const embeddingsInput = faceEmbeddings || faceEmbedding;
      if (!embeddingsInput) {
        return res.status(400).json({ 
          error: "Face embeddings are required for registration" 
        });
      }

      const user = await userService.createUser(
        firstName.trim(),
        lastName.trim(),
        embeddingsInput
      );
      
      // Remove sensitive data from response
      const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = user;
      
      return res.status(201).json({ 
        success: true,
        message: "User registered successfully",
        data: safeUser 
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `Registration failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Login user with face embeddings
   */
  async login(req, res) {
    try {
      const { faceEmbedding, faceEmbeddings } = req.body;
      
      // Check for face embeddings
      const embeddingsInput = faceEmbeddings || faceEmbedding;
      if (!embeddingsInput) {
        return res.status(400).json({ 
          error: "Face embeddings are required for login" 
        });
      }

      const result = await userService.findByEmbedding(embeddingsInput);
      
      if (!result) {
        FaceUtils.logDebug('UserController', 'Face ID not recognized');
        return res.status(401).json({ 
          success: false,
          message: "Face ID not recognized. Please ensure you are registered in the system." 
        });
      }

      // Remove sensitive data from response
      const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = result.user;
      
      return res.json({ 
        success: true,
        message: "Login successful",
        data: safeUser, 
        token: result.token,
        ...(result.meta && { meta: result.meta })
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `Login failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Get all users (admin function)
   */
  async getAllUsers(req, res) {
    try {
      const users = await userService.getAllUsers();
      
      // Remove sensitive face data from all users
      const safeUsers = users.map(user => {
        const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = user;
        return safeUser;
      });
      
      return res.json({ 
        success: true,
        data: safeUsers,
        count: safeUsers.length
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `GetAllUsers failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ 
          error: "User ID is required",
          success: false 
        });
      }

      const user = await userService.getUserById(id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false,
          message: "User not found" 
        });
      }

      // Remove sensitive data
      const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = user;
      
      return res.json({ 
        success: true,
        data: safeUser 
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `GetUserById failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Update user by ID
   */
  async updateUserById(req, res) {
    try {
      const { id } = req.params;
      const { firstName, lastName, faceEmbedding, faceEmbeddings } = req.body;

      if (!id) {
        return res.status(400).json({ 
          error: "User ID is required",
          success: false 
        });
      }

      const user = await userService.getUserById(id);
      if (!user) {
        return res.status(404).json({ 
          success: false,
          message: "User not found" 
        });
      }

      // Build update data
      const updateData = {};
      if (firstName?.trim()) updateData.firstName = firstName.trim();
      if (lastName?.trim()) updateData.lastName = lastName.trim();
      
      // Handle face embeddings update
      if (faceEmbeddings || faceEmbedding) {
        const embeddingsInput = faceEmbeddings || faceEmbedding;
        
        // For face embedding updates, we need to process them properly
        if (Array.isArray(embeddingsInput[0])) {
          // Multiple embeddings
          updateData.faceEmbeddings = embeddingsInput;
        } else {
          // Single embedding
          updateData.faceEmbedding = embeddingsInput;
        }
        updateData.lastEmbeddingUpdate = new Date();
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ 
          error: "No valid update data provided",
          success: false 
        });
      }

      const updatedUser = await userService.updateUserById(id, updateData);
      
      // Remove sensitive data
      const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = updatedUser;
      
      return res.json({ 
        success: true,
        message: "User updated successfully",
        data: safeUser 
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `UpdateUser failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Delete user by ID
   */
  async deleteUserById(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ 
          error: "User ID is required",
          success: false 
        });
      }

      const deleted = await userService.deleteUserById(id);
      
      if (!deleted) {
        return res.status(404).json({ 
          success: false,
          message: "User not found" 
        });
      }

      return res.json({ 
        success: true,
        message: "User deleted successfully" 
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `DeleteUser failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }

  /**
   * Get current authenticated user's data
   */
  async getMe(req, res) {
    try {
      const userId = req.userId; // Set by auth middleware
      
      if (!userId) {
        return res.status(401).json({ 
          success: false,
          message: "Unauthorized - no user ID found" 
        });
      }

      const user = await userService.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false,
          message: "User not found" 
        });
      }

      // Remove sensitive data
      const { faceEmbedding: _removed, faceEmbeddings: _removedEmbeddings, ...safeUser } = user;
      
      return res.json({ 
        success: true,
        data: safeUser 
      });
    } catch (error) {
      FaceUtils.logDebug('UserController', `GetMe failed: ${error.message}`);
      return res.status(500).json({ 
        error: error.message,
        success: false 
      });
    }
  }
}

module.exports = new UserController();
