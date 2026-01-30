const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Item = require("../models/Item");
const Sale = require("../models/Sale");
const sendEmail = require("../utils/email");
const sqlite = require("../db/sqlite");

/* =====================================================
   HELPERS
===================================================== */
const isOnline = () => mongoose.connection.readyState === 1;

const getTenant = (req) => ({
  storeId: req.user.storeId,
  adminId: req.user.adminId || req.user.id,
});

/* =====================================================
   INTERNAL: LOW STOCK EMAIL
===================================================== */
const sendLowStockEmail = async (item, userEmail) => {
  if (!userEmail) return;

  const html = `
    <h2>⚠️ Low Stock Alert</h2>
    <ul>
      <li><strong>Name:</strong> ${item.name}</li>
      <li><strong>SKU:</strong> ${item.sku}</li>
      <li><strong>Quantity Left:</strong> ${item.quantity}</li>
      <li><strong>Threshold:</strong> ${item.lowStockThreshold}</li>
    </ul>
    <small>SmartStock Manager</small>
  `;

  await sendEmail(userEmail, `Low Stock: ${item.name}`, html);
};

/* =====================================================
   GET ITEMS (SQLite → Mongo fallback)
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);

  // 📴 OFFLINE → SQLITE
  const localItems = sqlite.all(
    `SELECT * FROM local_items
     WHERE storeId = ? AND adminId = ?
     ORDER BY updatedAt DESC`,
    [storeId, adminId]
  );

  if (!isOnline()) {
    return res.json(localItems);
  }

  // ☁️ ONLINE → MongoDB sync refresh
  const remoteItems = await Item.find({
    store: storeId,
    admin: adminId,
  }).sort({ updatedAt: -1 });

  res.json(remoteItems);
});

/* =====================================================
   GET ITEM BY ID (SQLite-first)
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE mongoId = ? AND storeId = ? AND adminId = ?`,
    [req.params.id, storeId, adminId]
  );

  if (local) return res.json(local);

  if (!isOnline()) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const remote = await Item.findOne({
    _id: req.params.id,
    store: storeId,
    admin: adminId,
  });

  if (!remote) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(remote);
});

/* =====================================================
   GET ITEM BY BARCODE (POS CORE)
===================================================== */
const getItemByBarcode = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);

  const local = sqlite.get(
    `SELECT * FROM local_items
     WHERE sku = ? AND storeId = ? AND adminId = ?`,
    [req.params.sku, storeId, adminId]
  );

  if (local) return res.json(local);

  if (!isOnline()) {
    res.status(404);
    throw new Error("Item not found offline");
  }

  const remote = await Item.findOne({
    sku: req.params.sku,
    store: storeId,
    admin: adminId,
  });

  if (!remote) {
    res.status(404);
    throw new Error("Item not found");
  }

  res.json(remote);
});

/* =====================================================
   CREATE ITEM (OFFLINE FIRST)
===================================================== */
const createItem = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);
  const {
    name,
    sku,
    category,
    unit,
    wholesalePrice,
    retailPrice,
    quantity,
    entryDate,
    expiryDate,
    batchNumber,
    supplier,
    imageUrl,
    lowStockThreshold,
  } = req.body;

  // 🗄️ Write to SQLite FIRST
  sqlite.run(
    `INSERT INTO local_items
     (sku, name, category, unit, wholesalePrice, retailPrice,
      quantity, lowStockThreshold, batchNumber, expiryDate,
      adminId, storeId, lastSyncedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      sku,
      name,
      category,
      unit,
      wholesalePrice,
      retailPrice,
      quantity,
      lowStockThreshold,
      batchNumber,
      expiryDate,
      adminId,
      storeId,
    ]
  );

  sqlite.run(
    `INSERT INTO sync_log (entity, action)
     VALUES ('item', 'create')`
  );

  // ☁️ Sync immediately if online
  if (isOnline()) {
    const mongoItem = await Item.create({
      name,
      sku,
      category,
      unit,
      wholesalePrice,
      retailPrice,
      quantity,
      entryDate,
      expiryDate,
      batchNumber,
      supplier,
      imageUrl,
      lowStockThreshold,
      admin: adminId,
      store: storeId,
      createdBy: req.user.id,
    });

    sqlite.run(
      `UPDATE local_items
       SET mongoId = ?, lastSyncedAt = CURRENT_TIMESTAMP
       WHERE sku = ? AND storeId = ? AND adminId = ?`,
      [mongoItem._id.toString(), sku, storeId, adminId]
    );
  }

  res.status(201).json({ message: "Item created (offline-first)" });
});

/* =====================================================
   UPDATE ITEM (POS SAFE)
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);

  sqlite.run(
    `UPDATE local_items
     SET quantity = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE mongoId = ? AND storeId = ? AND adminId = ?`,
    [req.body.quantity, req.params.id, storeId, adminId]
  );

  sqlite.run(
    `INSERT INTO sync_log (entity, action)
     VALUES ('item', 'update')`
  );

  if (isOnline()) {
    await Item.findOneAndUpdate(
      { _id: req.params.id, store: storeId, admin: adminId },
      { ...req.body, createdBy: req.user.id },
      { runValidators: true }
    );
  }

  res.json({ message: "Item updated (offline-first)" });
});

/* =====================================================
   DELETE ITEM
===================================================== */
const deleteItem = asyncHandler(async (req, res) => {
  const { storeId, adminId } = getTenant(req);

  sqlite.run(
    `DELETE FROM local_items
     WHERE mongoId = ? AND storeId = ? AND adminId = ?`,
    [req.params.id, storeId, adminId]
  );

  sqlite.run(
    `INSERT INTO sync_log (entity, action)
     VALUES ('item', 'delete')`
  );

  if (isOnline()) {
    await Item.deleteOne({
      _id: req.params.id,
      store: storeId,
      admin: adminId,
    });
  }

  res.json({ message: "Item deleted (offline-first)" });
});

/* =====================================================
   WEEKLY BEST ITEMS (ONLINE ONLY)
===================================================== */
const getWeeklyBestItems = asyncHandler(async (req, res) => {
  if (!isOnline()) {
    return res.json([]);
  }

  const start = new Date();
  start.setDate(start.getDate() - 7);

  const report = await Sale.aggregate([
    {
      $match: {
        createdAt: { $gte: start },
        store: req.user.storeId,
        admin: req.user.adminId || req.user.id,
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.item",
        totalSold: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.total" },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 10 },
  ]);

  res.json(report);
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
