const jwt = require("jsonwebtoken");
const { query } = require("../config/db"); // safe Postgres wrapper
const db = require("../sqlite"); // SQLite for offline/local users

const protect = async (req, res, next) => {
  let token;

  // 1️⃣ Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "Not authorized, no token provided" });
  }

  try {
    // 2️⃣ Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user = null;

    // 3️⃣ Try Postgres first
    try {
      const result = await query(
        "SELECT id, name, email, role FROM users WHERE id = $1",
        [decoded.id]
      );
      if (result.rows.length) {
        user = result.rows[0];
      }
    } catch (err) {
      console.warn("Postgres query failed, fallback to SQLite:", err.message);
    }

    // 4️⃣ Fallback to SQLite (offline users)
    if (!user) {
      const local = db.get(
        "SELECT email, storeName AS name, 'user' AS role FROM local_users WHERE email = ?",
        [decoded.email]
      );
      if (local) user = local;
    }

    // 5️⃣ User not found anywhere
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // ✅ Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error("JWT auth error:", err.message);
    return res
      .status(401)
      .json({ message: "Not authorized, invalid token" });
  }
};

module.exports = { protect };
