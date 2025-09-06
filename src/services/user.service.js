const { User } = require("../entities/User.js");
const { AppDataSource } = require("../config/data-source.js");
const { sign } = require("../utils/jwt.js");

// Configurable threshold & debug flag via environment variables
// Adjust FACE_MATCH_THRESHOLD in your .env (e.g., 0.75 for more tolerance, 0.5 for stricter)
const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || "0.6");
const FACE_DEBUG = process.env.FACE_DEBUG === "1"; // enable detailed matching logs

class UserService {
  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createUser(firstName, lastName, faceEmbedding) {
    try {
      const newUser = this.userRepository.create({
        firstName,
        lastName,
        faceEmbedding,
      });
      return await this.userRepository.save(newUser);
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

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

  async findByEmbedding(faceEmbedding) {
    try {
      // Basic input validation
      if (!faceEmbedding || !Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
        throw new Error("faceEmbedding (non-empty array) is required");
      }

      if (!faceEmbedding.every((v) => typeof v === "number" && Number.isFinite(v))) {
        throw new Error("faceEmbedding must be an array of finite numbers");
      }

      // (Optional) Normalize embedding to unit length for more stable distance (comment out if undesired)
      const normalizedInput = this.normalize(faceEmbedding);

      const users = await this.userRepository.find();
      if (users.length === 0) {
        if (FACE_DEBUG) console.warn("[FaceID] No users in database to compare against.");
        return null;
      }

      let closestUser = null;
      let minDistance = Infinity;
      const threshold = FACE_MATCH_THRESHOLD;
      const inspected = [];

      users.forEach((user) => {
        if (!user.faceEmbedding || !Array.isArray(user.faceEmbedding)) return;

        // Ensure both arrays have the same length
        if (user.faceEmbedding.length !== faceEmbedding.length) {
          if (FACE_DEBUG)
            inspected.push({ id: user.id, reason: "length-mismatch", storedLen: user.faceEmbedding.length, inputLen: faceEmbedding.length });
          return;
        }

        // Normalize stored embedding similarly (defensive copy)
        const storedNorm = this.normalize(user.faceEmbedding);
        const distance = this.euclideanDistance(storedNorm, normalizedInput);
        inspected.push({ id: user.id, distance });

        // Find the closest match under the threshold
        if (distance < threshold && distance < minDistance) {
          minDistance = distance;
          closestUser = user;
        }
      });

      if (FACE_DEBUG) {
        // Sort inspected by ascending distance (filter those that have distance)
        const ranked = inspected
          .filter((i) => typeof i.distance === "number")
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5);
        console.log(
          `[FaceID] Evaluated ${inspected.length} embeddings. Threshold=${threshold}. Top candidates:`,
          ranked
        );
        if (!closestUser) console.log("[FaceID] No candidate under threshold.");
        else console.log(`[FaceID] Selected user ${closestUser.id} distance=${minDistance}`);
      }

      // If user is found, generate JWT token
      if (closestUser) {
        const token = sign({
          id: closestUser.id,
          role: "user",
          firstName: closestUser.firstName,
          lastName: closestUser.lastName,
          createdAt: closestUser.createdAt,
        });

        return {
          user: closestUser,
          token: token,
          meta: FACE_DEBUG
            ? { distance: minDistance, threshold: FACE_MATCH_THRESHOLD }
            : undefined,
        };
      }

      return null;
    } catch (error) {
      throw new Error(`Error finding user by embedding: ${error.message}`);
    }
  }

  euclideanDistance(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
      throw new Error("Both inputs must be arrays");
    }

    if (arr1.length !== arr2.length) {
      throw new Error("Arrays must have the same length");
    }

    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
      if (typeof arr1[i] !== "number" || typeof arr2[i] !== "number") {
        throw new Error("All array elements must be numbers");
      }
      sum += Math.pow(arr1[i] - arr2[i], 2);
    }
    return Math.sqrt(sum);
  }

  normalize(arr) {
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
    if (!norm || !Number.isFinite(norm)) return arr.slice(); // fallback: return copy
    return arr.map((v) => v / norm);
  }
}

module.exports = new UserService();
