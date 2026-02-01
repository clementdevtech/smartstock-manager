const asyncHandler = require("express-async-handler");
const { query } = require("../config/db"); 

/* =====================================================
   @desc    Get business settings
   @route   GET /api/business-settings
   @access  Private
===================================================== */
const getBusinessSettings = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `
    SELECT *
    FROM business_settings
    ORDER BY created_at ASC
    LIMIT 1
    `
  );

  // If no settings exist, create default row
  if (!rows.length) {
    const { rows: created } = await query(
      `
      INSERT INTO business_settings (name, address, phone, email)
      VALUES ('', '', '', '')
      RETURNING *
      `
    );
    return res.json(created[0]);
  }

  res.json(rows[0]);
});

/* =====================================================
   @desc    Update business settings
   @route   PUT /api/business-settings
   @access  Private
===================================================== */
const updateBusinessSettings = asyncHandler(async (req, res) => {
  const { name, address, phone, email } = req.body;

  // Ensure row exists
  const { rows } = await query(
    `
    SELECT id
    FROM business_settings
    ORDER BY created_at ASC
    LIMIT 1
    `
  );

  let settings;

  if (!rows.length) {
    // Create if missing
    const { rows: created } = await query(
      `
      INSERT INTO business_settings (name, address, phone, email)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [name || "", address || "", phone || "", email || ""]
    );
    settings = created[0];
  } else {
    // Update existing
    const { rows: updated } = await query(
      `
      UPDATE business_settings
      SET
        name = $1,
        address = $2,
        phone = $3,
        email = $4
      WHERE id = $5
      RETURNING *
      `,
      [name, address, phone, email, rows[0].id]
    );
    settings = updated[0];
  }

  res.json(settings);
});

module.exports = {
  getBusinessSettings,
  updateBusinessSettings,
};
