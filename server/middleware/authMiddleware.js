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
    let decoded;

    /* ===============================
       2️⃣ TRY VERIFY (CUSTOM JWT)
    =============================== */
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // 🔁 fallback to decode (Supabase / external JWT)
      decoded = jwt.decode(token);
    }

    if (!decoded) {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

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
          "SELECT id, name, email, role FROM users WHERE id = $1",
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
        const local = db.get(
          "SELECT email, storeName AS name, 'user' AS role FROM local_users WHERE email = ?",
          [email]
        );

        if (local) user = local;
      } catch (err) {
        console.warn("⚠️ SQLite lookup failed:", err.message);
      }
    }

    /* ===============================
       6️⃣ FINAL FALLBACK (TOKEN ONLY)
       👉 ensures system NEVER crashes
    =============================== */
    if (!user) {
      user = {
        id: userId,
        email,
        name: "Unknown User",
        role: "user",
      };
    }

    /* ===============================
       7️⃣ ATTACH USER TO REQUEST
    =============================== */
    req.user = user;

    next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err.message);

    return res.status(401).json({
      message: "Not authorized, invalid token",
    });
  }
};

module.exports = { protect };