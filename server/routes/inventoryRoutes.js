const express = require("express");
const router = express.Router();

const {
  getItems,
  getItemById,
  getItemByBarcode,
  createItem,
  updateItem,
  deleteItem,
  createStockMovement,
} = require("../controllers/inventoryController");

const { protect } = require("../middleware/authMiddleware");

/* =====================================================
   INVENTORY ROUTES (PROTECTED)
===================================================== */

// Get all items for current store
router
  .route("/")
  .get(protect, getItems)
  .post(protect, createItem);

// Barcode / SKU scan (POS & inventory lookup)
router.get("/scan/:sku", protect, getItemByBarcode);

// Single item by ID
router
  .route("/:id")
  .get(protect, getItemById)
  .put(protect, updateItem)
  .delete(protect, deleteItem);


router.post("/stock-movements", createStockMovement);

module.exports = router;

