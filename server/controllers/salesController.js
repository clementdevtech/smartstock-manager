const asyncHandler = require("express-async-handler");
const db = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   HELPERS
===================================================== */

const getTenant = (req) => ({
  adminId: req.user.adminId || req.user.id,
  storeId: req.user.storeId || req.body.storeId || "default-store",
});

const isOnline = async () => {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

/* =====================================================
   CREATE SALE (ENTERPRISE OFFLINE POS)
===================================================== */

const createSale = asyncHandler(async (req, res) => {
  const { items, paymentType } = req.body;

  console.log("🧾 Creating Sale:", items);

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("No sale items provided");
  }

  const { adminId, storeId } = getTenant(req);
  const cashierId = req.user.id;

  const normalizedItems = items.map((i) => ({
    itemId: i.itemId || i.id,
    quantity: Number(i.quantity ?? i.qty ?? 0),
  }));

  let subtotal = 0;

  /* =====================================================
     VALIDATE STOCK (HYBRID)
  ===================================================== */

  for (const sold of normalizedItems) {
    if (!sold.itemId || sold.quantity <= 0) {
      throw new Error("Invalid sale item data");
    }

    let item = null;

    /* ===============================
       SQLITE FIRST
    ============================== */

    if (!isNaN(Number(sold.itemId))) {
      item = await db.get(
        `SELECT * FROM local_items
         WHERE id = ?
         AND storeId = ?
         AND adminId = ?
         AND deleted = 0`,
        [sold.itemId, storeId, adminId]
      );
    }

    /* ===============================
       POSTGRES FALLBACK
    ============================== */

    if (!item && (await isOnline())) {
      console.warn("🌍 Fetching from Postgres:", sold.itemId);

      const pg = await query(
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

      if (pg.rows.length) {
        const pgItem = pg.rows[0];

        /* Insert locally */

        await db.run(
          `
          INSERT INTO local_items (
            name,
            sku,
            retail_price,
            quantity,
            storeId,
            adminId,
            syncStatus
          )
          VALUES (?, ?, ?, ?, ?, ?, 'synced')
          `,
          [
            pgItem.name,
            pgItem.sku || "",
            Number(pgItem.retail_price || 0),
            Number(pgItem.quantity || 0),
            storeId,
            adminId,
          ]
        );

        /* Re-fetch */

        item = await db.get(
          `
          SELECT * FROM local_items
          WHERE sku = ?
          AND storeId = ?
          AND adminId = ?
          ORDER BY id DESC LIMIT 1
          `,
          [pgItem.sku, storeId, adminId]
        );
      }
    }

    /* ===============================
       NOT FOUND
    ============================== */

    if (!item) {
      throw new Error("Item not found");
    }

    /* ===============================
       STOCK CHECK
    ============================== */

    if (Number(item.quantity) < sold.quantity) {
      throw new Error(`Insufficient stock for ${item.name}`);
    }

    const price = Number(
      item.retail_price ?? item.retailPrice ?? 0
    );

    if (!price || isNaN(price)) {
      throw new Error(`Invalid price for ${item.name}`);
    }

    subtotal += price * sold.quantity;

    sold.price = price;
    sold.localId = item.id;
  }

  const tax = 0;
  const total = subtotal + tax;
  const receiptNo = `R-${Date.now()}-${Math.floor(
    Math.random() * 1000
  )}`;

  /* =====================================================
     SQLITE TRANSACTION
  ===================================================== */

  await db.transaction(async () => {
    await db.run(
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

    const sale = await db.get(
      `SELECT id FROM offline_sales WHERE receiptNo = ?`,
      [receiptNo]
    );

    const saleId = sale.id;

    for (const sold of normalizedItems) {
      const item = await db.get(
        `SELECT * FROM local_items WHERE id = ?`,
        [sold.localId]
      );

      const price = Number(
        item.retail_price ?? item.retailPrice ?? 0
      );

      /* Insert sale items */

      await db.run(
        `
        INSERT INTO sale_items (
          saleId,
          itemId,
          quantity,
          unitPrice,
          totalPrice
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          saleId,
          sold.localId,
          sold.quantity,
          price,
          price * sold.quantity,
        ]
      );

      /* Deduct stock */

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

      /* Stock movement */

      await db.run(
        `
        INSERT INTO stock_movements (
          itemId,
          movementType,
          quantity,
          referenceId
        )
        VALUES (?, 'sale', ?, ?)
        `,
        [sold.localId, -sold.quantity, saleId]
      );
    }
  });

  res.status(201).json({
    message: "Sale completed (Hybrid)",
    receiptNo,
    total,
  });
});

/* =====================================================
   GET SALES
===================================================== */

const getSales = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const sales =
    (await db.all(
      `
      SELECT *
      FROM offline_sales
      WHERE storeId = ?
      AND adminId = ?
      AND deleted = 0
      ORDER BY createdAt DESC
      `,
      [storeId, adminId]
    )) || [];

  for (const sale of sales) {
    sale.items =
      (await db.all(
        `SELECT * FROM sale_items WHERE saleId = ?`,
        [sale.id]
      )) || [];
  }

  res.json(sales);
});

/* =====================================================
   GET SALE BY ID
===================================================== */

const getSaleById = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const sale = await db.get(
    `
    SELECT *
    FROM offline_sales
    WHERE id = ?
    AND storeId = ?
    AND adminId = ?
    AND deleted = 0
    `,
    [req.params.id, storeId, adminId]
  );

  if (!sale) {
    throw new Error("Sale not found");
  }

  sale.items = await db.all(
    `SELECT * FROM sale_items WHERE saleId = ?`,
    [sale.id]
  );

  res.json(sale);
});

/* =====================================================
   DAILY SUMMARY
===================================================== */

const getDailySummary = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const summary = await db.get(
    `
    SELECT 
      COUNT(*) AS transactions,
      COALESCE(SUM(total),0) AS totalSales
    FROM offline_sales
    WHERE DATE(createdAt) = DATE('now')
    AND storeId = ?
    AND adminId = ?
    `,
    [storeId, adminId]
  );

  res.json({
    date: new Date(),
    ...summary,
  });
});

/* =====================================================
   DELETE SALE (SOFT DELETE)
===================================================== */

const deleteSale = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  await db.run(
    `
    UPDATE offline_sales
    SET deleted = 1,
        syncStatus = 'pending',
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
    AND storeId = ?
    AND adminId = ?
    `,
    [req.params.id, storeId, adminId]
  );

  res.json({
    message: "Sale deleted",
  });
});

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  createSale,
  getSales,
  getSaleById,
  getDailySummary,
  deleteSale,
};