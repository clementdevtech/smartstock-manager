const asyncHandler = require("express-async-handler");
const { query } = require("../db"); // pg pool wrapper

/* =====================================================
   GET BALANCE SHEET (ANY TIME FRAME)
   /api/reports/balance-sheet?from=YYYY-MM-DD&to=YYYY-MM-DD
===================================================== */
const getBalanceSheet = asyncHandler(async (req, res) => {
  const adminId = req.user.id;
  const storeId = req.user.storeId;

  const from = req.query.from || "1970-01-01";
  const to = req.query.to || new Date().toISOString();

  /* ================= SALES ================= */
  const salesResult = await query(
    `
    SELECT
      COUNT(*)::int AS transactions,
      COALESCE(SUM(total_amount), 0) AS total_sales,
      COALESCE(SUM(total_profit), 0) AS total_profit
    FROM sales
    WHERE admin_id = $1
      AND store_id = $2
      AND sale_date BETWEEN $3 AND $4
    `,
    [adminId, storeId, from, to]
  );

  /* ================= EXPENSES ================= */
  const expensesResult = await query(
    `
    SELECT
      expense_type,
      COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE admin_id = $1
      AND store_id = $2
      AND pay_date BETWEEN $3 AND $4
    GROUP BY expense_type
    `,
    [adminId, storeId, from, to]
  );

  const expenses = {
    salary: 0,
    advance: 0,
    rent: 0,
    electricity: 0,
    water: 0,
    other: 0,
  };

  let totalExpenses = 0;

  for (const row of expensesResult.rows) {
    expenses[row.expense_type] = Number(row.total);
    totalExpenses += Number(row.total);
  }

  const sales = salesResult.rows[0];
  const netProfit = Number(sales.total_profit) - totalExpenses;

  res.json({
    period: { from, to },
    sales: {
      totalSales: Number(sales.total_sales),
      totalProfit: Number(sales.total_profit),
      transactions: sales.transactions,
    },
    expenses: {
      ...expenses,
      totalExpenses,
    },
    netProfit,
  });
});

module.exports = {
  getBalanceSheet,
};
