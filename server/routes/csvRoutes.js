const router = require("express").Router();
//const protect = require("../middleware/authMiddleware");
const { exportCSV } = require("../controllers/csvController");

//router.use(protect);
router.get("/export/:type", exportCSV);

module.exports = router;
