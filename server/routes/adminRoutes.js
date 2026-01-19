const express = require("express");
const router = express.Router();
const {
  createUser,
  getUsers,
  resetPassword,
} = require("../controllers/adminController");
const { protect, adminOnly } = require("../middleware/auth");

router.use(protect, adminOnly);

router.post("/users", createUser);
router.get("/users", getUsers);
router.post("/reset-password", resetPassword);

module.exports = router;
