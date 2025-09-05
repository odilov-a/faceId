const userService = require("../services/user.service.js");

class UserController {
  async register(req, res) {
    try {
      const { firstName, lastName, faceEmbedding } = req.body;
      const user = await userService.createUser(
        firstName.trim(),
        lastName.trim(),
        faceEmbedding
      );
      return res.status(201).json({ data: user });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async login(req, res) {
    try {
      const { faceEmbedding } = req.body;
      const user = await userService.findByEmbedding(faceEmbedding);
      if (!user) {
        return res.status(401).json({ message: "FaceID not recognized" });
      }
      return res.json({ data: user });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getAllUsers(req, res) {
    try {
      const users = await userService.getAllUsers();
      return res.json({ data: users });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getUserById(req, res) {
    try {
      const user = await userService.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found!" });
      }
      return res.json({ data: user });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateUserById(req, res) {
    try {
      const user = await userService.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found!" });
      }
      const { firstName, lastName, faceEmbedding } = req.body;

      const updateData = {};
      if (firstName) updateData.firstName = firstName.trim();
      if (lastName) updateData.lastName = lastName.trim();
      if (faceEmbedding) updateData.faceEmbedding = faceEmbedding;

      const updatedUser = await userService.updateUserById(
        req.params.id,
        updateData
      );
      return res.json({ data: updatedUser });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteUserById(req, res) {
    try {
      const deleted = await userService.deleteUserById(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "User not found!" });
      }
      return res.json({ message: "User deleted successfully!" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UserController();
