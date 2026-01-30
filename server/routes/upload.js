const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const router = express.Router();

/* =====================================================
   CLOUDINARY SAFE LOAD
   (prevents prod crash if env missing)
===================================================== */
let cloudinary;
let storage;

try {
  cloudinary = require("../config/cloudinary");

  storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: "smartstock/logos",
      allowed_formats: ["png", "jpg", "jpeg", "webp"],
      transformation: [{ width: 600, height: 600, crop: "limit" }],
    },
  });
} catch (err) {
  console.warn("⚠️ Cloudinary not configured. Uploads disabled.");
}

/* =====================================================
   MULTER SETUP
===================================================== */
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

/* =====================================================
   ROUTE
===================================================== */
router.post("/logo", (req, res, next) => {
  if (!storage) {
    return res.status(503).json({
      message: "Image upload service not available",
    });
  }

  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("❌ Upload error:", err.message);
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    res.json({
      url: req.file.path,       // Cloudinary secure_url
      public_id: req.file.filename,
    });
  });
});

module.exports = router;
