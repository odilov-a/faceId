const validateFaceEmbedding = (faceEmbedding) => {
  if (!faceEmbedding) {
    return { isValid: false, message: "Face embedding is required!" };
  }

  if (!Array.isArray(faceEmbedding)) {
    return { isValid: false, message: "Face embedding must be an array!" };
  }

  if (faceEmbedding.length === 0) {
    return {
      isValid: false,
      message: "Face embedding must be a non-empty array!",
    };
  }

  // Check if all values are valid numbers
  const hasInvalidValues = !faceEmbedding.every(
    (val) => typeof val === "number" && !isNaN(val) && isFinite(val)
  );

  if (hasInvalidValues) {
    return {
      isValid: false,
      message: "Face embedding must contain only valid numbers!",
    };
  }

  return { isValid: true };
};

const validateUserInput = (req, res, next) => {
  const { firstName, lastName, faceEmbedding } = req.body;

  // Validate required fields for registration
  if (req.path.includes("register") || req.method === "POST") {
    if (
      !firstName ||
      typeof firstName !== "string" ||
      firstName.trim().length === 0
    ) {
      return res
        .status(400)
        .json({
          message: "First name is required and must be a non-empty string!",
        });
    }

    if (
      !lastName ||
      typeof lastName !== "string" ||
      lastName.trim().length === 0
    ) {
      return res
        .status(400)
        .json({
          message: "Last name is required and must be a non-empty string!",
        });
    }

    if (firstName.length > 100) {
      return res
        .status(400)
        .json({ message: "First name must be 100 characters or less!" });
    }

    if (lastName.length > 100) {
      return res
        .status(400)
        .json({ message: "Last name must be 100 characters or less!" });
    }

    const embeddingValidation = validateFaceEmbedding(faceEmbedding);
    if (!embeddingValidation.isValid) {
      return res.status(400).json({ message: embeddingValidation.message });
    }
  }

  // Validate face embedding for login
  if (req.path.includes("login")) {
    const embeddingValidation = validateFaceEmbedding(faceEmbedding);
    if (!embeddingValidation.isValid) {
      return res.status(400).json({ message: embeddingValidation.message });
    }
  }

  // Validate UUID format for params
  if (req.params.id) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID format!" });
    }
  }

  next();
};

const validateAdminInput = (req, res, next) => {
  const { username, password, role, oldPassword, newPassword } = req.body;

  // Validate required fields for registration
  if (req.path.includes('register')) {
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ message: "Username is required and must be a non-empty string!" });
    }

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return res.status(400).json({ message: "Password is required and must be a non-empty string!" });
    }

    if (username.length > 100) {
      return res.status(400).json({ message: "Username must be 100 characters or less!" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long!" });
    }

    if (role && typeof role !== 'string') {
      return res.status(400).json({ message: "Role must be a string!" });
    }
  }

  // Validate login fields
  if (req.path.includes('login')) {
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ message: "Username is required!" });
    }

    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      return res.status(400).json({ message: "Password is required!" });
    }
  }

  // Validate password change fields
  if (req.path.includes('change-password')) {
    if (!oldPassword || typeof oldPassword !== 'string' || oldPassword.trim().length === 0) {
      return res.status(400).json({ message: "Old password is required!" });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length === 0) {
      return res.status(400).json({ message: "New password is required!" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters long!" });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from old password!" });
    }
  }

  // Validate UUID format for params
  if (req.params.id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id)) {
      return res.status(400).json({ message: "Invalid admin ID format!" });
    }
  }

  next();
};

module.exports = {
  validateUserInput,
  validateFaceEmbedding,
  validateAdminInput
};
