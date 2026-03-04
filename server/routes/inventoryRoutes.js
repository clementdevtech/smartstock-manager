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
  erpSync,
  processEdi850,
  importItemsFromCSV,
} = require("../controllers/inventoryController");

const { protect } = require("../middleware/authMiddleware");
const multer = require("multer");

const upload = multer({ dest: "uploads/" });

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
router.post("/erp-sync", erpSync);
router.post("/850", processEdi850);
router.post(
  "/api/items/import/csv",
  upload.single("file"),
  importItemsFromCSV
);

module.exports = router;

