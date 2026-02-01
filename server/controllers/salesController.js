const asyncHandler = require("express-async-handler");
const db = require("../sqlite");

/* =====================================================
   @desc    Create a new sale (OFFLINE POS)
   @route   POST /api/sales
   @access  Private
===================================================== */
const createSale = asyncHandler(async (req, res) => {
  const { items, paymentType, customerName } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("No sale items provided");
  }

  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;
  const cashierId = req.user.id;

  let subtotal = 0;

  /* ===============================
     🔐 VALIDATE STOCK (LOCAL)
  ============================== */
  for (const sold of items) {
    if (!sold.itemId || !sold.quantity || sold.quantity <= 0) {
      res.status(400);
      throw new Error("Invalid sale item data");
    }

    const item = db.get(
      `
      SELECT id, name, quantity, retailPrice
      FROM local_items
      WHERE id = ? AND storeId = ? AND adminId = ?
      `,
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

  const tax = 0;
  const total = subtotal + tax;
  const receiptNo = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  /* ===============================
     🔄 ATOMIC SQLITE TRANSACTION
  ============================== */
  db.transaction(() => {
    // 1️⃣ Insert offline sale
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
        syncStatus
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
        "pending" // ⏳ waiting for Postgres sync
      ]
    );

    // 2️⃣ Deduct inventory
    for (const sold of items) {
      db.run(
        `
        UPDATE local_items
        SET quantity = quantity - ?,
            updatedAt = CURRENT_TIMESTAMP,
            syncStatus = 'pending'
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
  const adminId = req.user.adminId || req.user.id;

  const sales = db.all(
    `
    SELECT *
    FROM offline_sales
    WHERE storeId = ? AND adminId = ?
    ORDER BY createdAt DESC
    `,
    [req.user.storeId, adminId]
  );

  const formatted = sales.map(sale => ({
    ...sale,
    items: safeParseJSON(sale.items),
  }));

  res.json(formatted);
});

/* =====================================================
   @desc    Get single sale
===================================================== */
const getSaleById = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;

  const sale = db.get(
    `
    SELECT *
    FROM offline_sales
    WHERE id = ? AND storeId = ? AND adminId = ?
    `,
    [req.params.id, req.user.storeId, adminId]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  sale.items = safeParseJSON(sale.items);
  res.json(sale);
});

/* =====================================================
   @desc    Delete sale (OFFLINE SAFE)
===================================================== */
const deleteSale = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;

  const sale = db.get(
    `
    SELECT *
    FROM offline_sales
    WHERE id = ? AND storeId = ? AND adminId = ?
    `,
    [req.params.id, req.user.storeId, adminId]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  if (sale.cashierId !== req.user.id) {
    res.status(403);
    throw new Error("Not authorized to delete this sale");
  }

  db.run(`DELETE FROM offline_sales WHERE id = ?`, [req.params.id]);

  res.json({ message: "Sale deleted locally" });
});

/* =====================================================
   @desc    Daily summary (OFFLINE DASHBOARD)
===================================================== */
const getDailySummary = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;

  const summary = db.get(
    `
    SELECT
      COUNT(*) AS transactions,
      COALESCE(SUM(total), 0) AS totalSales
    FROM offline_sales
    WHERE DATE(createdAt) = DATE('now')
      AND storeId = ?
      AND adminId = ?
    `,
    [req.user.storeId, adminId]
  );

  res.json({
    date: new Date().toISOString(),
    totalSales: summary.totalSales,
    transactions: summary.transactions,
  });
});

/* =====================================================
   🧠 UTIL
===================================================== */
function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

module.exports = {
  createSale,
  getSales,
  getSaleById,
  deleteSale,
  getDailySummary,
};
