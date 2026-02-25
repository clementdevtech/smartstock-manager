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
  if (Number(item.quantity) > Number(item.lowstockthreshold || item.low_stock_threshold)) return;

  const html = `
    <h2>⚠️ Low Stock Alert</h2>
    <ul>
      <li><strong>Name:</strong> ${item.name}</li>
      <li><strong>SKU:</strong> ${item.sku}</li>
      <li><strong>Quantity:</strong> ${item.quantity}</li>
    </ul>
    <small>SmartStock POS</small>
  `;

  await sendEmail(email, `Low Stock: ${item.name}`, html);
};

/* =====================================================
   GET ITEMS (OFFLINE FIRST)
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId; 

  if (!storeId) {
    return res.status(400).json({ message: "storeId is required" });
  }


  try {
    // Fetch from local SQLite first (offline support)
    const localItems = await sqlite.all(
      `SELECT * FROM local_items
       WHERE adminId = ? AND storeId = ? AND deleted = 0
       ORDER BY updatedAt DESC`,
      [adminId, storeId]
    );

    if (!(await isOnline())) {
      console.log("📡 Offline mode: returning local items");
      return res.json(localItems);
    }

    // Fetch from online Postgres if online
    const { rows } = await query(
      `SELECT * FROM items
       WHERE admin_id = $1 AND store_id = $2
       ORDER BY updated_at DESC`,
      [adminId, storeId]
    );

    // Optionally: merge localItems with rows if there are unsynced offline items
    // For now, we just return online rows
    res.json(rows);

  } catch (err) {
    console.error("❌ Error fetching items:", err.message);
    res.status(500).json({ message: "Failed to fetch items", error: err.message });
  }
});

/* =====================================================
   GET ITEM BY ID
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `SELECT * FROM items
     WHERE id = $1 AND admin_id = $2 AND store_id = $3`,
    [req.params.id, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   GET ITEM BY BARCODE
===================================================== */
const getItemByBarcode = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE (barcode = ? OR sku = ?)
     AND adminId = ? AND storeId = ?`,
    [req.params.code, req.params.code, adminId, storeId]
  );

  if (local) return res.json(local);

  if (!(await isOnline())) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const { rows } = await query(
    `SELECT * FROM items
     WHERE (barcode = $1 OR sku = $1)
     AND admin_id = $2 AND store_id = $3`,
    [req.params.code, adminId, storeId]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(rows[0]);
});

/* =====================================================
   CREATE ITEM (ENTERPRISE READY)
===================================================== */
const createItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.body.storeId || req.user.storeId;

  if (!storeId) {
  res.status(400);
  throw new Error("Store ID is required");
}


  const data = req.body;

  sqlite.run(
    `INSERT INTO local_items (
      sku, barcode, name, category, itemType, unit,
      allowDecimalSales, wholesalePrice, retailPrice,
      quantity, lowStockThreshold,
      trackBatches, trackExpiry, isControlled,
      supplier, adminId, storeId, syncStatus
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.sku,
      data.barcode || null,
      data.name,
      data.category,
      data.item_type || "product",
      data.unit || "pcs",
      data.allow_decimal_sales ? 1 : 0,
      data.wholesale_price || 0,
      data.retail_price || 0,
      data.quantity || 0,
      data.low_stock_threshold || 5,
      data.track_batches ? 1 : 0,
      data.track_expiry ? 1 : 0,
      data.is_controlled ? 1 : 0,
      JSON.stringify(data.supplier || {}),
      adminId,
      storeId,
    ]
  );

  /* Log stock movement */
  sqlite.run(
    `INSERT INTO stock_movements (itemId, movementType, quantity, notes)
     VALUES ((SELECT id FROM local_items WHERE sku = ? AND storeId = ?),
     'purchase', ?, 'Initial stock')`,
    [data.sku, storeId, data.quantity || 0]
  );

  if (await isOnline()) {
  const { rows } = await query(
  `INSERT INTO items (
    name, sku, barcode, category, item_type, unit,
    allow_decimal_sales,
    wholesale_price, retail_price,
    quantity, low_stock_threshold,
    track_batches, track_expiry, is_controlled,
    supplier,
    entry_date,
    admin_id, store_id, created_by
  )
  VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
  )
  RETURNING *`,
  [
    data.name,
    data.sku,
    data.barcode || null,
    data.category,
    data.item_type || "product",
    data.unit || "pcs",
    data.allow_decimal_sales || false,
    data.wholesale_price || 0,
    data.retail_price || 0,
    data.quantity || 0,
    data.low_stock_threshold || 5,
    data.track_batches || false,
    data.track_expiry || false,
    data.is_controlled || false,
    data.supplier || {},
    data.entry_date || new Date(),   // 🔥 ADD THIS
    adminId,
    storeId,
    req.user.id,
  ]
);


    sqlite.run(
      `UPDATE local_items
       SET postgresId = ?, syncStatus = 'synced'
       WHERE sku = ? AND storeId = ?`,
      [rows[0].id, data.sku, storeId]
    );
  }

  res.status(201).json({ message: "Item created (enterprise-ready)" });
});

