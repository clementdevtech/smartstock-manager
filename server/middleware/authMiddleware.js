const jwt = require("jsonwebtoken");
const { query } = require("../config/db"); // Postgres
const db = require("../sqlite"); // SQLite (offline)

/* =====================================================
   AUTH MIDDLEWARE (HYBRID: SUPABASE + CUSTOM JWT)
===================================================== */
const protect = async (req, res, next) => {
  let token;

  /* ===============================
     1️⃣ EXTRACT TOKEN
  =============================== */
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      message: "Not authorized, no token provided",
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(401).json({
        message: "Authentication is not configured",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    /* ===============================
       3️⃣ NORMALIZE USER DATA
    =============================== */
    const userId = decoded.id || decoded.sub;
    const email = decoded.email || null;

    let user = null;

    /* ===============================
       4️⃣ POSTGRES LOOKUP (ONLINE)
    =============================== */
    if (userId) {
      try {
        const result = await query(
          `SELECT u.id, u.name, u.email, u.role, s.id AS "storeId"
           FROM users u
           LEFT JOIN stores s ON s.admin_id = u.id
           WHERE u.id = $1`,
          [userId]
        );

        if (result.rows.length) {
          user = result.rows[0];
        }
      } catch (err) {
        console.warn(
          "⚠️ Postgres query failed, fallback to SQLite:",
          err.message
        );
      }
    }

    /* ===============================
       5️⃣ SQLITE FALLBACK (OFFLINE)
    =============================== */
    if (!user && email) {
      try {
        const local = await db.get(
          `SELECT id, email, storeName AS name, role, storeId, adminId
           FROM local_users WHERE email = ?`,
          [email.toLowerCase()]
        );

        if (local) user = local;
      } catch (err) {
        console.warn("⚠️ SQLite lookup failed:", err.message);
      }
    }

    /* A verified token can authorize a cached session while Postgres is offline. */
    if (!user) {
      if (!userId || !["admin", "user"].includes(decoded.role)) {
        return res.status(401).json({ message: "Invalid token claims" });
      }
      user = {
        id: userId,
        email,
        name: decoded.name || "Offline user",
        role: decoded.role,
        storeId: decoded.storeId || null,
        adminId: decoded.adminId || userId,
      };
    }

    /* ===============================
       7️⃣ ATTACH USER TO REQUEST
    =============================== */
    req.user = {
      ...user,
      adminId: user.adminId || user.id,
      storeId: user.storeId || decoded.storeId || null,
    };

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);

    return res.status(401).json({
      message: "Not authorized, invalid token",
    });
  }
};

module.exports = { protect };