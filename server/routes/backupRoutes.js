/**
 * server/routes/backupRoutes.js
 * Routes for exporting and importing data backups in SmartStock Manager Pro
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const {
  exportBackup,
  importBackup,
} = require('../controllers/backupController');

// Multer setup for uploading backup files
const upload = multer({ dest: 'uploads/' });

// Export current user data (Inventory + Sales)
router.get('/export', protect, exportBackup);

// Import previously saved backup
router.post('/import', protect, upload.single('backupFile'), importBackup);

module.exports = router;
