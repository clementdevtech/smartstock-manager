const asyncHandler = require("express-async-handler");
const { query } = require("../config/db");
const sqlite = require("../sqlite");
const sendEmail = require("../utils/email");
const csv = require("csv-parser");
const fs = require("fs");
const { pipeline } = require("stream/promises");

const BATCH_SIZE = 500;

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
   🔔 NOTIFICATIONS
===================================================== */

const createNotification = async ({
  adminId,
  storeId,
  title,
  message,
  type = "info",
}) => {
  try {
    await sqlite.run(
      `INSERT INTO notifications 
       (adminId, storeId, title, message, type)
       VALUES (?, ?, ?, ?, ?)`,
      [adminId, storeId, title, message, type]
    );
  } catch (err) {
    console.error("Notification error:", err);
  }
};

/* =====================================================
   LOW STOCK ALERT
===================================================== */

const sendLowStockAlert = async (item, adminId, storeId) => {
  const threshold =
    item.lowstockthreshold || item.low_stock_threshold || 5;

  if (Number(item.quantity) > Number(threshold)) return;

  await createNotification({
    adminId,
    storeId,
    title: "Low Stock Alert",
    message: `${item.name} is running low (${item.quantity})`,
    type: "warning",
  });

  try {
    const user = await sqlite.get(
      `SELECT email FROM local_users 
       WHERE adminId = ? LIMIT 1`,
      [adminId]
    );

    if (!user?.email) return;

    const html = `
      <h2>⚠️ Low Stock Alert</h2>
      <ul>
        <li><strong>Name:</strong> ${item.name}</li>
        <li><strong>SKU:</strong> ${item.sku}</li>
        <li><strong>Quantity:</strong> ${item.quantity}</li>
      </ul>
      <small>SmartStock POS</small>
    `;

    await sendEmail(user.email, `Low Stock: ${item.name}`, html);
  } catch (err) {
    console.error("Low stock email error", err);
  }
};

/* =====================================================
   GET ITEMS
===================================================== */

const getItems = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const localItems = await sqlite.all(
    `SELECT * FROM local_items
     WHERE adminId = ? 
     AND storeId = ? 
     AND deleted = 0
     ORDER BY updatedAt DESC`,
    [adminId, storeId]
  );

  if (!(await isOnline())) {
    return res.json(localItems);
  }

  const { rows } = await query(
    `SELECT * FROM items
     WHERE admin_id = $1
     AND store_id = $2
     ORDER BY updated_at DESC`,
    [adminId, storeId]
  );

  res.json(rows);
});

/* =====================================================
   GET ITEM BY ID
===================================================== */

const getItemById = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const item = await sqlite.get(
    `SELECT * FROM local_items
     WHERE postgresId = ?
     AND adminId = ?
     AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  res.json(item);
});

/* =====================================================
   GET BY BARCODE
===================================================== */

const getItemByBarcode = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const item = await sqlite.get(
    `SELECT * FROM local_items
     WHERE (barcode = ? OR sku = ?)
     AND adminId = ?
     AND storeId = ?`,
    [req.params.sku, req.params.sku, adminId, storeId]
  );

  res.json(item);
});

/* =====================================================
   CREATE ITEM
===================================================== */

const normalizeUnit = (unit) => {
  const map = {
    piece: "pcs",
    pieces: "pcs",
    box: "cartons",
    bale: "cartons",
    kg: "kg",
    liter: "liters",
  };

  return map[unit?.toLowerCase()] || "pcs";
};

const createItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const data = req.body;

  await sqlite.run(
    `INSERT INTO local_items (
      sku, barcode, name, category,
      cost_price, wholesale_price, retail_price,
      quantity, low_stock_threshold,
      stock_unit, selling_unit,
      adminId, storeId, syncStatus
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.sku,
      data.barcode,
      data.name,
      data.category,
      data.costPrice,
      data.wholesalePrice,
      data.retailPrice,
      data.quantity,
      data.lowStockThreshold,
      normalizeUnit(data.stockUnit),
      normalizeUnit(data.sellingUnit),
      adminId,
      storeId,
      "pending",
    ]
  );

  await sendLowStockAlert(data, adminId, storeId);

  res.status(201).json({ message: "Item created" });
});

/* =====================================================
   UPDATE ITEM
===================================================== */

const updateItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  await sqlite.run(
    `UPDATE local_items
     SET quantity = ?,
         retail_price = ?,
         cost_price = ?,
         updatedAt = CURRENT_TIMESTAMP,
         syncStatus = 'pending'
     WHERE postgresId = ?
     AND adminId = ?
     AND storeId = ?`,
    [
      req.body.quantity,
      req.body.retailPrice,
      req.body.costPrice,
      req.params.id,
      adminId,
      storeId,
    ]
  );

  res.json({ message: "Item updated" });
});

/* =====================================================
   DELETE ITEM
===================================================== */

const deleteItem = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  await sqlite.run(
    `UPDATE local_items
     SET deleted = 1,
     syncStatus = 'pending'
     WHERE postgresId = ?
     AND adminId = ?
     AND storeId = ?`,
    [req.params.id, adminId, storeId]
  );

  res.json({ message: "Item deleted" });
});

/* =====================================================
   STOCK MOVEMENT
===================================================== */

const createStockMovement = asyncHandler(async (req, res) => {
  const { itemId, movementType, quantity } = req.body;

  await sqlite.run(
    `INSERT INTO stock_movements
     (itemId, movementType, quantity)
     VALUES (?, ?, ?)`,
    [itemId, movementType, quantity]
  );

  res.json({ success: true });
});

/* =====================================================
   CSV IMPORT
===================================================== */

const importItemsFromCSV = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  const results = [];

  await pipeline(
    fs.createReadStream(req.file.path),
    csv(),
    async function* (source) {
      for await (const row of source) {
        results.push(row);

        if (results.length >= BATCH_SIZE) {
          yield results.splice(0, results.length);
        }
      }

      if (results.length) {
        yield results;
      }
    },
    async function (source) {
      for await (const batch of source) {
        for (const item of batch) {
          await sqlite.run(
            `INSERT INTO local_items 
            (name, sku, quantity, adminId, storeId)
            VALUES (?, ?, ?, ?, ?)`,
            [
              item.name,
              item.sku,
              item.quantity || 0,
              adminId,
              storeId,
            ]
          );
        }
      }
    }
  );

  res.json({ message: "Import complete" });
});

/* =====================================================
   ERP SYNC
===================================================== */

const erpSync = asyncHandler(async (req, res) => {
  res.json({ message: "ERP Sync started" });
});

/* =====================================================
   EDI 850
===================================================== */

const processEdi850 = asyncHandler(async (req, res) => {
  res.json({ message: "EDI 850 processed" });
});

/* =====================================================
   WEEKLY BEST ITEMS
===================================================== */

const getWeeklyBestItems = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);

  if (!(await isOnline())) return res.json([]);

  const { rows } = await query(
    `
    SELECT i.name, SUM(si.quantity) total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN items i ON i.id = si.item_id
    WHERE s.created_at > now() - interval '7 days'
    AND s.admin_id = $1
    AND s.store_id = $2
    GROUP BY i.name
    ORDER BY total DESC
    LIMIT 10
    `,
    [adminId, storeId]
  );

  res.json(rows);
});

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  getItems,
  getItemById,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
  createStockMovement,
  importItemsFromCSV,
  erpSync,
  processEdi850,
  getWeeklyBestItems,
};