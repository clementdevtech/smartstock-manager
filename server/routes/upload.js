const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartstock/logos", // Cloudinary folder
    allowed_formats: ["png", "jpg", "jpeg", "webp"],
    transformation: [{ width: 600, height: 600, crop: "limit" }],
  },
});

// Multer with Cloudinary storage
const upload = multer({ storage });

router.post("/logo", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    // Multer + Cloudinary automatically adds secure_url
    res.json({
      url: req.file.path, // secure URL from Cloudinary
      public_id: req.file.filename, // Cloudinary public id
    });
  } catch (error) {
    console.error("Upload failed:", error);
    res.status(500).json({ message: "Upload failed", error });
  }
});

module.exports = router;
