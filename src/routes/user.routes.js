const { Router } = require("express");
const controller = require("../controllers/user.controller.js");
const { validateUserInput } = require("../middleware/validation.js");
const { authenticate } = require("../middleware/auth.middleware.js");
const { requireRole } = require("../middleware/role.middleware.js");
const router = Router();

router.post("/login", validateUserInput, controller.login);

router.get("/", authenticate, requireRole(["admin"]), controller.getAllUsers);

router.post("/register", authenticate, requireRole(["admin"]), validateUserInput, controller.register);

router.get("/:id", authenticate, requireRole(["admin"]), validateUserInput, controller.getUserById);
router.put("/:id", authenticate, requireRole(["admin"]), validateUserInput, controller.updateUserById);
router.delete("/:id", authenticate, requireRole(["admin"]), validateUserInput, controller.deleteUserById);

module.exports = router;
