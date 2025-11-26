const express = require("express");
const router = express.Router();
const { validateKey, assignKey } = require("../controllers/keyController");

router.post("/validate", validateKey);
router.post("/assign", assignKey);

module.exports = router;