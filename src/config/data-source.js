require("dotenv").config();
require("reflect-metadata");
const { DataSource } = require("typeorm");
const { User } = require("../entities/User.js");

if (
  !process.env.DB_PORT ||
  !process.env.DB_NAME ||
  !process.env.DB_PASSWORD ||
  !process.env.DB_HOST ||
  !process.env.DB_USERNAME
) {
  throw new Error("Database configuration is not set in environment variables");
}

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  entities: [User],
});

module.exports = { AppDataSource };
