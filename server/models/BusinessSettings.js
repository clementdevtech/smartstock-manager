const mongoose = require("mongoose");

const BusinessSettingsSchema = new mongoose.Schema({
  name: String,
  address: String,
  phone: String,
  email: String,
});

module.exports = mongoose.model("BusinessSettings", BusinessSettingsSchema);
