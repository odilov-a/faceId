const { Router } = require("express");
const controller = require("../controllers/user.controller.js");
const { validateUserInput } = require("../middleware/validation.js");
const router = Router();

router.get("/", controller.getAllUsers);
router.post("/login", validateUserInput, controller.login);
router.post("/register", validateUserInput, controller.register);

router.get("/:id", validateUserInput, controller.getUserById);
router.put("/:id", validateUserInput, controller.updateUserById);
router.delete("/:id", validateUserInput, controller.deleteUserById);

module.exports = router;
