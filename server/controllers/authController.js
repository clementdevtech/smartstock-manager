const User = require("../models/User");
const ProductKey = require("../models/ProductKey");
const InviteCode = require("../models/InviteCode");
const VerificationCode = require("../models/VerificationCode");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../sqlite");
const sendEmail = require("../utils/email");

// ------------------------------
// HELPER: Generate JWT for Admin
// ------------------------------
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


const normalizeKey = (key = "") =>
  key.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

// ===============================================================
// 1️⃣ CHECK IF EMAIL EXISTS (MongoDB + SQLite)
// ===============================================================
exports.checkEmailExists = async (req, res) => {
  try {
    const { email } = req.query;

    const mongoUser = await User.findOne({ email });
    const localUser = await db.get("SELECT * FROM local_users WHERE email = ?", [email]);

    return res.json({ exists: !!mongoUser || !!localUser });
  } catch (err) {
    res.status(500).json({ message: "Failed to check email" });
  }
};

// ===============================================================
// 2️⃣ SEND VERIFICATION EMAIL
// ===============================================================
exports.sendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Remove old code
    await VerificationCode.deleteMany({ email });

    // Save new code with expiry in MongoDB
    await VerificationCode.create({
      email,
      code,
      createdAt: new Date(),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    });

    // Build email HTML
    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: #4ade80;">SmartStock Email Verification</h2>
        <p>Use the verification code below to continue:</p>
        <h1 style="letter-spacing: 5px; color: #16a34a;">${code}</h1>
        <p>This code will expire in <strong>10 minutes</strong>.</p>
        <p style="font-size: 12px; color: #666;">If you did not request this, you may safely ignore this email.</p>
      </div>
    `;

    await sendEmail(email, "SmartStock Verification Code", html);

    res.json({ message: "Verification code sent successfully" });
  } catch (err) {
    console.error("❌ Email error:", err);
    res.status(500).json({ message: "Failed to send verification email" });
  }
};

// ===============================================================
// 3️⃣ VERIFY EMAIL CODE
// ===============================================================
exports.verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    console.log(req.body);

    const record = await VerificationCode.findOne({ email, code });
    if (!record) {
      console.log("No record found");
      return res.status(400).json({
        error: "CODE_NOT_FOUND",
        message: "Verification code does not exist for this email",
      });
    }

    if (!record.expiresAt) {
      cosole.log("No expiry data");
      return res.status(400).json({
          error: "CODE_NO_EXPIRY",
          message: "Verification code is missing expiration data",
        });
      }


    if (record.expiresAt.getTime() < Date.now()) {
      cosole.log("Code expired");
        return res.status(400).json({
          error: "CODE_EXPIRED",
          message: "Verification code has expired",
          expiredAt: record.expiresAt,
        });
      }



    // 🔐 Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 🔐 Hash it before saving
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    await User.updateOne(
      { email },
      {
        resetPasswordToken: hashedToken,
        resetPasswordExpire: Date.now() + 15 * 60 * 1000, // 15 minutes
      }
    );

    await VerificationCode.deleteMany({ email });

    res.json({
      verified: true,
      token: resetToken, // ✅ SEND RAW TOKEN TO CLIENT
    });
  } catch (err) {
    console.error("❌ Verification error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
};



// ===============================================================
// 4️⃣ VALIDATE PRODUCT KEY
// ===============================================================
exports.validateProductKey = async (req, res) => {
  try {
    const rawKey = req.query.productKey;
    const productKey = normalizeKey(rawKey);

    const key = await ProductKey.findOne({
      key: productKey,
      used: false,
    });

    res.json({ valid: !!key });
  } catch (err) {
    res.status(500).json({ message: "Key check failed" });
  }
};


// ===============================================================
// 5️⃣ ASSIGN PRODUCT KEY TO EMAIL (MONGODB)
// ===============================================================
exports.assignProductKeyToEmail = async (req, res) => {
  try {
    const { email, productKey } = req.body;

    const normalizedKey = normalizeKey(productKey);

    const result = await ProductKey.updateOne(
      { key: normalizedKey, used: false },
      { used: true, assignedEmail: email }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ message: "Key already used or invalid" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign key" });
  }
};


// ===============================================================
// 6️⃣ VALIDATE INVITE CODE (Admin-created)
// ===============================================================
exports.validateInviteCode = async (req, res) => {
  try {
    const { code } = req.query;

    const invite = await InviteCode.findOne({
      code,
      used: false,
    });

    res.json({ valid: !!invite });
  } catch (err) {
    res.status(500).json({ message: "Invite check failed" });
  }
};

// ===============================================================
// 7️⃣ REGISTER USER
// - Admin → MongoDB
// - Normal User → SQLite
// ===============================================================
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      storeName,
      phone,
      country,
      productKey,
      inviteCode,
      logoUrl,
    } = req.body;

    // ------------------------------------
    // NORMALIZE PRODUCT KEY (if provided)
    // ------------------------------------
    const normalizeKey = (key = "") =>
      key.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    const normalizedProductKey = productKey
      ? normalizeKey(productKey)
      : null;

    // ------------------------------------
    // CHECK EMAIL EXISTS ANYWHERE
    // ------------------------------------
    const mongoExists = await User.findOne({ email });
    const localExists = await db.get(
      "SELECT * FROM local_users WHERE email = ?",
      [email]
    );

    if (mongoExists || localExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // ------------------------------------
    // VALIDATE PRODUCT KEY OWNERSHIP
    // ------------------------------------
    if (normalizedProductKey) {
      const keyRecord = await ProductKey.findOne({
        key: normalizedProductKey,
        used: true,
        assignedEmail: email,
      });

      if (!keyRecord) {
        return res
          .status(400)
          .json({ message: "Invalid or unassigned product key" });
      }
    }

    // ------------------------------------
    // HASH PASSWORD
    // ------------------------------------
    const salt = await bcrypt.genSalt(12);
    const hashed = await bcrypt.hash(password, salt);

    // ------------------------------------
    // CHECK IF FIRST USER (ADMIN)
    // ------------------------------------
    const adminExists = await User.findOne();

    // =====================================================
    // CASE A: FIRST USER → ADMIN → MONGODB
    // =====================================================
    if (!adminExists) {
      const adminUser = await User.create({
        name: storeName,
        email,
        password: hashed,
        role: "admin",
      });

      // Mark invite code used (MongoDB)
      if (inviteCode) {
        await InviteCode.updateOne(
          { code: inviteCode, used: false },
          { used: true }
        );
      }

      return res.json({
        user: adminUser,
        role: "admin",
        token: generateToken(adminUser),
        productKey: normalizedProductKey,
      });
    }

    // =====================================================
    // CASE B: NORMAL USER → SQLITE
    // =====================================================
    await db.run(
      `INSERT INTO local_users (email, password, storeName, phone, country, logoUrl)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hashed, storeName, phone, country, logoUrl]
    );

    // Mark invite code used (MongoDB)
    if (inviteCode) {
      await InviteCode.updateOne(
        { code: inviteCode, used: false },
        { used: true }
      );
    }

    return res.json({
      user: {
        email,
        storeName,
        role: "user",
      },
      role: "user",
      productKey: normalizedProductKey,
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
};


// ===============================================================
// 8️⃣ LOGIN (Check MongoDB first, then SQLite)
// ===============================================================
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("🔍 Login attempt:", email);

    // 1. Check MongoDB
    const mongoUser = await User.findOne({ email }).select("+password");

    if (mongoUser) {
      console.log("➡ Found Mongo user:", email);

      const ok = await bcrypt.compare(password, mongoUser.password);
      console.log("Password match:", ok);

      if (!ok) return res.status(400).json({ message: "Invalid credentials" });

      return res.json({
        user: mongoUser,
        role: mongoUser.role,
        token: generateToken(mongoUser),
      });
    }

    // 2. SQLite
    const localUser = await db.get("SELECT * FROM local_users WHERE email = ?", [email]);

    if (!localUser) {
      console.log("❌ No SQLite user found");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log("➡ Found SQLite user:", email);
    console.log("Stored hash:", localUser.password);

    const ok = await bcrypt.compare(password, localUser.password);
    console.log("SQLite password match:", ok);

    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    return res.json({
      user: {
        email: localUser.email,
        storeName: localUser.storeName,
        role: "user",
      },
      role: "user",
      token: null,
    });
  } catch (err) {
    console.error("💥 Login error:", err);
    res.status(500).json({ message: "Login error" });
  }
};


