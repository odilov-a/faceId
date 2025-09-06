const { Router } = require("express");
const controller = require("../controllers/admin.controller.js");
const { validateAdminInput } = require("../middleware/validation.js");
const { authenticate } = require("../middleware/auth.middleware.js");
const { requireRole } = require("../middleware/role.middleware.js");
const router = Router();

router.post("/login", validateAdminInput, controller.login);
router.post("/register", validateAdminInput, controller.register);

router.get("/", authenticate, requireRole(["admin"]), controller.getAllAdmins);

module.exports = router;
