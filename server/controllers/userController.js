const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db"); 
/* =====================================================
   HELPERS
===================================================== */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

/* =====================================================
   @desc    Register a new user
   @route   POST /api/users/register
   @access  Public
===================================================== */
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please fill in all fields");
  }

  const existing = await query(
    `SELECT id FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (existing.rows.length) {
    res.status(400);
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const { rows } = await query(
    `
    INSERT INTO users (name, email, password)
    VALUES ($1, $2, $3)
    RETURNING id, name, email, role, created_at
    `,
    [name, email.toLowerCase(), hashedPassword]
  );

  const user = rows[0];
  const token = generateToken(user);

  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
  });
});

/* =====================================================
   @desc    Login user
   @route   POST /api/users/login
   @access  Public
===================================================== */
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password required");
  }

  const { rows } = await query(
    `
    SELECT id, name, email, password, role
    FROM users
    WHERE email = $1
    `,
    [email.toLowerCase()]
  );

  if (!rows.length) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  const user = rows[0];
  const passwordMatch = await bcrypt.compare(password, user.password);

  if (!passwordMatch) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  await query(
    `UPDATE users SET last_login = now() WHERE id = $1`,
    [user.id]
  );

  const token = generateToken(user);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    token,
  });
});

/* =====================================================
   @desc    Get user profile
   @route   GET /api/users/profile
   @access  Private
===================================================== */
const getUserProfile = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `
    SELECT id, name, email, role, created_at
    FROM users
    WHERE id = $1
    `,
    [req.user.id]
  );

  if (!rows.length) {
    res.status(404);
    throw new Error("User not found");
  }

  const user = rows[0];

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
  });
});

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
};
