const express = require("express");
const router = express.Router();

const {
  balanceSheet,
  cashVsCredit,
  employeeExpenseReport,
  targetProgress,
  forecast,
  profitLeaks,
  exportCSV,
  generateAutoTarget,
} = require("../controllers/reportController");

const { protect } = require("../middleware/authMiddleware");

/* ===================== REPORT ROUTES ===================== */

router.get("/balance-sheet", protect, balanceSheet);
router.get("/cash-vs-credit", protect, cashVsCredit);
router.get("/employees", protect, employeeExpenseReport);
router.get("/target-progress", protect, targetProgress);
router.get("/forecast", protect, forecast);
router.get("/profit-leaks", protect, profitLeaks);
router.get("/export/:table", protect, exportCSV);
router.post("/auto", protect, generateAutoTarget);

module.exports = router;
