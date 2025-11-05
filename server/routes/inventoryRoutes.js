/**
 * server/routes/inventoryRoutes.js
 * CRUD routes for inventory items in SmartStock Manager Pro
 */

const express = require('express');
const router = express.Router();

const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
} = require('../controllers/inventoryController');

const { protect } = require('../middleware/authMiddleware');

// Protected routes (user must be logged in)
router.route('/')
  .get(protect, getItems)       // GET all items
  .post(protect, createItem);   // POST new item

router.route('/:id')
  .get(protect, getItemById)    // GET single item by ID
  .put(protect, updateItem)     // UPDATE item
  .delete(protect, deleteItem); // DELETE item

module.exports = router;
