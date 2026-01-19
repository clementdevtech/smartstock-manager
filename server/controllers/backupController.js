const asyncHandler = require('express-async-handler');
const fs = require('fs-extra');
const path = require('path');
const Item = require('../models/Item');
const Sale = require('../models/Sale');


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

  const backupFile = `backup-${userId}-${Date.now()}.json`;
  const backupPath = path.join(__dirname, '..', 'uploads', backupFile);

  await fs.ensureDir(path.join(__dirname, '..', 'uploads'));
  await fs.writeJson(backupPath, backupData, { spaces: 2 });

  res.download(backupPath, backupFile, (err) => {
    if (err) {
      console.error('Backup download failed:', err);
      res.status(500).json({ message: 'Backup failed' });
    }
    // Optional: delete file after sending
    setTimeout(() => fs.remove(backupPath), 5000);
  });
});

// @desc    Import data from uploaded JSON file
// @route   POST /api/backup/import
// @access  Private
const importBackup = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const filePath = req.file.path;

  if (!req.file) {
    res.status(400);
    throw new Error('No backup file uploaded');
  }

  try {
    const data = await fs.readJson(filePath);

    // Clear existing user data (optional)
    await Item.deleteMany({ createdBy: userId });
    await Sale.deleteMany({ createdBy: userId });

    // Reinsert items and sales
    const newItems = data.items.map((i) => ({
      ...i,
      _id: undefined,
      createdBy: userId,
    }));
    const newSales = data.sales.map((s) => ({
      ...s,
      _id: undefined,
      createdBy: userId,
    }));

    await Item.insertMany(newItems);
    await Sale.insertMany(newSales);

    await fs.remove(filePath);

    res.json({
      message: 'Backup imported successfully',
      importedItems: newItems.length,
      importedSales: newSales.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500);
    throw new Error('Failed to import backup');
  }
});


const backupDatabase = async (req, res) => {
  const dbPath = path.join(__dirname, "../data.db");
  const backupPath = path.join(__dirname, "../backup.db");

  fs.copyFileSync(dbPath, backupPath);
  res.json({ message: "Backup completed successfully" });
};

const restoreDatabase = async (req, res) => {
  const dbPath = path.join(__dirname, "../data.db");
  const backupPath = path.join(__dirname, "../backup.db");

  fs.copyFileSync(backupPath, dbPath);
  res.json({ message: "Restore completed successfully" });
};

module.exports = {
  exportBackup,
  importBackup,
  backupDatabase,
  restoreDatabase,
};