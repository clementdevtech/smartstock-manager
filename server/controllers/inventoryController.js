/**
 * server/controllers/inventoryController.js
 * Handles CRUD operations for inventory in SmartStock Manager Pro
 */

const asyncHandler = require('express-async-handler');
const Item = require('../models/Item');

// @desc    Get all items
// @route   GET /api/items
// @access  Private
const getItems = asyncHandler(async (req, res) => {
  const items = await Item.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
  res.json(items);
});

// @desc    Get single item
// @route   GET /api/items/:id
// @access  Private
const getItemById = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  // Ensure the item belongs to the logged-in user
  if (item.createdBy.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to view this item');
  }

  res.json(item);
});

// @desc    Create new item
// @route   POST /api/items
// @access  Private
const createItem = asyncHandler(async (req, res) => {
  const {
    name,
    category,
    wholesalePrice,
    retailPrice,
    quantity,
    entryDate,
    expiryDate,
    imageUrl,
  } = req.body;

  if (!name || !category || !wholesalePrice || !retailPrice || !quantity || !entryDate) {
    res.status(400);
    throw new Error('Please fill all required fields');
  }

  const item = new Item({
    name,
    category,
    wholesalePrice,
    retailPrice,
    quantity,
    entryDate,
    expiryDate,
    imageUrl,
    createdBy: req.user.id,
  });

  const savedItem = await item.save();
  res.status(201).json(savedItem);
});

// @desc    Update existing item
// @route   PUT /api/items/:id
// @access  Private
const updateItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  if (item.createdBy.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to update this item');
  }

  const updatedItem = await Item.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  res.json(updatedItem);
});

// @desc    Delete item
// @route   DELETE /api/items/:id
// @access  Private
const deleteItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);

  if (!item) {
    res.status(404);
    throw new Error('Item not found');
  }

  if (item.createdBy.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized to delete this item');
  }

  await item.deleteOne();
  res.json({ message: 'Item removed successfully' });
});

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
};
