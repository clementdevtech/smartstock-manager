const asyncHandler = require("express-async-handler");
const Item = require("../models/Item");

/**
 * ASSUMPTIONS (important):
 * req.user contains:
 *  - req.user.id        → logged-in user
 *  - req.user.storeId   → active store
 *  - req.user.adminId   → system owner (admin)
 */

/* =====================================================
   @desc    Get all items for current store
   @route   GET /api/items
   @access  Private
===================================================== */
const getItems = asyncHandler(async (req, res) => {
  const items = await Item.find({
    store: req.user.storeId,
    admin: req.user.adminId || req.user.id,
  }).sort({ createdAt: -1 });

  res.json(items);
});

/* =====================================================
   @desc    Get single item by ID (store-scoped)
   @route   GET /api/items/:id
   @access  Private
===================================================== */
const getItemById = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }

  // 🔒 Prevent cross-store access
  if (
    item.store.toString() !== req.user.storeId ||
    item.admin.toString() !== (req.user.adminId || req.user.id)
  ) {
    res.status(403);
    throw new Error("Not authorized to view this item");
  }

  res.json(item);
});

/* =====================================================
   @desc    Create new item
   @route   POST /api/items
   @access  Private
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

  if (!name || !wholesalePrice || !retailPrice || !quantity || !entryDate) {
    res.status(400);
    throw new Error("Please fill all required fields");
  }

  const item = new Item({
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

    // 🔐 Ownership mapping
    admin: req.user.adminId || req.user.id,
    store: req.user.storeId,
    createdBy: req.user.id,
  });

  const savedItem = await item.save();
  res.status(201).json(savedItem);
});

/* =====================================================
   @desc    Update existing item
   @route   PUT /api/items/:id
   @access  Private
===================================================== */
const updateItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error("Item not found");
  }

  // 🔒 Store & admin protection
  if (
    item.store.toString() !== req.user.storeId ||
    item.admin.toString() !== (req.user.adminId || req.user.id)
  ) {
    res.status(403);
    throw new Error("Not authorized to update this item");
  }

  const updatedItem = await Item.findByIdAndUpdate(
    req.params.id,
    {
      ...req.body,
      createdBy: req.user.id, // track last editor
    },
    { new: true, runValidators: true }
  );

  res.json(updatedItem);
});

/* =====================================================
   @desc    Delete item
   @route   DELETE /api/items/:id
   @access  Private
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
    throw new Error("Not authorized to delete this item");
  }

  await item.deleteOne();
  res.json({ message: "Item removed successfully" });
});

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
};
