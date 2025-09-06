const { Router } = require("express");
const controller = require("../controllers/user.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");
const { requireRole } = require("../middleware/role.middleware.js");
const router = Router();

router.post("/login", controller.login);

router.get("/", authenticate, requireRole(["admin"]), controller.getAllUsers);

router.post("/register", authenticate, requireRole(["admin"]), controller.register);

// Current user profile
router.get("/me", authenticate, requireRole(["user","admin"]), controller.getMe);

router.get("/:id", authenticate, requireRole(["admin", "user"]), controller.getUserById);
router.put("/:id", authenticate, requireRole(["admin", "user"]), controller.updateUserById);
router.delete("/:id", authenticate, requireRole(["admin", "user"]), controller.deleteUserById);

module.exports = router;
