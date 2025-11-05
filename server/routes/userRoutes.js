/**
 * server/routes/userRoutes.js
 * Routes for user authentication & profile in SmartStock Manager Pro
 */

const express = require('express');
const router = express.Router();

const {
  registerUser,
  loginUser,
  getUserProfile,
} = require('../controllers/userController');

const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected routes
router.get('/profile', protect, getUserProfile);

module.exports = router;
