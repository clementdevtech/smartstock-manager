const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const db = require("../sqlite");
const { query } = require("../config/db");

const router = express.Router();

/* ================= ONLINE STORAGE ================= */
const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "smartstock/logos",
    allowed_formats: ["png", "jpg", "jpeg", "webp"],
    transformation: [{ width: 600, height: 600, crop: "limit" }],
  },
});

const uploadOnline = multer({ storage: cloudStorage });

/* ================= OFFLINE STORAGE ================= */
const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, "../uploads/logos");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const uploadOffline = multer({ storage: diskStorage });

/* ================= ROUTE ================= */
router.post("/logo", async (req, res) => {
  let online = true;
  try {
    await query("SELECT 1");
  } catch {
    online = false;
  }

  const uploader = online ? uploadOnline : uploadOffline;

  uploader.single("file")(req, res, async (err) => {
    if (err)
      return res.status(400).json({ message: err.message });

    if (!req.file)
      return res.status(400).json({ message: "No file uploaded" });

    // ONLINE
    if (online) {
      return res.json({
        mode: "online",
        url: req.file.path,
        public_id: req.file.filename,
      });
    }

    // OFFLINE
    db.run(
      `
      INSERT INTO offline_logos (store_name, local_path)
      VALUES (?,?)
      `,
      [req.body.storeName, req.file.path]
    );

    res.json({
      mode: "offline",
      message: "Saved locally. Will sync later.",
    });
  });
});

module.exports = router;
