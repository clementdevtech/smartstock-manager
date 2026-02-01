const router = require("express").Router();
//const protect = require("../middleware/authMiddleware");
const {
  createEmployee,
  getEmployees,
} = require("../controllers/employeeController");

//router.use(protect);
router.post("/", createEmployee);
router.get("/", getEmployees);

module.exports = router;
