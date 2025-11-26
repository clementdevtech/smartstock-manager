// routes/upload.js
const express = require("express");
const multer = require("multer");
const upload = multer({ dest: "uploads/" }); // adjust storage (use cloud in prod)
const router = express.Router();

router.post("/logo", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file" });
  // In production: upload to S3/Cloudinary and return URL
  const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({ url });
});

module.exports = router;
