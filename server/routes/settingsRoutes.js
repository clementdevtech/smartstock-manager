const express = require("express");
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getBusinessSettings,
  updateBusinessSettings,
} = require("../controllers/settingsController");

router.get("/", protect, getBusinessSettings);
router.put("/business", protect, updateBusinessSettings);

module.exports = router;
