const express = require("express");
const router = express.Router();
const {
  sendVerification,
  verifyCode,
  checkEmail,
  registerUser,
  validateInvite,
  loginUser
} = require("../controllers/authController");

router.post("/send-verification", sendVerification);
router.post("/verify-code", verifyCode);
router.post("/check-email", checkEmail);
router.post("/validate-invite", validateInvite);
router.post("/register", registerUser);

router.post('/login', loginUser);

module.exports = router;