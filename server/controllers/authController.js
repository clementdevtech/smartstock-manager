const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const { query } = require("../config/db"); // PostgreSQL (Supabase)
const db = require("../sqlite");            // SQLite (offline)
const sendEmail = require("../utils/email");

/* =====================================================
   🔐 HELPERS
===================================================== */
const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );



/* =====================================================
   1️⃣ CHECK EMAIL EXISTS
===================================================== */
exports.checkEmailExists = async (req, res) => {
  try {
    const { email } = req.query;

    const pg = await query(
      `SELECT 1 FROM users WHERE email = $1`,
      [email]
    );

    const local = db.get(
      `SELECT 1 FROM local_users WHERE email = ?`,
      [email]
    );

    res.json({ exists: pg.rowCount > 0 || !!local });
  } catch {
    res.status(500).json({ message: "Failed to check email" });
  }
};

/* =====================================================
   2️⃣ SEND VERIFICATION EMAIL
===================================================== */
exports.sendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await query(`DELETE FROM verification_codes WHERE email = $1`, [email]);

    await query(
      `
      INSERT INTO verification_codes (email, code, expires_at)
      VALUES ($1,$2, now() + interval '10 minutes')
      `,
      [email, code]
    );

    await sendEmail(
      email,
      "SmartStock Verification Code",
      `
      <h2>SmartStock Verification</h2>
      <h1>${code}</h1>
      <p>Expires in 10 minutes</p>
      `
    );

    res.json({ message: "Verification code sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send code" });
  }
};

