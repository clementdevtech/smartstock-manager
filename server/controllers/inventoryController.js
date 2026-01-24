const asyncHandler = require("express-async-handler");
const Item = require("../models/Item");
const Sale = require("../models/Sale");
const sendEmail = require("../utils/email");

/**
 * ASSUMPTIONS:
 * req.user contains:
 *  - req.user.id
 *  - req.user.storeId
 *  - req.user.adminId
 *  - req.user.email   (store owner / admin email)
 */

/* =====================================================
   INTERNAL: LOW STOCK EMAIL
===================================================== */
const sendLowStockEmail = async (item, userEmail) => {
  if (!userEmail) return;

  const html = `
    <h2>⚠️ Low Stock Alert</h2>
    <p>The following item is running low:</p>
    <ul>
      <li><strong>Name:</strong> ${item.name}</li>
      <li><strong>SKU:</strong> ${item.sku}</li>
      <li><strong>Quantity Left:</strong> ${item.quantity}</li>
      <li><strong>Low Stock Threshold:</strong> ${item.lowStockThreshold}</li>
    </ul>
    <p>Please restock soon to avoid lost sales.</p>
    <hr />
    <small>SmartStock Manager</small>
  `;

  await sendEmail(
    userEmail,
    `⚠️ Low Stock Alert: ${item.name}`,
    html
  );
};

/* =====================================================
   @desc    Get all items
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const items = await Item.find({
    store: req.user.storeId,
    admin: req.user.adminId || req.user.id,
  }).sort({ createdAt: -1 });

  res.json(items);
});

/* =====================================================
   @desc    Get single item
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }

  if (
    item.store.toString() !== req.user.storeId ||
    item.admin.toString() !== (req.user.adminId || req.user.id)
  ) {
    res.status(403);
    throw new Error("Not authorized");
  }

  res.json(item);
});

/* =====================================================
   @desc    Get item by barcode (POS)
===================================================== */
const getItemByBarcode = asyncHandler(async (req, res) => {
  const item = await Item.findOne({
    sku: req.params.sku,
    store: req.user.storeId,
    admin: req.user.adminId || req.user.id,
  });

  if (!item) {
    res.status(404);
    throw new Error("Item not found for this barcode");
  }

  res.json(item);
});

/* =====================================================
   @desc    Create item
===================================================== */
const createItem = asyncHandler(async (req, res) => {
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

  if (!name || !sku || !retailPrice || !quantity || !entryDate) {
    res.status(400);
    throw new Error("Missing required fields");
  }

  const exists = await Item.findOne({
    sku,
    store: req.user.storeId,
    admin: req.user.adminId || req.user.id,
  });

  if (exists) {
    res.status(400);
    throw new Error("This barcode already exists in this store");
  }

  const item = await Item.create({
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
    admin: req.user.adminId || req.user.id,
    store: req.user.storeId,
    createdBy: req.user.id,
  });

  // 🔔 Low stock check on creation
  if (item.quantity <= item.lowStockThreshold) {
    await sendLowStockEmail(item, req.user.email);
  }

  res.status(201).json(item);
});

/* =====================================================
   @desc    Update item (POS stock deduction hits here)
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }

  if (
    item.store.toString() !== req.user.storeId ||
    item.admin.toString() !== (req.user.adminId || req.user.id)
  ) {
    res.status(403);
    throw new Error("Not authorized");
  }

  const updatedItem = await Item.findByIdAndUpdate(
    req.params.id,
    { ...req.body, createdBy: req.user.id },
    { new: true, runValidators: true }
  );

  // 🔔 Low stock alert AFTER update
  if (
    updatedItem.quantity <= updatedItem.lowStockThreshold
  ) {
    await sendLowStockEmail(updatedItem, req.user.email);
  }

  res.json(updatedItem);
});

/* =====================================================
   @desc    Delete item
===================================================== */
const deleteItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }

  if (
    item.store.toString() !== req.user.storeId ||
    item.admin.toString() !== (req.user.adminId || req.user.id)
  ) {
    res.status(403);
    throw new Error("Not authorized");
  }

  await item.deleteOne();
  res.json({ message: "Item removed successfully" });
});

/* =====================================================
   @desc    WEEKLY BEST ITEMS REPORT (CRON READY)
===================================================== */
const getWeeklyBestItems = asyncHandler(async (req, res) => {
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const report = await Sale.aggregate([
    { $unwind: "$items" },
    { $match: { createdAt: { $gte: start } } },
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
