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
  getWeeklyBestItems
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

/* =====================================================
   MULTER STORAGE
===================================================== */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

/* =====================================================
   FILE FILTER (CSV ONLY)
===================================================== */

const fileFilter = (req, file, cb) => {
  const allowed = [".csv"];

  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowed.includes(ext)) {
    return cb(new Error("Only CSV files allowed"));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

/* =====================================================
   INVENTORY ROUTES (PROTECTED)
===================================================== */

/* ===============================
   ITEMS
=============================== */

// Get all items / Create item
router
  .route("/")
  .get(protect, getItems)
  .post(protect, createItem);

/* ===============================
   BARCODE / SCAN
=============================== */

router.get("/scan/:sku", protect, getItemByBarcode);

/* ===============================
   SINGLE ITEM
=============================== */

router
  .route("/:id")
  .get(protect, getItemById)
  .put(protect, updateItem)
  .delete(protect, deleteItem);

/* ===============================
   STOCK MOVEMENTS
=============================== */

router.post(
  "/stock-movements",
  protect,
  createStockMovement
);

/* ===============================
   WEEKLY BEST ITEMS
=============================== */

router.get(
  "/analytics/weekly-best",
  protect,
  getWeeklyBestItems
);

/* ===============================
   ERP SYNC
=============================== */

router.post(
  "/erp-sync",
  protect,
  erpSync
);

/* ===============================
   EDI 850
=============================== */

router.post(
  "/edi/850",
  protect,
  processEdi850
);

/* ===============================
   CSV IMPORT
=============================== */

router.post(
  "/import/csv",
  protect,
  upload.single("file"),
  importItemsFromCSV
);

/* =====================================================
   HEALTH CHECK
===================================================== */

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "inventory",
    timestamp: new Date(),
  });
});

module.exports = router;