const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
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

  for (const remote of rows) {
    const cached = sqlite.get(
      `SELECT id, syncStatus FROM local_items WHERE postgres_id = ? AND adminId = ? AND storeId = ?`,
      [String(remote.id), adminId, storeId]
    );
    if (cached) {
      if (cached.syncStatus === "synced") {
        sqlite.run(
          `UPDATE local_items SET sku = ?, barcode = ?, name = ?, category = ?,
            cost_price = ?, wholesale_price = ?, retail_price = ?, quantity = ?,
            low_stock_threshold = ?, stock_unit = ?, selling_unit = ?,
            updatedAt = CURRENT_TIMESTAMP
           WHERE id = ? AND adminId = ? AND storeId = ? AND syncStatus = 'synced'`,
          [remote.sku, remote.barcode || null, remote.name, remote.category || "other",
            Number(remote.cost_price ?? remote.wholesale_price ?? 0),
            Number(remote.wholesale_price || 0), Number(remote.retail_price || 0),
            Number(remote.quantity || 0), Number(remote.low_stock_threshold || 5),
            remote.stock_unit || remote.unit || "pcs", remote.selling_unit || remote.unit || "pcs",
            cached.id, adminId, storeId]
        );
      }
      continue;
    }

    sqlite.run(
      `INSERT INTO local_items (
        postgres_id, sku, barcode, name, category, cost_price,
        wholesale_price, retail_price, quantity, low_stock_threshold,
        stock_unit, selling_unit, adminId, storeId, syncStatus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
      [
        String(remote.id), remote.sku, remote.barcode || null, remote.name,
        remote.category || "other", Number(remote.cost_price ?? remote.wholesale_price ?? 0),
        Number(remote.wholesale_price || 0), Number(remote.retail_price || 0),
        Number(remote.quantity || 0), Number(remote.low_stock_threshold || 5),
        remote.stock_unit || remote.unit || "pcs", remote.selling_unit || remote.unit || "pcs",
        adminId, storeId,
      ]
    );
  }

  const localByRemoteId = new Map(
    localItems
      .filter((item) => item.postgres_id && item.syncStatus !== "synced")
      .map((item) => [String(item.postgres_id), item])
  );
  const remoteIds = new Set(rows.map((item) => String(item.id)));
  const merged = rows.map((remote) => {
    const local = localByRemoteId.get(String(remote.id));
    if (!local) return remote;
    return {
      ...remote,
      quantity: Number(local.quantity),
      cost_price: Number(local.cost_price || 0),
      retail_price: Number(local.retail_price || 0),
      wholesale_price: Number(local.wholesale_price || 0),
      syncStatus: local.syncStatus,
    };
  });
  for (const local of localItems) {
    if (!local.postgres_id && !remoteIds.has(String(local.id))) merged.push(local);
  }

  res.json(merged);
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
  const { adminId, storeId } = getTenant(req);
  const { itemId, movementType } = req.body;
  const amount = Number(req.body.quantity);
  const movementId = req.body.movementId || crypto.randomUUID();
  const allowedTypes = ["receive", "adjustment", "damage", "return"];

  if (!itemId || !allowedTypes.includes(movementType) || !Number.isFinite(amount) ||
      (movementType === "adjustment" ? amount === 0 : amount <= 0)) {
    res.status(400);
    throw new Error("Provide an item, a valid movement type, and a positive quantity");
  }
  if (!/^[0-9a-f-]{36}$/i.test(movementId)) {
    res.status(400);
    throw new Error("Movement ID must be a UUID");
  }

  const existing = sqlite.get(
    `SELECT * FROM stock_movements WHERE movementId = ? AND adminId = ? AND storeId = ?`,
    [movementId, adminId, storeId]
  );
  if (existing) return res.json({ success: true, movementId, replayed: true });

  let item = sqlite.get(
    `SELECT * FROM local_items
     WHERE (CAST(id AS TEXT) = ? OR postgres_id = ? OR sku = ?)
       AND adminId = ? AND storeId = ? AND deleted = 0 LIMIT 1`,
    [String(itemId), String(itemId), String(itemId), adminId, storeId]
  );

  if (!item && await isOnline()) {
    const remote = await query(
      `SELECT id, sku, name, retail_price, wholesale_price, quantity, unit
       FROM items WHERE id::text = $1 AND admin_id::text = $2 AND store_id::text = $3
         AND COALESCE(deleted, false) = false LIMIT 1`,
      [String(itemId), String(adminId), String(storeId)]
    );
    if (remote.rows.length) {
      const row = remote.rows[0];
      sqlite.run(
        `INSERT INTO local_items (postgres_id, sku, name, retail_price, wholesale_price,
          cost_price, quantity, stock_unit, adminId, storeId, syncStatus)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
        [String(row.id), row.sku, row.name, Number(row.retail_price || 0),
          Number(row.wholesale_price || 0), Number(row.wholesale_price || 0),
          Number(row.quantity || 0), row.unit || "pcs", adminId, storeId]
      );
      item = sqlite.get(
        `SELECT * FROM local_items WHERE postgres_id = ? AND adminId = ? AND storeId = ?`,
        [String(row.id), adminId, storeId]
      );
    }
  }

  if (!item) {
    res.status(404);
    throw new Error("Item not found in this store");
  }

  const delta = movementType === "damage" ? -amount : amount;
  const unitCost = req.body.unitCost == null ? null : Number(req.body.unitCost);
  if (movementType === "receive" && unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
    res.status(400);
    throw new Error("Unit cost must be zero or greater");
  }

  sqlite.transaction(() => {
    const duplicate = sqlite.get(
      `SELECT id FROM stock_movements WHERE movementId = ?`, [movementId]
    );
    if (duplicate) return;

    const oldQuantity = Number(item.quantity);
    const newQuantity = oldQuantity + delta;
    if (newQuantity < 0) {
      res.status(409);
      throw new Error("Stock adjustment cannot make inventory negative");
    }

    let newCost = Number(item.cost_price || item.wholesale_price || 0);
    if (movementType === "receive" && unitCost != null && newQuantity > 0) {
      newCost = (oldQuantity * newCost + amount * unitCost) / newQuantity;
    }

    const changed = sqlite.run(
      `UPDATE local_items SET quantity = ?, cost_price = ?, updatedAt = CURRENT_TIMESTAMP,
        syncStatus = 'pending' WHERE id = ? AND adminId = ? AND storeId = ?`,
      [newQuantity, newCost, item.id, adminId, storeId]
    );
    if (changed.changes !== 1) throw new Error("Inventory changed; reload and retry");

    sqlite.run(
      `INSERT INTO stock_movements (movementId, itemId, movementType, quantity,
        unitCost, supplierName, adminId, storeId, createdBy, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [movementId, item.id, movementType, delta, unitCost,
        req.body.supplierName || null, adminId, storeId, req.user.id,
        req.body.notes || null]
    );
  });

  res.status(201).json({ success: true, movementId, quantity: Number(item.quantity) + delta });
});

const getStockMovements = asyncHandler(async (req, res) => {
  const { adminId, storeId } = getTenant(req);
  const movements = sqlite.all(
    `SELECT movementId, itemId, movementType, quantity, unitCost,
        supplierName, createdBy, referenceId, notes, createdAt
     FROM stock_movements
     WHERE adminId = ? AND storeId = ?
     ORDER BY createdAt DESC LIMIT 500`,
    [adminId, storeId]
  );
  res.json(movements);
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
  getStockMovements,
  importItemsFromCSV,
  erpSync,
  processEdi850,
  getWeeklyBestItems,
};