/* =====================================================
   3️⃣ VERIFY EMAIL CODE → ISSUE RESET TOKEN
===================================================== */
exports.verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    // 1️⃣ Check verification code
    const result = await query(
      `
      SELECT * FROM verification_codes
      WHERE email = $1 AND code = $2
      `,
      [email, code]
    );

    if (!result.rowCount) {
      return res.status(400).json({ message: "Invalid code" });
    }

    const record = result.rows[0];
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ message: "Code expired" });
    }

    // 2️⃣ Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // 3️⃣ Try Postgres first
    const pgUpdate = await query(
      `
      UPDATE users
      SET reset_password_token = $1,
          reset_password_expire = now() + interval '15 minutes'
      WHERE email = $2
      RETURNING id
      `,
      [hashedToken, email]
    );

    // 4️⃣ Fallback to SQLite (offline users)
    if (!pgUpdate.rowCount) {
      db.run(
        `
        UPDATE local_users
        SET reset_password_token = ?,
            reset_password_expire = datetime('now', '+15 minutes')
        WHERE email = ?
        `,
        [hashedToken, email]
      );
    }

    // 5️⃣ Cleanup verification code
    await query(
      `DELETE FROM verification_codes WHERE email = $1`,
      [email]
    );

    // 6️⃣ Return raw token to client
    res.json({
      verified: true,
      token: resetToken
    });

  } catch (err) {
    console.error("❌ Verify email code error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
};

/* =====================================================
   4️⃣ VALIDATE PRODUCT KEY
===================================================== */
exports.validateProductKey = async (req, res) => {
  console.log("Validating product key");
  try {
    const key = req.query.productKey;
    console.log("key:", key);

    const result = await query(
      `SELECT 1 FROM product_keys WHERE key = $1 AND used = false`,
      [key]
    );

    res.json({ valid: result.rowCount > 0 });
  } catch(err) {
    console.error(`Error in validating key`, err.message);
    res.status(500).json({ message: "Key check failed" });
  }
};

/* =====================================================
   5️⃣ ASSIGN PRODUCT KEY + LICENSE
===================================================== */
exports.assignProductKeyToEmail = async (req, res) => {
  try {
    const { email, productKey } = req.body;
    const key = productKey;

    const result = await query(
      `
      UPDATE product_keys
      SET used = true, assigned_email = $1
      WHERE key = $2 AND used = false
      `,
      [email, key]
    );

    if (!result.rowCount)
      return res.status(400).json({ message: "Invalid or used key" });

    await query(
      `
      INSERT INTO licensed_users (email, product_key, activated)
      VALUES ($1,$2,true)
      ON CONFLICT (email)
      DO UPDATE SET
        activated = true,
        activated_at = now()
      `,
      [email, key]
    );

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Failed to assign key" });
  }
};

/* =====================================================
   6️⃣ VALIDATE INVITE CODE
===================================================== */
exports.validateInviteCode = async (req, res) => {
  try {
    const { code } = req.query;

    const result = await query(
      `SELECT 1 FROM invite_codes WHERE code = $1 AND used = false`,
      [code]
    );

    res.json({ valid: result.rowCount > 0 });
  } catch {
    res.status(500).json({ message: "Invite check failed" });
  }
};

/* =====================================================
   7️⃣ REGISTER
===================================================== */
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      storeName,
      phone,
      country,
      logoUrl,
      productKey,
      inviteCode
    } = req.body;

    if (!email || !password || !storeName) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const hashed = await bcrypt.hash(password, 12);

    /* =====================================================
       🔎 CHECK IF FIRST ADMIN
    ===================================================== */
    const adminCount = await query(`SELECT COUNT(*) FROM users`);
    const isFirstAdmin = Number(adminCount.rows[0].count) === 0;

    /* =====================================================
       🥇 FIRST ADMIN → POSTGRES + PRODUCT KEY
    ===================================================== */
    if (isFirstAdmin) {
      /* ---------- Product key is REQUIRED ---------- */
      if (!productKey) {
        return res.status(400).json({ message: "Product key required" });
      }

      /* ---------- Validate product key ---------- */
      const keyResult = await query(
        `
        SELECT id FROM product_keys
        WHERE key = $1 AND used = false
        `,
        [productKey]
      );

      if (!keyResult.rowCount) {
        return res.status(400).json({ message: "Invalid or used product key" });
      }

      /* ---------- Optional invite code ---------- */
      if (inviteCode) {
        const invite = await query(
          `
          SELECT 1 FROM invite_codes
          WHERE code = $1 AND used = false
          `,
          [inviteCode]
        );

        if (!invite.rowCount) {
          return res.status(400).json({ message: "Invalid invite code" });
        }
      }

      /* ---------- Create admin user ---------- */
      const result = await query(
        `
        INSERT INTO users (name, email, phone, password, role)
        VALUES ($1,$2,$3,$4,'admin')
        RETURNING *
        `,
        [storeName, email, phone, hashed]
      );

      const adminUser = result.rows[0];

      /* ---------- Mark product key as used ---------- */
      await query(
        `
        UPDATE product_keys
        SET used = true,
            assigned_email = $1
        WHERE key = $2
        `,
        [email, productKey]
      );

      /* ---------- Mark invite code as used ---------- */
      if (inviteCode) {
        await query(
          `UPDATE invite_codes SET used = true WHERE code = $1`,
          [inviteCode]
        );
      }

      /* ---------- Create store ---------- */
      const storeResult = await query(
        `
        INSERT INTO stores (name, admin_id)
        VALUES ($1, $2)
        RETURNING id
        `,
        [storeName, adminUser.id]
      );

      const storeId = storeResult.rows[0].id;

      /* ---------- Create business settings ---------- */
      await query(
        `
        INSERT INTO business_settings (store_id, admin_id)
        VALUES ($1, $2)
        `,
        [storeId, adminUser.id]
      );

      return res.json({
        user: adminUser,
        role: "admin",
        token: generateToken(adminUser)
      });
    }

    /* =====================================================
       👤 NORMAL USER → SQLITE ONLY
       ❌ NO PRODUCT KEY
    ===================================================== */

    const existingLocal = db.get(
      `SELECT 1 FROM local_users WHERE email = ?`,
      [email]
    );

    if (existingLocal) {
      return res.status(400).json({ message: "User already exists" });
    }

    db.run(
      `
      INSERT INTO local_users
      (email, password, storeName, phone, country, logoUrl)
      VALUES (?,?,?,?,?,?)
      `,
      [email, hashed, storeName, phone, country, logoUrl]
    );

    return res.json({
      user: {
        email,
        storeName,
        role: "user"
      },
      role: "user"
    });

  } catch (err) {
    console.error("❌ Registration failed:", err);
    res.status(500).json({ message: "Registration failed" });
  }
};



