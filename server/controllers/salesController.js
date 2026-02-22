const asyncHandler = require("express-async-handler");
const db = require("../sqlite");

/* =====================================================
   CREATE SALE (ENTERPRISE OFFLINE POS)
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
     🔐 VALIDATE STOCK + CALCULATE
  ============================== */
  for (const sold of items) {
    if (!sold.itemId || !sold.quantity || sold.quantity <= 0) {
      res.status(400);
      throw new Error("Invalid sale item data");
    }

    const item = db.get(
      `SELECT * FROM local_items
       WHERE id = ? AND storeId = ? AND adminId = ? AND deleted = 0`,
      [sold.itemId, storeId, adminId]
    );

    if (!item) {
      res.status(403);
      throw new Error("Invalid item or unauthorized");
    }

    if (Number(item.quantity) < Number(sold.quantity)) {
      res.status(400);
      throw new Error(`Insufficient stock for ${item.name}`);
    }

    subtotal += Number(item.retailPrice) * Number(sold.quantity);
  }

  const tax = 0;
  const total = subtotal + tax;
  const receiptNo = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  /* ===============================
     🔄 ATOMIC SQLITE TRANSACTION
  ============================== */
  db.transaction(() => {
    // 1️⃣ Insert sale header
    db.run(
      `
      INSERT INTO offline_sales (
        receiptNo,
        subtotal,
        tax,
        total,
        paymentType,
        paymentStatus,
        cashierId,
        storeId,
        adminId,
        syncStatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        receiptNo,
        subtotal,
        tax,
        total,
        paymentType || "cash",
        "paid",
        cashierId,
        storeId,
        adminId,
        "pending",
      ]
    );

    const saleId = db.get(
      `SELECT id FROM offline_sales WHERE receiptNo = ?`,
      [receiptNo]
    ).id;

    /* ===============================
       2️⃣ PROCESS EACH SOLD ITEM
    ============================== */
    for (const sold of items) {
      const item = db.get(
        `SELECT * FROM local_items WHERE id = ?`,
        [sold.itemId]
      );

      /* Insert relational sale_items */
      db.run(
        `
        INSERT INTO sale_items (
          saleId, itemId, quantity, unitPrice, totalPrice
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          saleId,
          sold.itemId,
          sold.quantity,
          item.retailPrice,
          item.retailPrice * sold.quantity,
        ]
      );

      /* ===== Recipe Deduction (BAR MODE) ===== */
      const recipeRows = db.all(
        `SELECT * FROM recipes WHERE finishedItemId = ?`,
        [sold.itemId]
      );

      if (recipeRows.length > 0) {
        for (const r of recipeRows) {
          const totalIngredientQty =
            Number(r.quantityRequired) * Number(sold.quantity);

          db.run(
            `
            UPDATE local_items
            SET quantity = quantity - ?,
                updatedAt = CURRENT_TIMESTAMP,
                syncStatus = 'pending'
            WHERE id = ?
            `,
            [totalIngredientQty, r.ingredientId]
          );

          db.run(
            `
            INSERT INTO stock_movements (
              itemId, movementType, quantity, referenceId, notes
            )
            VALUES (?, 'sale', ?, ?, 'Recipe deduction')
            `,
            [r.ingredientId, -totalIngredientQty, saleId]
          );
        }
      } else {
        /* ===== Normal Stock Deduction ===== */
        db.run(
          `
          UPDATE local_items
          SET quantity = quantity - ?,
              updatedAt = CURRENT_TIMESTAMP,
              syncStatus = 'pending'
          WHERE id = ?
          `,
          [sold.quantity, sold.itemId]
        );

        db.run(
          `
          INSERT INTO stock_movements (
            itemId, movementType, quantity, referenceId
          )
          VALUES (?, 'sale', ?, ?)
          `,
          [sold.itemId, -sold.quantity, saleId]
        );
      }

      /* ===== Batch FIFO Deduction ===== */
      const trackBatches = item.trackBatches === 1;

      if (trackBatches) {
        let remaining = Number(sold.quantity);

        const batches = db.all(
          `
          SELECT * FROM item_batches
          WHERE itemId = ?
          ORDER BY expiryDate ASC
          `,
          [sold.itemId]
        );

        for (const batch of batches) {
          if (remaining <= 0) break;

          const deduct = Math.min(batch.quantity, remaining);

          db.run(
            `UPDATE item_batches
             SET quantity = quantity - ?
             WHERE id = ?`,
            [deduct, batch.id]
          );

          remaining -= deduct;
        }
      }
    }
  });

  res.status(201).json({
    message: "Sale completed (enterprise offline)",
    receiptNo,
    total,
    customerName: customerName || "Walk-in Customer",
  });
});

/* =====================================================
   GET SALES (RELATIONAL)
===================================================== */
const getSales = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;

  const sales = db.all(
    `SELECT * FROM offline_sales
     WHERE storeId = ? AND adminId = ?
     ORDER BY createdAt DESC`,
    [storeId, adminId]
  );

  for (const sale of sales) {
    sale.items = db.all(
      `SELECT * FROM sale_items WHERE saleId = ?`,
      [sale.id]
    );
  }

  res.json(sales);
});

/* =====================================================
   GET SALE BY ID
===================================================== */
const getSaleById = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;

  const sale = db.get(
    `SELECT * FROM offline_sales
     WHERE id = ? AND storeId = ? AND adminId = ?`,
    [req.params.id, storeId, adminId]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  sale.items = db.all(
    `SELECT * FROM sale_items WHERE saleId = ?`,
    [sale.id]
  );

  res.json(sale);
});

/* =====================================================
   DAILY SUMMARY
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
   DELETE SALE (SOFT DELETE – SAFE)
===================================================== */
const deleteSale = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;
  const saleId = req.params.id;

  const sale = db.get(
    `SELECT * FROM offline_sales
     WHERE id = ? AND storeId = ? AND adminId = ?`,
    [saleId, storeId, adminId]
  );

  if (!sale) {
    res.status(404);
    throw new Error("Sale not found");
  }

  // 🔒 Soft delete (recommended for POS audit safety)
  db.run(
    `
    UPDATE offline_sales
    SET deleted = 1,
        syncStatus = 'pending',
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [saleId]
  );

  res.json({ message: "Sale deleted successfully" });
});


module.exports = {
  createSale,
  getSales,
  getSaleById,
  getDailySummary,
  deleteSale,
};