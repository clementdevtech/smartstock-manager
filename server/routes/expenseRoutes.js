const router = require("express").Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createExpense,
  getExpenses,
  payExpense,
  createSupplierPayment,
  getSupplierPayments,
} = require("../controllers/expenseController");

router.use(protect);
router.post("/", createExpense);
router.get("/", getExpenses);
router.get("/supplier-payments", getSupplierPayments);
router.post("/supplier-payments", createSupplierPayment);
router.post("/:id/pay", payExpense);

module.exports = router;
