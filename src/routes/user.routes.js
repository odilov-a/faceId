const { Router } = require("express");
const controller = require("../controllers/user.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");
const { requireRole } = require("../middleware/role.middleware.js");
const faceIndex = require('../services/face-index.js');
const { rateLimit, validateFacePayload } = require("../middleware/rateLimit.middleware.js");
const router = Router();

router.post("/login", rateLimit, validateFacePayload, controller.login);

router.get("/", authenticate, requireRole(["admin"]), controller.getAllUsers);

router.post("/register", authenticate, requireRole(["admin"]), validateFacePayload, controller.register);

// Rebuild face index (admin only)
router.post('/face-index/rebuild', authenticate, requireRole(['admin']), async (req,res)=>{
	try {
		const stats = await faceIndex.rebuild();
	res.json({ message: 'Face index rebuilt', stats });
	} catch (e) {
		res.status(500).json({ error: e.message });
	}
});

// Current user profile
router.get("/me", authenticate, requireRole(["user","admin"]), controller.getMe);

router.get("/:id", authenticate, requireRole(["admin", "user"]), controller.getUserById);
router.put("/:id", authenticate, requireRole(["admin", "user"]), controller.updateUserById);
router.delete("/:id", authenticate, requireRole(["admin", "user"]), controller.deleteUserById);

module.exports = router;
