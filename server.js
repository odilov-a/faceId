const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
dotenv.config();
const { AppDataSource } = require("./src/config/data-source.js");
const router = require("./src/routes/router.js");

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

if (!process.env.PORT) {
  console.error("PORT environment variable is not set.");
  process.exit(1);
}

app.use("/api", router);
app.get("/status", (req, res) => {
  return res.send({ message: `API is working on port ${process.env.PORT}` });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected successfully");
    
    app.listen(process.env.PORT, () => {
      console.log(`API is running on port ${process.env.PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });
