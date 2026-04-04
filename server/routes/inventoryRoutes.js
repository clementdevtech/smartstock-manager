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
const path = require("path");
const fs = require("fs");
const os = require("os");

/* =====================================================
   SAFE UPLOAD DIRECTORY (PRODUCTION READY)
===================================================== */

const uploadDir = path.join(
  process.env.APPDATA || os.homedir(),
  "SmartStockPOS",
  "uploads"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

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

// Stock movements
router.post("/stock-movements", protect, createStockMovement);

// ERP Sync
router.post("/erp-sync", protect, erpSync);

// EDI 850
router.post("/850", protect, processEdi850);

// CSV Import
router.post(
  "/import/csv",
  protect,
  upload.single("file"),
  importItemsFromCSV
);

module.exports = router;