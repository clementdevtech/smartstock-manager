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
  .get(protect, getSales)
  .post(protect, createSale);

router.route('/summary/daily')
  .get(protect, getDailySummary);

router.route('/:id')
  .get(protect, getSaleById)
  .delete(protect, deleteSale);

module.exports = router;
