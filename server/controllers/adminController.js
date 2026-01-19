const bcrypt = require("bcryptjs");
const db = require("../db/sqlite");

// CREATE USER (SQLITE)
exports.createUser = async (req, res) => {
  const { email, password, storeName, phone, country } = req.body;

  const exists = await db.get(
    "SELECT * FROM local_users WHERE email = ?",
    [email]
  );

  if (exists) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashed = await bcrypt.hash(password, 12);

  await db.run(
    `INSERT INTO local_users (email, password, storeName, phone, country)
     VALUES (?, ?, ?, ?, ?)`,
    [email, hashed, storeName, phone, country]
  );

  res.json({ success: true });
};

// GET USERS
exports.getUsers = async (req, res) => {
  const users = await db.all(
    "SELECT email, storeName, phone, country FROM local_users"
  );
  res.json(users);
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  const { email, password } = req.body;

  const hashed = await bcrypt.hash(password, 12);

  await db.run(
    "UPDATE local_users SET password = ? WHERE email = ?",
    [hashed, email]
  );

  res.json({ success: true });
};
