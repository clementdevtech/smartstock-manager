/**
 * server/server.js
 * Entry point for SmartStock Manager Pro backend.
 *
 * Features included:
 * - Express server
 * - MongoDB (Mongoose) connection using dotenv (see server/config/db.js)
 * - CORS and JSON body parsing
 * - Basic logging middleware
 * - Routes mounted for /api/items, /api/sales, /api/users, /api/backup
 * - Simple error handler
 *
 * Later files you'll receive (one at a time as requested):
 *  - config/db.js
 *  - models: User.js, Item.js, Sale.js
 *  - routes: inventoryRoutes.js, salesRoutes.js, userRoutes.js, backupRoutes.js
 *  - controllers for each resource
 *
 * Usage:
 *  - Create a .env file in server/:
 *      MONGO_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/smartstock?retryWrites=true&w=majority
 *      JWT_SECRET=your_jwt_secret_here
 *      PORT=4000
 *
 *  - Install dependencies in server/:
 *      npm init -y
 *      npm i express mongoose dotenv cors morgan bcryptjs jsonwebtoken multer fs-extra
 *
 *  - Run:
 *      node server.js
 *    (or use nodemon for dev)
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const connectDB = require('./config/db');

// route files (will be provided individually next)
const inventoryRoutes = require('./routes/inventoryRoutes');
const salesRoutes = require('./routes/salesRoutes');
const userRoutes = require('./routes/userRoutes');
const backupRoutes = require('./routes/backupRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Simple request logger matching "vibe"
app.use((req, res, next) => {
  // keep it concise and informative like the UI
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// API routes
app.use('/api/items', inventoryRoutes);   // Inventory CRUD
app.use('/api/sales', salesRoutes);       // Sales / POS endpoints
app.use('/api/users', userRoutes);         // Auth: sign-up / sign-in
app.use('/api/backup', backupRoutes);     // Backup & restore endpoints

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve client build in production (optional)
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  } else {
    console.warn('Production client build not found at', clientBuildPath);
  }
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  res.status(err.status || 500).json({
    message: err.message || 'Server error',
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 SmartStock backend running on http://localhost:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
