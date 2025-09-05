const { User } = require("../entities/User.js");
const { AppDataSource } = require("../config/data-source.js");

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
      const users = await this.userRepository.find();
      let closestUser = null;
      let minDistance = Infinity;
      const threshold = 0.6;

      users.forEach((user) => {
        if (!user.faceEmbedding || !Array.isArray(user.faceEmbedding)) return;

        // Ensure both arrays have the same length
        if (user.faceEmbedding.length !== faceEmbedding.length) return;

        const distance = this.euclideanDistance(
          user.faceEmbedding,
          faceEmbedding
        );

        // Find the closest match under the threshold
        if (distance < threshold && distance < minDistance) {
          minDistance = distance;
          closestUser = user;
        }
      });

      return closestUser;
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
}

module.exports = new UserService();
