const mongoose = require("mongoose");

const LicensedUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  productKey: {
    type: String,
    required: true,
  },
  activated: {
    type: Boolean,
    default: false,
  },
  activatedAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("LicensedUser", LicensedUserSchema);
