const asyncHandler = require("express-async-handler");
const db = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   CREATE SALE (ENTERPRISE OFFLINE POS)
===================================================== */
const createSale = asyncHandler(async (req, res) => {
  const { items, paymentType } = req.body;
  console.log("Creating sale with items:", items);

  /* ===============================
     VALIDATE INPUT
  ============================== */
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("No sale items provided");
  }

  /* ===============================
     AUTH + STORE CONTEXT
  ============================== */
  const adminId = req.user.adminId || req.user.id;
  const cashierId = req.user.id;

  let storeId = req.user.storeId || req.body.storeId;

  if (!adminId) {
    return res.status(401).json({
      message: "Unauthorized: missing adminId",
    });
  }

  if (!storeId) {
    console.warn("⚠️ Missing storeId, using default store");
    storeId = "default-store";
  }

  /* ===============================
     NORMALIZE PAYLOAD
  ============================== */
  const normalizedItems = items.map((i) => ({
    itemId: i.itemId || i.id, // UUID from frontend
    quantity: Number(i.quantity ?? i.qty ?? 0),
  }));

  let subtotal = 0;

  /* ===============================
     🔐 VALIDATE STOCK (HYBRID)
  ============================== */
  for (const sold of normalizedItems) {
    if (!sold.itemId || sold.quantity <= 0) {
      res.status(400);
      throw new Error("Invalid sale item data");
    }

    let item = null;

    /* ===============================
       1️⃣ TRY SQLITE (ONLY IF INTEGER ID)
    ============================== */
    if (!isNaN(Number(sold.itemId))) {
      item = await db.get(
        `SELECT * FROM local_items
         WHERE id = ? AND storeId = ? AND adminId = ? AND deleted = 0`,
        [Number(sold.itemId), storeId, adminId]
      );
    }

    /* ===============================
       2️⃣ FALLBACK: POSTGRES
    ============================== */
    if (!item) {
      console.warn("🌍 Fetching item from Postgres:", sold.itemId);

      const pgRes = await query(
        `
        SELECT *
        FROM items
        WHERE id = $1
        AND admin_id = $2
        AND store_id = $3
        AND deleted = false
        `,
        [sold.itemId, adminId, storeId]
      );

      if (pgRes.rows.length > 0) {
        const pgItem = pgRes.rows[0];

        /* INSERT INTO SQLITE (NO ID FIELD!) */
        await db.run(
          `INSERT INTO local_items (
            name,
            sku,
            retailPrice,
            quantity,
            storeId,
            adminId,
            syncStatus
          )
          VALUES (?, ?, ?, ?, ?, ?, 'synced')`,
          [
            pgItem.name,
            pgItem.sku || "",
            Number(pgItem.retail_price || 0),
            Number(pgItem.quantity || 0),
            pgItem.store_id,
            pgItem.admin_id,
          ]
        );

        /* RE-FETCH LOCAL ROW (GET INTEGER ID) */
        item = await db.get(
          `SELECT * FROM local_items
           WHERE name = ? AND storeId = ? AND adminId = ?
           ORDER BY id DESC LIMIT 1`,
          [pgItem.name, pgItem.store_id, pgItem.admin_id]
        );
      }
    }

    /* ===============================
       ❌ STILL NOT FOUND
    ============================== */
    if (!item) {
      console.error("❌ Item missing everywhere:", sold.itemId);
      res.status(404);
      throw new Error("Item not found in both local and remote DB");
    }

    if (Number(item.quantity) < Number(sold.quantity)) {
      res.status(400);
      throw new Error(`Insufficient stock for ${item.name}`);
    }

    
    const price = Number(item.retail_price ?? item.retailPrice ?? 0);
    subtotal += price * sold.quantity;


    sold.price = price;
    sold.localId = item.id;

    /* attach resolved local item */
    sold.localId = item.id;
    sold.price = Number(item.retail_price);
  }

  const tax = 0;
  const total = subtotal + tax;
  const receiptNo = `R-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  /* ===============================
     🔄 SQLITE TRANSACTION
  ============================== */
  await db.transaction(async () => {
    await db.run(
      `
      INSERT INTO offline_sales (
        receiptNo, subtotal, tax, total,
        paymentType, paymentStatus,
        cashierId, storeId, adminId, syncStatus
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

    const saleRow = await db.get(
      `SELECT id FROM offline_sales WHERE receiptNo = ?`,
      [receiptNo]
    );

    const saleId = saleRow.id;

for (const sold of normalizedItems) {
  const item = await db.get(
    `SELECT * FROM local_items WHERE id = ?`,
    [sold.localId]
  );

  if (!item) {
    throw new Error("Item not found during sale processing");
  }

  /* 🔥 SAFE PRICE EXTRACTION */
  const price = Number(
      item.retail_price ?? item.retailPrice ?? 0
    );

  /* 🚨 HARD GUARD (prevents crash forever) */
  if (!price || isNaN(price)) {
    console.error("❌ Invalid price in DB:", item);

    throw new Error(
      `Invalid retail_price for item "${item.name}". Fix your data.`
    );
  }

  /* INSERT sale_items */
  await db.run(
    `
    INSERT INTO sale_items (
      saleId, itemId, quantity, unitPrice, totalPrice
    )
    VALUES (?, ?, ?, ?, ?)
    `,
    [
      saleId,
      sold.localId,
      sold.quantity,
      price,                     // ✅ ALWAYS valid
      price * sold.quantity,     // ✅ ALWAYS valid
    ]
  );

  /* STOCK DEDUCTION */
  await db.run(
    `
    UPDATE local_items
    SET quantity = quantity - ?,
        updatedAt = CURRENT_TIMESTAMP,
        syncStatus = 'pending'
    WHERE id = ?
    `,
    [sold.quantity, sold.localId]
  );

  /* STOCK MOVEMENT */
  await db.run(
    `
    INSERT INTO stock_movements (
      itemId, movementType, quantity, referenceId
    )
    VALUES (?, 'sale', ?, ?)
    `,
    [sold.localId, -sold.quantity, saleId]
  );
}
  });

  res.status(201).json({
    message: "Sale completed (hybrid mode)",
    receiptNo,
    total,
  });
});

/* =====================================================
   GET SALES (RELATIONAL)
===================================================== */
const getSales = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.query.storeId;

  if (!adminId || !storeId) {
    return res.status(400).json({ message: "Invalid user session" });
  }

  const sales = await db.all(
    `SELECT * FROM offline_sales
     WHERE storeId = ? AND adminId = ?
     ORDER BY createdAt DESC`,
    [storeId, adminId]
  ) || [];

  for (const sale of sales) {
    sale.items = await db.all(
      `SELECT * FROM sale_items WHERE saleId = ?`,
      [sale.id]
    ) || [];
  }

  res.json(sales);
});

/* =====================================================
   GET SALE BY ID
===================================================== */
const getSaleById = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.query.storeId;

  const sale = await db.get(
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

  const summary = await db.get(
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
  const storeId = req.query.storeId;
  const saleId = req.params.id;

  const sale = await db.get(
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