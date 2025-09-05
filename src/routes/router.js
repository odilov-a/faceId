const { Router } = require("express");
const userRoutes = require("./user.routes.js");
const router = Router();

router.use("/users", userRoutes);

module.exports = router;
