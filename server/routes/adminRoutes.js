const express = require("express");
const router = express.Router();
const {
  createUser,
  getUsers,
  resetPassword,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.post("/users", createUser);
router.get("/users", getUsers);
router.post("/reset-password", resetPassword);

module.exports = router;
