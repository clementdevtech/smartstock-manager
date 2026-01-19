const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const {
  createSale,
  getSales,
  getSaleById,
  getDailySummary,
  deleteSale,
} = require('../controllers/salesController');

// Protected routes
router.route('/')
  .get(protect, getSales)        // Get all sales (with filters or pagination)
  .post(protect, createSale);    // Create a new sale

router.route('/summary/daily')
  .get(protect, getDailySummary); // Get daily report for dashboard

router.route('/:id')
  .get(protect, getSaleById)      // Get one sale
  .delete(protect, deleteSale);   // Delete a sale

module.exports = router;
