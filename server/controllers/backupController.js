const asyncHandler = require("express-async-handler");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const Item = require("../models/Item");
const Sale = require("../models/Sale");

/* =====================================================
   APP DATA DIR (SAME AS DB)
===================================================== */
function getAppDataDir() {
  const appName = "SmartStockPOS";

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA, appName);
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      appName
    );
  }

  return path.join(os.homedir(), ".config", appName);
}

const DATA_DIR = getAppDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "data.db");
const BACKUP_DB_PATH = path.join(DATA_DIR, "backup.db");

/* =====================================================
   EXPORT BACKUP
===================================================== */
const exportBackup = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const items = await Item.find({ createdBy: userId });
  const sales = await Sale.find({ createdBy: userId });

  const backupData = {
    userId,
    timestamp: new Date(),
    items,
    sales,
  };

  await fs.ensureDir(UPLOADS_DIR);

  const fileName = `backup-${userId}-${Date.now()}.json`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  await fs.writeJson(filePath, backupData, { spaces: 2 });

  res.download(filePath, fileName, async () => {
    setTimeout(() => fs.remove(filePath), 5000);
  });
});

/* =====================================================
   IMPORT BACKUP
===================================================== */
const importBackup = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No backup file uploaded");
  }

  const data = await fs.readJson(req.file.path);
  const userId = req.user.id;

  await Item.deleteMany({ createdBy: userId });
  await Sale.deleteMany({ createdBy: userId });

  await Item.insertMany(
    data.items.map(i => ({ ...i, _id: undefined, createdBy: userId }))
  );

  await Sale.insertMany(
    data.sales.map(s => ({ ...s, _id: undefined, createdBy: userId }))
  );

  await fs.remove(req.file.path);

  res.json({ message: "Backup imported successfully" });
});

/* =====================================================
   SQLITE FILE BACKUP
===================================================== */
const backupDatabase = asyncHandler(async (req, res) => {
  await fs.copy(DB_PATH, BACKUP_DB_PATH);
  res.json({ message: "Database backup completed" });
});

const restoreDatabase = asyncHandler(async (req, res) => {
  await fs.copy(BACKUP_DB_PATH, DB_PATH);
  res.json({ message: "Database restored" });
});

module.exports = {
  exportBackup,
  importBackup,
  backupDatabase,
  restoreDatabase,
};
