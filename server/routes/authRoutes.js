const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// EMAIL
router.get("/check-email", auth.checkEmailExists);
router.post("/send-verification-email", auth.sendVerificationEmail);
router.post("/verify-email-code", auth.verifyEmailCode);

// PASSWORD RESET (NEW + REQUIRED)
router.post("/request-password-reset", auth.requestPasswordReset);
router.post("/resend-code", auth.resendResetCode);
router.post("/verify-reset-code", auth.verifyResetCode);
router.post("/reset-password", auth.resetPassword);

// PRODUCT KEY
router.get("/validate-key", auth.validateProductKey);
router.post("/assign-key", auth.assignProductKeyToEmail);

// INVITE
router.get("/validate-invite", auth.validateInviteCode);

// REGISTER
router.post("/register", auth.register);

// LOGIN
router.post("/login", auth.loginUser);

//me 
router.get("/me", protect, (req, res) => {
  res.json(req.user);
});


module.exports = router;
