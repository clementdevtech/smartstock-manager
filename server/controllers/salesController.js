/**
 * server/controllers/salesController.js
 * Handles POS logic and sales tracking for SmartStock Manager Pro
 */

const asyncHandler = require('express-async-handler');
const Sale = require('../models/Sale');
const Item = require('../models/Item');

// @desc    Create a new sale (POS transaction)
// @route   POST /api/sales
// @access  Private
const createSale = asyncHandler(async (req, res) => {
  const { items, paymentStatus, customerName } = req.body;

  if (!items || items.length === 0) {
    res.status(400);
    throw new Error('No sale items provided');
  }

  // Calculate totals
  const totalAmount = items.reduce((sum, i) => sum + i.total, 0);
  const totalProfit = items.reduce((sum, i) => sum + i.profit, 0);

  // Create sale document
  const sale = new Sale({
    items,
    totalAmount,
    totalProfit,
    paymentStatus: paymentStatus || 'paid',
    customerName: customerName || 'Walk-in Customer',
    createdBy: req.user.id,
  });

  const savedSale = await sale.save();

  // Deduct quantities from inventory
  for (const sold of items) {
    const item = await Item.findById(sold.item);
    if (item) {
      item.quantity -= sold.quantity;
      if (item.quantity < 0) item.quantity = 0;
      await item.save();
    }
  }

  res.status(201).json(savedSale);
});

// @desc    Get all sales
// @route   GET /api/sales
// @access  Private
const getSales = asyncHandler(async (req, res) => {
  const sales = await Sale.find({ createdBy: req.user.id })
    .populate('items.item', 'name category')
    .sort({ createdAt: -1 });

  res.json(sales);
});

// @desc    Get single sale by ID
// @route   GET /api/sales/:id
// @access  Private
const getSaleById = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('items.item');

  if (!sale) {
    res.status(404);
    throw new Error('Sale not found');
  }

  if (sale.createdBy.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to view this sale');
  }

  res.json(sale);
});

// @desc    Delete sale
// @route   DELETE /api/sales/:id
// @access  Private
const deleteSale = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id);

  if (!sale) {
    res.status(404);
    throw new Error('Sale not found');
  }

  if (sale.createdBy.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to delete this sale');
  }

  await sale.deleteOne();
  res.json({ message: 'Sale removed successfully' });
});

// @desc    Get daily summary (for dashboard cards)
// @route   GET /api/sales/summary/daily
// @access  Private
const getDailySummary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const todaySales = await Sale.find({
    createdBy: req.user.id,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const totalSales = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalProfit = todaySales.reduce((sum, s) => sum + s.totalProfit, 0);
  const itemsSold = todaySales.reduce(
    (sum, s) => sum + s.items.reduce((acc, i) => acc + i.quantity, 0),
    0
  );
  const transactions = todaySales.length;

  res.json({
    totalSales,
    totalProfit,
    itemsSold,
    transactions,
    date: startOfDay,
  });
});

module.exports = {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
  getDailySummary,
};