/* =====================================================
   UPDATE ITEM QUANTITY
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const { quantity } = req.body;
  const storeId = req.query.storeId;

  sqlite.run(
    `UPDATE local_items
     SET quantity = ?, updatedAt = CURRENT_TIMESTAMP, syncStatus = 'pending'
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [quantity, req.params.id, adminId, storeId]
  );

  sqlite.run(
    `INSERT INTO stock_movements (itemId, movementType, quantity, referenceId)
     VALUES (
       (SELECT id FROM local_items WHERE postgresId = ?),
       'adjustment', ?, ?
     )`,
    [req.params.id, quantity, req.params.id]
  );

  if (await isOnline()) {
    await query(
      `UPDATE items
       SET quantity = $1, updated_at = now()
       WHERE id = $2 AND admin_id = $3 AND store_id = $4`,
      [quantity, req.params.id, adminId, storeId]
    );
  }

  res.json({ message: "Item updated (offline-first)" });
});

/* =====================================================
   DELETE ITEM (SOFT DELETE)
===================================================== */
const deleteItem = asyncHandler(async (req, res) => {
  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  sqlite.run(
    `UPDATE local_items
     SET deleted = 1, syncStatus = 'pending'
     WHERE postgresId = ? AND adminId = ? AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  if (await isOnline()) {
    await query(
      `DELETE FROM items
       WHERE id = $1 AND admin_id = $2 AND store_id = $3`,
      [req.params.id, adminId, storeId]
    );
  }

  res.json({ message: "Item deleted (offline-first)" });
});

/* =====================================================
   WEEKLY BEST ITEMS (NEW RELATIONAL LOGIC)
===================================================== */
const getWeeklyBestItems = asyncHandler(async (req, res) => {
  if (!(await isOnline())) return res.json([]);

  const { adminId } = getTenant(req);
  const storeId = req.query.storeId;

  const { rows } = await query(
    `
    SELECT i.name, i.sku, SUM(si.quantity) AS total_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN items i ON i.id = si.item_id
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


/* =====================================================
   CREATE STOCK MOVEMENT
===================================================== */
const createStockMovement = async (req, res) => {
  try {
    const { itemId, movementType, quantity, referenceId, notes } = req.body;

    // Basic validation
    if (!itemId || !movementType || quantity == null) {
      return res.status(400).json({
        error: "itemId, movementType and quantity are required",
      });
    }

    await db.run(
      `INSERT INTO stock_movements 
       (itemId, movementType, quantity, referenceId, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        itemId,
        movementType,
        quantity,
        referenceId || null,
        notes || null,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Stock movement recorded successfully",
    });

  } catch (err) {
    console.error("❌ Stock Movement Error:", err);
    res.status(500).json({
      error: "Failed to record stock movement",
      details: err.message,
    });
  }
};

module.exports = {
  getItems,
  getItemById,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
  getWeeklyBestItems,
  createStockMovement,
};
