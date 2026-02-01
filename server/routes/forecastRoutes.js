const express = require("express");
const router = express.Router();

const { getForecast } = require("../controllers/forecastController");
const { protect } = require("../middleware/authMiddleware");

/* =====================================================
   🔮 SALES FORECAST ROUTES
===================================================== */

/**
 * @route   GET /api/forecast
 * @desc    Forecast next sales period (based on last 6 months)
 * @access  Private (Admin)
 */
router.get("/", protect, getForecast);

module.exports = router;
