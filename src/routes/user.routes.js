const { Router } = require("express");
const multer = require("multer");
const controller = require("../controllers/user.controller.js");
const { authenticate } = require("../middleware/auth.middleware.js");
const { requireRole } = require("../middleware/role.middleware.js");
const faceIndex = require('../services/face-index.js');
const { rateLimit, validateFacePayload } = require("../middleware/rateLimit.middleware.js");
const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 5 // Maximum 5 files for registration
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Legacy endpoints
router.post("/login", rateLimit, validateFacePayload, controller.login);
router.post("/register", authenticate, requireRole(["admin"]), validateFacePayload, controller.register);

// Enhanced image-based endpoints
router.post("/login/image", rateLimit, upload.single('faceImage'), controller.loginWithImage);
router.post("/register/image", authenticate, requireRole(["admin"]), upload.array('faceImages', 5), controller.registerWithImages);

router.get("/", authenticate, requireRole(["admin"]), controller.getAllUsers);

router.post("/register/image", authenticate, requireRole(["admin"]), upload.array('faceImages', 5), controller.registerWithImages);

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
