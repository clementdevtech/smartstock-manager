const router = require("express").Router();
//const protect = require("../middleware/authMiddleware");
const {
  createExpense,
  getExpenses,
} = require("../controllers/expenseController");

//router.use(protect);
router.post("/", createExpense);
router.get("/", getExpenses);

module.exports = router;
