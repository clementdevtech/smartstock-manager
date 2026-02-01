const pool = require("../config/db");

module.exports = async function checkLicense(req, res, next) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ message: "Unauthorized" });

    const result = await pool.query(
      `SELECT activated
       FROM licensed_users
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({ message: "No license found" });
    }

    if (!result.rows[0].activated) {
      return res.status(403).json({ message: "License inactive" });
    }

    next();
  } catch (err) {
    console.error("License check failed:", err);
    res.status(500).json({ message: "License validation error" });
  }
};
