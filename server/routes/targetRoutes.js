const router = require("express").Router();
//const protect = require("../middleware/authMiddleware");
const {
  generateAutoTarget,
  getActiveTarget,
} = require("../controllers/targetController");

//router.use(protect);

router.post("/auto", generateAutoTarget);
router.get("/:period", getActiveTarget);

module.exports = router;