/* =====================================================
   8️⃣ LOGIN
===================================================== */
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    /* =====================================================
       1️⃣ TRY POSTGRES (ONLINE USERS)
    ===================================================== */
    const pg = await query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (pg.rowCount) {
      const user = pg.rows[0];

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      return res.json({
        user,
        role: user.role,
        token: generateToken(user)
      });
    }

    /* =====================================================
       2️⃣ FALLBACK TO SQLITE (OFFLINE USERS)
    ===================================================== */
    const local = db.get(
      `SELECT * FROM local_users WHERE email = ?`,
      [email]
    );

    if (!local) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, local.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Normalize local user for frontend
    const user = {
      id: local.id,
      email: local.email,
      role: "user",
      storeName: local.storeName,
      storeId: local.storeId
    };

    return res.json({
      user,
      role: "user",
      token: generateToken(user)
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
};

/* =====================================================
   9️⃣ REQUEST PASSWORD RESET
===================================================== */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const pg = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    const local = db.get(`SELECT 1 FROM local_users WHERE email = ?`, [email]);

    if (!pg.rowCount && !local)
      return res.status(400).json({ message: "Email not found" });

    const code = String(Math.floor(100000 + Math.random() * 900000));

    await query(`DELETE FROM verification_codes WHERE email = $1`, [email]);

    await query(
      `
      INSERT INTO verification_codes (email, code, expires_at)
      VALUES ($1,$2, now() + interval '10 minutes')
      `,
      [email, code]
    );

    await sendEmail(email, "SmartStock Reset Code", `<h1>${code}</h1>`);

    res.json({ message: "Reset code sent" });
  } catch {
    res.status(500).json({ message: "Failed to send reset code" });
  }
};

/* =====================================================
   🔟 RESEND RESET CODE
===================================================== */
exports.resendResetCode = exports.requestPasswordReset;

/* =====================================================
   1️⃣1️⃣ VERIFY RESET CODE
===================================================== */
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const result = await query(
      `
      SELECT 1 FROM verification_codes
      WHERE email = $1 AND code = $2 AND expires_at > now()
      `,
      [email, code]
    );

    res.json({ verified: result.rowCount > 0 });
  } catch {
    res.status(500).json({ message: "Verification failed" });
  }
};

/* =====================================================
   1️⃣2️⃣ RESET PASSWORD (POSTGRES + SQLITE)
===================================================== */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    console.log("🔁 Resetting password with token:", req.body);

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and password required" });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 1️⃣ Try Postgres
    const pg = await query(
      `
      UPDATE users
      SET password = $1,
          reset_password_token = NULL,
          reset_password_expire = NULL
      WHERE reset_password_token = $2
        AND reset_password_expire > now()
      RETURNING id
      `,
      [hashedPassword, hashedToken]
    );

    if (pg.rowCount) {
      return res.json({ message: "Password updated" });
    }

    // 2️⃣ Fallback to SQLite
    const local = db.run(
      `
      UPDATE local_users
      SET password = ?,
          reset_password_token = NULL,
          reset_password_expire = NULL
      WHERE reset_password_token = ?
        AND reset_password_expire > datetime('now')
      `,
      [hashedPassword, hashedToken]
    );

    if (local.changes) {
      return res.json({ message: "Password updated" });
    }

    // 3️⃣ Nothing matched
    res.status(400).json({ message: "Invalid or expired token" });

  } catch (err) {
    console.error("❌ Password reset error:", err);
    res.status(500).json({ message: "Password reset failed" });
  }
};
