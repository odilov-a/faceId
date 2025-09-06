require("dotenv").config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_DATE = process.env.JWT_SECRET_DATE;

if (!JWT_SECRET || !JWT_SECRET_DATE) {
  throw new Error("JWT_SECRET or JWT_SECRET_DATE is not defined in the environment variables");
}

exports.sign = (payload, options = {}) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_SECRET_DATE, ...options });
};

exports.verify = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error("Token verification failed");
  }
};