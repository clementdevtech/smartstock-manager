const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");
const { Parser } = require("json2csv");

/* =====================================================
   📊 BALANCE SHEET (ANY DATE RANGE)
===================================================== */
exports.balanceSheet = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { id: admin_id } = req.user;

  const sales = await pool.query(
    `
    SELECT
      COALESCE(SUM(total_amount),0) AS revenue,
      COALESCE(SUM(total_profit),0) AS profit
    FROM sales
    WHERE admin_id=$1
      AND sale_date BETWEEN $2 AND $3
    `,
    [admin_id, from, to]
  );

  const expenses = await pool.query(
    `
    SELECT
      COALESCE(SUM(amount),0) AS expenses
    FROM expenses
    WHERE admin_id=$1
      AND pay_date BETWEEN $2 AND $3
    `,
    [admin_id, from, to]
  );

  const revenue = Number(sales.rows[0].revenue);
  const profit = Number(sales.rows[0].profit);
  const totalExpenses = Number(expenses.rows[0].expenses);

  res.json({
    revenue,
    gross_profit: profit,
    total_expenses: totalExpenses,
    net_profit: profit - totalExpenses,
  });
});

/* =====================================================
   💰 CASH VS CREDIT ANALYSIS
===================================================== */
exports.cashVsCredit = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  const result = await pool.query(
    `
    SELECT
      payment_status,
      SUM(total_amount) total
    FROM sales
    WHERE admin_id=$1
    GROUP BY payment_status
    `,
    [admin_id]
  );

  const data = {
    paid: 0,
    credit: 0,
    pending: 0,
  };

  result.rows.forEach(r => {
    data[r.payment_status] = Number(r.total);
  });

  res.json(data);
});

/* =====================================================
   👨‍💼 EMPLOYEE SALARY & ADVANCE TRACKING
===================================================== */
exports.employeeExpenseReport = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  const result = await pool.query(
    `
    SELECT
      e.full_name,
      ex.expense_type,
      SUM(ex.amount) total_paid,
      MAX(ex.advance_balance) remaining_advance
    FROM expenses ex
    LEFT JOIN employees e ON e.id = ex.employee_id
    WHERE ex.admin_id=$1
    GROUP BY e.full_name, ex.expense_type
    `,
    [admin_id]
  );

  res.json(result.rows);
});

/* =====================================================
   🎯 TARGET VS ACTUAL (DAILY / WEEKLY / MONTHLY)
===================================================== */
exports.targetProgress = asyncHandler(async (req, res) => {
  const { period } = req.query;
  const { id: admin_id } = req.user;

  const targetRes = await pool.query(
    `
    SELECT target_amount
    FROM sales_targets
    WHERE admin_id=$1 AND period=$2
    ORDER BY generated_at DESC
    LIMIT 1
    `,
    [admin_id, period]
  );

  if (!targetRes.rows.length) {
    return res.json({ message: "No target set" });
  }

  const actualRes = await pool.query(
    `
    SELECT SUM(total_amount) total
    FROM sales
    WHERE admin_id=$1
      AND DATE(created_at) >= CURRENT_DATE - INTERVAL '1 ${period}'
    `,
    [admin_id]
  );

  const actual = Number(actualRes.rows[0].total || 0);
  const target = Number(targetRes.rows[0].target_amount);
  const percent = Math.min((actual / target) * 100, 100);

  res.json({
    actual,
    target,
    percent: Math.round(percent),
    status:
      percent >= 100 ? "achieved" :
      percent >= 80 ? "on-track" : "behind",
  });
});

/* =====================================================
   🔮 FORECAST NEXT 3 MONTHS (TREND BASED)
===================================================== */
exports.forecast = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  const history = await pool.query(
    `
    SELECT
      DATE_TRUNC('month', sale_date) month,
      SUM(total_amount) total
    FROM sales
    WHERE admin_id=$1
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
    `,
    [admin_id]
  );

  const avg =
    history.rows.reduce((a, b) => a + Number(b.total), 0) /
    Math.max(history.rows.length, 1);

  const forecast = [1, 2, 3].map(m => ({
    month_offset: m,
    expected_sales: Math.round(avg * (1 + m * 0.05)), // gentle growth
  }));

  res.json(forecast);
});

/* =====================================================
   🚨 PROFIT LEAK DETECTOR
===================================================== */
exports.profitLeaks = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  const leaks = [];

  const lowMargin = await pool.query(
    `
    SELECT name, retail_price, wholesale_price
    FROM items
    WHERE admin_id=$1
      AND retail_price < wholesale_price * 1.1
    `,
    [admin_id]
  );

  if (lowMargin.rows.length) {
    leaks.push({
      type: "LOW_MARGIN",
      items: lowMargin.rows,
    });
  }

  const highExpenses = await pool.query(
    `
    SELECT expense_type, SUM(amount) total
    FROM expenses
    WHERE admin_id=$1
    GROUP BY expense_type
    HAVING SUM(amount) > 0.4 * (
      SELECT SUM(total_profit) FROM sales WHERE admin_id=$1
    )
    `,
    [admin_id]
  );

  if (highExpenses.rows.length) {
    leaks.push({
      type: "HIGH_EXPENSE_RATIO",
      expenses: highExpenses.rows,
    });
  }

  res.json(leaks);
});

/* =====================================================
   📁 CSV EXPORT (GENERIC)
===================================================== */
exports.exportCSV = asyncHandler(async (req, res) => {
  const { table } = req.params;
  const { id: admin_id } = req.user;

  const allowed = ["sales", "expenses", "employees"];
  if (!allowed.includes(table)) {
    res.status(400);
    throw new Error("Invalid export table");
  }

  const result = await pool.query(
    `SELECT * FROM ${table} WHERE admin_id=$1`,
    [admin_id]
  );

  const parser = new Parser();
  const csv = parser.parse(result.rows);

  res.header("Content-Type", "text/csv");
  res.attachment(`${table}.csv`);
  res.send(csv);
});
