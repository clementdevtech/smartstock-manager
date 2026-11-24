const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const {
  createSale,
  getSales,
  getSaleById,
  getDailySummary,
  getReceivables,
  addSaleReceipt,
  deleteSale,
} = require('../controllers/salesController');

// Protected routes
router.route('/')
  .get(protect, getSales)
  .post(protect, createSale);

router.route('/summary/daily')
  .get(protect, getDailySummary);

router.get('/receivables', protect, getReceivables);

router.post('/:saleId/receipts', protect, addSaleReceipt);

router.route('/:id')
  .get(protect, getSaleById)
  .delete(protect, deleteSale);

module.exports = router;
