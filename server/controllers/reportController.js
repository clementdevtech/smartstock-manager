const asyncHandler = require("express-async-handler");
const { query } = require("../config/db");
const sqlite = require("../sqlite");
const { Parser } = require("json2csv");

/* =====================================================
   📊 BALANCE SHEET (ANY DATE RANGE)
===================================================== */
exports.balanceSheet = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const { id: admin_id } = req.user;

  let sales, expenses;

  try {
    sales = await query(
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

    expenses = await query(
      `
      SELECT
        COALESCE(SUM(amount),0) AS expenses
      FROM expenses
      WHERE admin_id=$1
        AND pay_date BETWEEN $2 AND $3
      `,
      [admin_id, from, to]
    );
  } catch (err) {
    return res.status(503).json({
      message: "Balance sheet unavailable (offline mode)",
    });
  }

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

  let result;

  try {
    result = await query(
      `
      SELECT
        payment_status,
        SUM(total_amount) AS total
      FROM sales
      WHERE admin_id=$1
      GROUP BY payment_status
      `,
      [admin_id]
    );
  } catch (err) {
    return res.status(503).json({
      paid: 0,
      credit: 0,
      pending: 0,
      offline: true,
    });
  }

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

  let result;
  try {
    result = await query(
      `
      SELECT
        e.full_name,
        ex.expense_type,
        SUM(ex.amount) AS total_paid,
        MAX(ex.advance_balance) AS remaining_advance
      FROM expenses ex
      LEFT JOIN employees e ON e.id = ex.employee_id
      WHERE ex.admin_id=$1
      GROUP BY e.full_name, ex.expense_type
      `,
      [admin_id]
    );
  } catch (err) {
    return res.status(503).json([]);
  }

  res.json(result.rows);
});

/* =====================================================
   🎯 TARGET VS ACTUAL (DAILY / WEEKLY / MONTHLY)
===================================================== */
exports.targetProgress = asyncHandler(async (req, res) => {
  const { period } = req.query;
  const { id: admin_id } = req.user;

  let interval;
  if (period === "daily") interval = "1 day";
  else if (period === "weekly") interval = "7 days";
  else if (period === "monthly") interval = "1 month";
  else {
    return res.status(400).json({ message: "Invalid period" });
  }

  try {
    // 🎯 Get target
    const targetRes = await query(
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
      return res.json({
        actual: 0,
        target: 0,
        percent: 0,
        status: "no-target",
      });
    }

    // 📊 Get actual sales
    const actualRes = await query(
      `
      SELECT COALESCE(SUM(total_amount),0) total
      FROM sales
      WHERE admin_id=$1
        AND created_at >= CURRENT_DATE - INTERVAL $2
      `,
      [admin_id, interval]
    );

    const actual = Number(actualRes.rows[0].total);
    const target = Number(targetRes.rows[0].target_amount);
    const percent = Math.min((actual / target) * 100, 100);

    return res.json({
      actual,
      target,
      percent: Math.round(percent),
      status:
        percent >= 100
          ? "achieved"
          : percent >= 80
          ? "on-track"
          : "behind",
    });
  } catch (err) {
    console.error("Target progress error:", err.message);

    return res.status(503).json({
      unavailable: true,
      message: "Reports temporarily unavailable",
    });
  }
});

/* =====================================================
   🔮 FORECAST NEXT 3 MONTHS (TREND BASED)
===================================================== */
exports.forecast = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  let history;
  try {
    history = await query(
      `
      SELECT
        DATE_TRUNC('month', sale_date) AS month,
        SUM(total_amount) AS total
      FROM sales
      WHERE admin_id=$1
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
      `,
      [admin_id]
    );
  } catch (err) {
    return res.status(503).json([]);
  }

  const avg =
    history.rows.reduce((a, b) => a + Number(b.total), 0) /
    Math.max(history.rows.length, 1);

  const forecast = [1, 2, 3].map(m => ({
    month_offset: m,
    expected_sales: Math.round(avg * (1 + m * 0.05)),
  }));

  res.json(forecast);
});

