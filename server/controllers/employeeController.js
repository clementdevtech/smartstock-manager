const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");

/* ================= CREATE ================= */
exports.createEmployee = asyncHandler(async (req, res) => {
  const { full_name, phone, email, position } = req.body;
  const { admin_id, store_id } = req.user;

  const emp = await pool.query(
    `
    INSERT INTO employees
    (full_name, phone, email, position, admin_id, store_id)
    VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING *
    `,
    [full_name, phone, email, position, admin_id, store_id]
  );

  res.status(201).json(emp.rows[0]);
});

/* ================= GET ================= */
exports.getEmployees = asyncHandler(async (req, res) => {
  const { admin_id, store_id } = req.user;

  const data = await pool.query(
    `
    SELECT *
    FROM employees
    WHERE admin_id=$1 AND store_id=$2
    ORDER BY created_at DESC
    `,
    [admin_id, store_id]
  );

  res.json(data.rows);
});
