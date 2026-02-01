const asyncHandler = require("express-async-handler");
const { query } = require("../config/db");
const sqlite = require("../sqlite");
const sendEmail = require("../utils/email");

/* =====================================================
   HELPERS
===================================================== */
const getTenant = (req) => ({
  adminId: req.user.adminId || req.user.id,
  storeId: req.user.storeId,
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
   LOW STOCK EMAIL
===================================================== */
const sendLowStockEmail = async (item, email) => {
  if (!email) return;

  if (item.quantity > item.low_stock_threshold) return;

  const html = `
    <h2>⚠️ Low Stock Alert</h2>
    <ul>
      <li><strong>Name:</strong> ${item.name}</li>
      <li><strong>SKU:</strong> ${item.sku}</li>
      <li><strong>Quantity:</strong> ${item.quantity}</li>
      <li><strong>Threshold:</strong> ${item.low_stock_threshold}</li>
    </ul>
    <small>SmartStock POS</small>
  `;

  await sendEmail(email, `Low Stock: ${item.name}`, html);
};

/* =====================================================
   GET ITEMS (OFFLINE FIRST)
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const localItems = sqlite.all(
    `
    SELECT * FROM local_items
    WHERE adminId = ? AND storeId = ?
    ORDER BY updatedAt DESC
    `,
    [adminId, storeId]
  );

  if (!(await isOnline())) {
    return res.json(localItems);
  }

  const { rows } = await query(
    `
    SELECT *
    FROM items
    WHERE admin_id = $1 AND store_id = $2
    ORDER BY updated_at DESC
    `,
    [adminId, storeId]
  );

  res.json(rows);
});

/* =====================================================
   GET ITEM BY ID
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const local = sqlite.get(
    `
    SELECT * FROM local_items
    WHERE postgresId = ? AND adminId = ? AND storeId = ?
    `,
    [req.params.id, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `
    SELECT *
    FROM items
    WHERE id = $1 AND admin_id = $2 AND store_id = $3
    `,
    [req.params.id, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   GET ITEM BY BARCODE (SKU)
===================================================== */
const getItemByBarcode = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const local = sqlite.get(
    `
    SELECT * FROM local_items
    WHERE sku = ? AND adminId = ? AND storeId = ?
    `,
    [req.params.sku, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `
    SELECT *
    FROM items
    WHERE sku = $1 AND admin_id = $2 AND store_id = $3
    `,
    [req.params.sku, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   CREATE ITEM (OFFLINE FIRST)
===================================================== */
const createItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  const data = req.body;

  // 1️⃣ SQLite first
  sqlite.run(
    `
    INSERT INTO local_items (
      sku, name, category, unit,
      wholesalePrice, retailPrice,
      quantity, lowStockThreshold,
      batchNumber, expiryDate,
      adminId, storeId, syncStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `,
    [
      data.sku,
      data.name,
      data.category,
      data.unit,
      data.wholesale_price,
      data.retail_price,
      data.quantity,
      data.low_stock_threshold,
      data.batch_number,
      data.expiry_date,
      adminId,
      storeId,
    ]
  );

  // 2️⃣ Online → Postgres
  if (await isOnline()) {
    const { rows } = await query(
      `
      INSERT INTO items (
        name, sku, category, unit,
        wholesale_price, retail_price,
        quantity, low_stock_threshold,
        batch_number, expiry_date,
        supplier, image_url,
        admin_id, store_id, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )
      RETURNING *
      `,
      [
        data.name,
        data.sku,
        data.category,
        data.unit,
        data.wholesale_price,
        data.retail_price,
        data.quantity,
        data.low_stock_threshold,
        data.batch_number,
        data.expiry_date,
        data.supplier || {},
        data.image_url || "",
        adminId,
        storeId,
        req.user.id,
      ]
    );

    sqlite.run(
      `
      UPDATE local_items
      SET postgresId = ?, syncStatus = 'synced'
      WHERE sku = ? AND adminId = ? AND storeId = ?
      `,
      [rows[0].id, data.sku, adminId, storeId]
    );
  }

  res.status(201).json({ message: "Item created (offline-first)" });
});

/* =====================================================
   UPDATE ITEM
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  sqlite.run(
    `
    UPDATE local_items
    SET quantity = ?, updatedAt = CURRENT_TIMESTAMP, syncStatus = 'pending'
    WHERE postgresId = ? AND adminId = ? AND storeId = ?
    `,
    [req.body.quantity, req.params.id, adminId, storeId]
  );

  if (await isOnline()) {
    await query(
      `
      UPDATE items
      SET quantity = $1, updated_at = now()
      WHERE id = $2 AND admin_id = $3 AND store_id = $4
      `,
      [req.body.quantity, req.params.id, adminId, storeId]
    );
  }

  res.json({ message: "Item updated (offline-first)" });
});

/* =====================================================
   DELETE ITEM
===================================================== */
const deleteItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  sqlite.run(
    `
    DELETE FROM local_items
    WHERE postgresId = ? AND adminId = ? AND storeId = ?
    `,
    [req.params.id, adminId, storeId]
  );

  if (await isOnline()) {
    await query(
      `
      DELETE FROM items
      WHERE id = $1 AND admin_id = $2 AND store_id = $3
      `,
      [req.params.id, adminId, storeId]
    );
  }

  res.json({ message: "Item deleted (offline-first)" });
});

/* =====================================================
   WEEKLY BEST ITEMS (POSTGRES)
===================================================== */
const getWeeklyBestItems = asyncHandler(async (req, res) => {
  if (!(await isOnline())) return res.json([]);

  const { adminId, storeId } = getTenant(req);

  const { rows } = await query(
    `
    SELECT
      i.name,
      i.sku,
      SUM((s_item->>'quantity')::int) AS total_sold
    FROM sales s
    CROSS JOIN LATERAL jsonb_array_elements(s.items) AS s_item
    JOIN items i ON i.id::text = s_item->>'itemId'
    WHERE s.created_at >= now() - interval '7 days'
      AND s.admin_id = $1
      AND s.store_id = $2
    GROUP BY i.id
    ORDER BY total_sold DESC
    LIMIT 10
    `,
    [adminId, storeId]
  );

  res.json(rows);
});

module.exports = {
  getItems,
  getItemById,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
  getWeeklyBestItems,
};