// ===============================================================
// 9️⃣ REQUEST PASSWORD RESET (Send reset code)
// ===============================================================
exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    // Check MongoDB and SQLite
    const mongoUser = await User.findOne({ email });
    const localUser = await db.get("SELECT * FROM local_users WHERE email = ?", [email]);

    if (!mongoUser && !localUser)
      return res.status(400).json({ message: "Email not found" });

    // Generate a 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Remove old codes
    await VerificationCode.deleteMany({ email });

    // Save new code
    await VerificationCode.create({
  email,
  code,
  createdAt: new Date(),
  expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes from now
});


    // Email content
    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: #0284c7;">SmartStock Password Reset</h2>
        <p>Use the code below to reset your password:</p>
        <h1 style="letter-spacing: 5px; color: #0369a1;">${code}</h1>
        <p>This code expires in <strong>10 minutes</strong>.</p>
      </div>
    `;

    await sendEmail(email, "SmartStock Password Reset Code", html);

    res.json({ message: "Reset code sent" });
  } catch (err) {
    console.error("❌ Reset email error:", err);
    res.status(500).json({ message: "Failed to send reset email" });
  }
};

// ===============================================================
// 🔟 RESEND RESET CODE
// ===============================================================
exports.resendResetCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const mongoUser = await User.findOne({ email });
    const localUser = await db.get("SELECT * FROM local_users WHERE email = ?", [email]);

    if (!mongoUser && !localUser)
      return res.status(400).json({ message: "Email not found" });

    // Generate a new 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Remove old codes
    await VerificationCode.deleteMany({ email });

    await VerificationCode.create({
        email,
        code,
        createdAt: new Date(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });


    const html = `
      <div style="font-family: Arial; padding: 20px;">
        <h2 style="color: #0284c7;">SmartStock Password Reset</h2>
        <p>Your new code:</p>
        <h1 style="letter-spacing: 5px; color: #0369a1;">${code}</h1>
        <p>Expires in <strong>10 minutes</strong>.</p>
      </div>
    `;
    await sendEmail(email, "SmartStock Password Reset Code (Resent)", html);

    res.json({ message: "Reset code resent" });
  } catch (err) {
    console.error("❌ Resend code error:", err);
    res.status(500).json({ message: "Failed to resend reset code" });
  }
};

// ===============================================================
// 1️⃣1️⃣ VERIFY RESET CODE
// ===============================================================
exports.verifyResetCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const codeRow = await VerificationCode.findOne({ email, code });
    if (!codeRow) return res.status(400).json({ verified: false });

    // Check expiration
    if (codeRow.expiresAt < Date.now()) {
      await VerificationCode.deleteMany({ email });
      return res.status(400).json({ verified: false, message: "Code expired" });
    }

    res.json({ verified: true });
  } catch (err) {
    console.error("❌ Verify code error:", err);
    res.status(500).json({ message: "Failed to verify code" });
  }
};


// ===============================================================
// 1️⃣2️⃣ RESET PASSWORD
// ===============================================================
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword, token } = req.body;

    if (!newPassword || !token) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // ✅ DO NOT HASH HERE
    user.password = newPassword;

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save(); // pre("save") hashes once

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ message: "Password reset failed" });
  }
};
 