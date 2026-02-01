const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");
const { forecastSales } = require("../services/forecastService");

exports.getForecast = asyncHandler(async (req, res) => {
  const { admin_id, store_id } = req.user;

  const data = await pool.query(
    `
    SELECT DATE_TRUNC('month', created_at) month,
           SUM(total_amount) total
    FROM sales
    WHERE admin_id=$1 AND store_id=$2
    GROUP BY month
    ORDER BY month DESC
    LIMIT 6
    `,
    [admin_id, store_id]
  );

  const totals = data.rows.map(r => Number(r.total));
  res.json(forecastSales(totals));
});
