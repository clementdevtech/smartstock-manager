const cron = require("node-cron");
const sendEmail = require("../utils/sendEmail");
const { pool } = require("../config/db");
const { detectLeaks } = require("../services/profitLeakService");

cron.schedule("0 8 1 * *", async () => {
  const admins = await pool.query("SELECT id,email FROM users");

  for (const admin of admins.rows) {
    const sales = await pool.query(
      `
      SELECT SUM(total_profit) profit
      FROM sales
      WHERE admin_id=$1
      `,
      [admin.id]
    );

    const expenses = await pool.query(
      `
      SELECT expense_type, SUM(amount) total
      FROM expenses
      WHERE admin_id=$1
      GROUP BY expense_type
      `,
      [admin.id]
    );

    const leaks = detectLeaks({
      profit: Number(sales.rows[0].profit || 0),
      expenses: expenses.rows,
    });

    await sendEmail(
      admin.email,
      "📊 SmartStock Monthly Financial Report",
      `
      <h2>Monthly Summary</h2>
      <p>Profit: ${sales.rows[0].profit}</p>
      <ul>${leaks.map(l => `<li>${l}</li>`).join("")}</ul>
      `
    );
  }
});
