const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();
const { AppDataSource } = require("./src/config/data-source.js");
const router = require("./src/routes/router.js");

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.PORT) {
  console.error("PORT environment variable is not set.");
  process.exit(1);
}

app.use("/", router);
app.get("/", (req, res) => {
  return res.send({ message: `API is working on port ${process.env.PORT}` });
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
