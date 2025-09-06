const adminService = require("../services/admin.service.js");

class AdminController {
  async register(req, res) {
    try {
      const { username, password } = req.body;
      const admin = await adminService.createAdmin(username, password);
      return res.status(201).json({ data: admin });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async login(req, res) {
    try {
      const { username, password } = req.body;
      const result = await adminService.login(username, password);
      if (!result) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      return res.json({ token: result.token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getAllAdmins(req, res) {
    try {
      const admins = await adminService.getAllAdmins();
      return res.json({ data: admins });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AdminController();
