const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");
const db = require("../sqlite");

/* =====================================================
   CREATE LOCAL USER (OFFLINE FIRST)
===================================================== */
const createUser = asyncHandler(async (req, res) => {
  const { email, password, storeName, phone, country } = req.body;

  if (!email || !password || !storeName) {
    res.status(400);
    throw new Error("Email, password and store name are required");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const exists = db.get(
    `SELECT id FROM local_users WHERE email = ?`,
    [normalizedEmail]
  );

  if (exists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  db.run(
    `
    INSERT INTO local_users (
      email,
      password,
      storeName,
      phone,
      country,
      syncStatus,
      createdAt
    ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `,
    [normalizedEmail, hashedPassword, storeName, phone || null, country || null]
  );

  res.status(201).json({ success: true });
});

/* =====================================================
   GET LOCAL USERS
===================================================== */
const getUsers = asyncHandler(async (req, res) => {
  const users = db.all(
    `
    SELECT
      id,
      email,
      storeName,
      phone,
      country,
      syncStatus,
      createdAt
    FROM local_users
    ORDER BY createdAt DESC
    `
  );

  res.json(users);
});

/* =====================================================
   RESET PASSWORD (OFFLINE SAFE)
===================================================== */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and new password are required");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = db.get(
    `SELECT id FROM local_users WHERE email = ?`,
    [normalizedEmail]
  );

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  db.run(
    `
    UPDATE local_users
    SET password = ?,
        syncStatus = 'pending',
        updatedAt = CURRENT_TIMESTAMP
    WHERE email = ?
    `,
    [hashedPassword, normalizedEmail]
  );

  res.json({ success: true });
});

module.exports = {
  createUser,
  getUsers,
  resetPassword,
};