/* =====================================================
   🚨 PROFIT LEAK DETECTOR
===================================================== */
exports.profitLeaks = asyncHandler(async (req, res) => {
  const { id: admin_id } = req.user;

  const leaks = [];

  try {
    const lowMargin = await query(
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

    const highExpenses = await query(
      `
      SELECT expense_type, SUM(amount) AS total
      FROM expenses
      WHERE admin_id=$1
      GROUP BY expense_type
      HAVING SUM(amount) > 0.4 * (
        SELECT COALESCE(SUM(total_profit),0)
        FROM sales
        WHERE admin_id=$1
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
  } catch (err) {
    return res.status(503).json([]);
  }

  res.json(leaks);
});

/* =====================================================
   📁 CSV EXPORT (GENERIC)
===================================================== */
exports.exportCSV = asyncHandler(async (req, res) => {
  const { table } = req.params;
  const { id: admin_id } = req.user;

  const allowedTables = {
    sales: "sales",
    expenses: "expenses",
    employees: "employees",
  };

  if (!allowedTables[table]) {
    res.status(400);
    throw new Error("Invalid export table");
  }

  let result;
  try {
    result = await query(
      `SELECT * FROM ${allowedTables[table]} WHERE admin_id=$1`,
      [admin_id]
    );
  } catch (err) {
    return res.status(503).json({ message: "Export unavailable offline" });
  }

  const parser = new Parser();
  const csv = parser.parse(result.rows);

  res.header("Content-Type", "text/csv");
  res.attachment(`${table}.csv`);
  res.send(csv);
});


/* =====================================================
   🤖 AUTO-GENERATE SALES TARGETS
===================================================== */
exports.generateAutoTarget = asyncHandler(async (req, res) => {
  const { period } = req.body; // 'daily', 'weekly', 'monthly'
  const { id: admin_id } = req.user;

  if (!["daily", "weekly", "monthly"].includes(period)) {
    res.status(400);
    throw new Error("Invalid period. Must be 'daily', 'weekly', or 'monthly'");
  }

  // Determine interval
  let interval;
  if (period === "daily") interval = "1 day";
  else if (period === "weekly") interval = "7 days";
  else if (period === "monthly") interval = "1 month";

  // Decide whether to use local SQLite or Postgres
  const isOffline = !process.env.POSTGRES_ONLINE; // set this in your env when offline

  let totalSales = 0;

  try {
    if (isOffline) {
      // Local SQLite
      const row = await sqlite.get(
        `SELECT COALESCE(SUM(total),0) AS total
         FROM offline_sales
         WHERE adminId=? AND createdAt >= datetime('now', '-${interval}')`,
        [admin_id]
      );
      totalSales = Number(row.total || 0);

      // Ensure local_sales_targets table exists
      await sqlite.run(`
        CREATE TABLE IF NOT EXISTS local_sales_targets (
          id INTEGER PRIMARY KEY,
          adminId TEXT NOT NULL,
          period TEXT NOT NULL,
          targetAmount REAL NOT NULL,
          generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
          syncStatus TEXT DEFAULT 'pending'
        );
      `);

      // Save target locally
      const insert = await sqlite.run(
        `INSERT INTO local_sales_targets (adminId, period, targetAmount)
         VALUES (?, ?, ?)`,
        [admin_id, period, Math.round(totalSales * 1.1)]
      );

      return res.json({
        success: true,
        message: `Auto target generated locally for ${period}`,
        target: {
          id: insert.lastInsertRowid,
          adminId: admin_id,
          period,
          targetAmount: Math.round(totalSales * 1.1),
        },
      });
    } else {
      // Online Postgres
      const salesRes = await query(
        `
        SELECT COALESCE(SUM(total_amount),0) AS total
        FROM sales
        WHERE admin_id=$1
          AND created_at >= CURRENT_DATE - INTERVAL '${interval}'
        `,
        [admin_id]
      );
      totalSales = Number(salesRes.rows[0].total);

      const targetAmount = Math.round(totalSales * 1.1);

      const insertRes = await query(
        `
        INSERT INTO sales_targets (admin_id, period, target_amount)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [admin_id, period, targetAmount]
      );

      return res.json({
        success: true,
        message: `Auto target generated for ${period}`,
        target: insertRes.rows[0],
      });
    }
  } catch (err) {
    console.error("Error generating auto target:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to generate auto target",
      error: err.message,
    });
  }
});
