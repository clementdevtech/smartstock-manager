const mongoose = require("mongoose");

const verificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true } // for manual expiration check
});

module.exports = mongoose.model("VerificationCode", verificationCodeSchema);
