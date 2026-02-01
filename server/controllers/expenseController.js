const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");

/* ================= CREATE ================= */
exports.createExpense = asyncHandler(async (req, res) => {
  const {
    expense_type,
    employee_id,
    expense_name,
    amount,
    pay_date,
    salary_month,
    notes,
  } = req.body;

  const { admin_id, store_id } = req.user;

  const expense = await pool.query(
    `
    INSERT INTO expenses
    (
      expense_type, employee_id, expense_name,
      amount, pay_date, salary_month,
      admin_id, store_id, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
    `,
    [
      expense_type,
      employee_id || null,
      expense_name,
      amount,
      pay_date,
      salary_month || null,
      admin_id,
      store_id,
      notes,
    ]
  );

  res.status(201).json(expense.rows[0]);
});

/* ================= GET ================= */
exports.getExpenses = asyncHandler(async (req, res) => {
  const { admin_id, store_id } = req.user;

  const data = await pool.query(
    `
    SELECT e.*, emp.full_name
    FROM expenses e
    LEFT JOIN employees emp ON emp.id = e.employee_id
    WHERE e.admin_id=$1 AND e.store_id=$2
    ORDER BY pay_date DESC
    `,
    [admin_id, store_id]
  );

  res.json(data.rows);
});
