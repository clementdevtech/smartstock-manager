/**
 * server/controllers/salesController.js
 * OFFLINE-FIRST POS logic for SmartStock Manager Pro
 */

const asyncHandler = require("express-async-handler");
const db = require("../db/sqlite"); // ✅ local SQLite wrapper

/* =====================================================
   @desc    Create a new sale (OFFLINE POS)
   @route   POST /api/sales
   @access  Private
===================================================== */
const createSale = asyncHandler(async (req, res) => {
  const { items, paymentType, customerName } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("No sale items provided");
  }

  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;
  const cashierId = req.user.id;

  let subtotal = 0;

  // 🔐 Validate stock locally
  for (const sold of items) {
    const item = db.get(
      `SELECT * FROM local_items WHERE id = ? AND storeId = ? AND adminId = ?`,
      [sold.itemId, storeId, adminId]
    );

    if (!item) {
      res.status(403);
      throw new Error("Invalid item or unauthorized access");
    }

    if (item.quantity < sold.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for ${item.name}`);
    }

    subtotal += item.retailPrice * sold.quantity;
  }

  const tax = 0; // configurable later
  const total = subtotal + tax;
  const receiptNo = `R-${Date.now()}`;

  // 🔄 TRANSACTION (ATOMIC OFFLINE SALE)
  db.transaction(() => {
    // 1️⃣ Save sale to offline queue
    db.run(
      `
      INSERT INTO offline_sales (
        receiptNo,
        items,
        subtotal,
        tax,
        total,
        paymentType,
        paymentStatus,
        cashierId,
        storeId,
        adminId,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        receiptNo,
        JSON.stringify(items),
        subtotal,
        tax,
        total,
        paymentType || "cash",
        "paid",
        cashierId,
        storeId,
        adminId,
        "pending", // 🔥 waiting for sync
      ]
    );

    // 2️⃣ Deduct inventory locally
    for (const sold of items) {
      db.run(
        `
        UPDATE local_items
        SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND storeId = ? AND adminId = ?
      `,
        [sold.quantity, sold.itemId, storeId, adminId]
      );
    }
  });

  res.status(201).json({
    message: "Sale completed (offline)",
    receiptNo,
    total,
    customerName: customerName || "Walk-in Customer",
  });
});

/* =====================================================
   @desc    Get all local sales (OFFLINE)
===================================================== */
const getSales = asyncHandler(async (req, res) => {
  const sales = db.all(
    `
    SELECT * FROM offline_sales
    WHERE storeId = ? AND adminId = ?
    ORDER BY createdAt DESC
  `,
    [req.user.storeId, req.user.adminId || req.user.id]
  );

  // parse items JSON
  const formatted = sales.map(s => ({
    ...s,
    items: JSON.parse(s.items),
  }));

  res.json(formatted);
});

/* =====================================================
   @desc    Get single sale
===================================================== */
const getSaleById = asyncHandler(async (req, res) => {
  const sale = db.get(
    `
    SELECT * FROM offline_sales
    WHERE id = ? AND storeId = ?
  `,
    [req.params.id, req.user.storeId]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  sale.items = JSON.parse(sale.items);
  res.json(sale);
});

/* =====================================================
   @desc    Delete sale (OFFLINE SAFE)
===================================================== */
const deleteSale = asyncHandler(async (req, res) => {
  const sale = db.get(
    `SELECT * FROM offline_sales WHERE id = ?`,
    [req.params.id]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  if (sale.cashierId !== req.user.id) {
    res.status(401);
    throw new Error("Not authorized");
  }

  db.run(`DELETE FROM offline_sales WHERE id = ?`, [req.params.id]);
  res.json({ message: "Sale deleted locally" });
});

/* =====================================================
   @desc    Daily summary (OFFLINE DASHBOARD)
===================================================== */
const getDailySummary = asyncHandler(async (req, res) => {
  const summary = db.get(
    `
    SELECT
      COUNT(*) as transactions,
      SUM(total) as totalSales
    FROM offline_sales
    WHERE DATE(createdAt) = DATE('now')
      AND storeId = ?
      AND adminId = ?
  `,
    [req.user.storeId, req.user.adminId || req.user.id]
  );

  res.json({
    totalSales: summary.totalSales || 0,
    transactions: summary.transactions || 0,
    date: new Date(),
  });
});

module.exports = {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
  getDailySummary,
};
