// controllers/keyController.js
// PostgreSQL-backed product key validation & assignment

const asyncHandler = require("express-async-handler");
const { query } = require("../config/db"); 

/* =====================================================
   @desc    Validate product key
   @route   POST /api/keys/validate
   @access  Public
===================================================== */
const validateKey = asyncHandler(async (req, res) => {
  const { key } = req.body;

  if (!key) {
    res.status(400);
    throw new Error("Key required");
  }

  const { rows } = await query(
    `
    SELECT used
    FROM product_keys
    WHERE key = $1
    `,
    [key]
  );

  if (!rows.length) {
    return res.json({ valid: false });
  }

  res.json({
    valid: !rows[0].used,
  });
});

/* =====================================================
   @desc    Assign product key to email
   @route   POST /api/keys/assign
   @access  Public (called after signup)
===================================================== */
const assignKey = asyncHandler(async (req, res) => {
  const { email, productKey } = req.body;

  if (!email || !productKey) {
    res.status(400);
    throw new Error("Email and product key are required");
  }

  /* ===============================
     VERIFY KEY
  ============================== */
  const { rows } = await query(
    `
    SELECT id, used
    FROM product_keys
    WHERE key = $1
    `,
    [productKey]
  );

  if (!rows.length) {
    res.status(400);
    throw new Error("Invalid product key");
  }

  if (rows[0].used) {
    res.status(400);
    throw new Error("Product key already used");
  }

  /* ===============================
     ATOMIC ASSIGNMENT
  ============================== */
  await query("BEGIN");

  try {
    // 1️⃣ Mark key as used
    await query(
      `
      UPDATE product_keys
      SET used = true,
          assigned_email = $1
      WHERE key = $2
      `,
      [email.toLowerCase(), productKey]
    );

    // 2️⃣ Register licensed user
    await query(
      `
      INSERT INTO licensed_users (
        email,
        product_key,
        activated,
        activated_at
      ) VALUES ($1, $2, true, now())
      `,
      [email.toLowerCase(), productKey]
    );

    await query("COMMIT");
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }

  res.json({ success: true });
});

module.exports = {
  validateKey,
  assignKey,
};
