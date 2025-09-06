const bcrypt = require("bcrypt");
const { sign } = require("../utils/jwt.js");
const { Admin } = require("../entities/Admin.js");
const { AppDataSource } = require("../config/data-source.js");

class AdminService {
  constructor() {
    this.adminRepository = AppDataSource.getRepository(Admin);
  }
  async createAdmin(username, password, role = "admin") {
    try {
      const existingAdmin = await this.findByUsername(username);
      if (existingAdmin) {
        throw new Error("Admin with this username already exists");
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = this.adminRepository.create({
        username,
        password: hashedPassword,
        role,
      });
      return await this.adminRepository.save(newAdmin);
    } catch (error) {
      throw new Error(`Error creating admin: ${error.message}`);
    }
  }

  async login(username, password) {
    try {
      const admin = await this.findByUsername(username);
      if (!admin) {
        return null;
      }
      const isMatch = await bcrypt.compare(password, admin.password);
      if (isMatch) {
        const { password: _, ...adminWithoutPassword } = admin;
        const token = sign({
          id: admin.id,
          role: admin.role,
          username: admin.username,
          createdAt: admin.createdAt,
        });
        return { token: token };
      }
      return null;
    } catch (error) {
      throw new Error(`Error during admin login: ${error.message}`);
    }
  }

  async getAllAdmins() {
    try {
      const admins = await this.adminRepository.find();
      return admins.map((admin) => {
        const { password, ...adminWithoutPassword } = admin;
        return adminWithoutPassword;
      });
    } catch (error) {
      throw new Error(`Error retrieving admins: ${error.message}`);
    }
  }

  async findByUsername(username) {
    return await this.adminRepository.findOne({ where: { username } });
  }
}

module.exports = new AdminService();
