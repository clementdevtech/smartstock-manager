const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");
const { generateTarget } = require("../services/targetService");
const { calculateTrend } = require("../services/salesTrendService");

/* ================= AUTO TARGET ================= */
exports.generateAutoTarget = asyncHandler(async (req, res) => {
  const { period } = req.body;
  const { admin_id, store_id } = req.user;

  const dateGroup =
    period === "daily" ? "day" :
    period === "weekly" ? "week" :
    "month";

  const sales = await pool.query(
    `
    SELECT DATE_TRUNC($1, created_at) as bucket,
           SUM(total_amount) total
    FROM sales
    WHERE admin_id=$2 AND store_id=$3
    GROUP BY bucket
    ORDER BY bucket DESC
    LIMIT 8
    `,
    [dateGroup, admin_id, store_id]
  );

  const totals = sales.rows.map(r => Number(r.total));
  const avg =
    totals.reduce((a, b) => a + b, 0) / totals.length;

  const trend = calculateTrend(totals);

  const { target, growthFactor } = generateTarget({
    averageSales: avg,
    trendRate: trend,
    period,
  });

  const validFrom = new Date();
  const validTo = new Date();
  validTo.setDate(
    validTo.getDate() +
      (period === "daily" ? 1 : period === "weekly" ? 7 : 30)
  );

  const saved = await pool.query(
    `
    INSERT INTO sales_targets
    (period, target_amount, baseline_avg, growth_factor,
     admin_id, store_id, valid_from, valid_to)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `,
    [
      period,
      target,
      avg,
      growthFactor,
      admin_id,
      store_id,
      validFrom,
      validTo,
    ]
  );

  res.json(saved.rows[0]);
});

/* ================= GET ACTIVE TARGET ================= */
exports.getActiveTarget = asyncHandler(async (req, res) => {
  const { period } = req.params;
  const { admin_id, store_id } = req.user;

  const target = await pool.query(
    `
    SELECT *
    FROM sales_targets
    WHERE admin_id=$1 AND store_id=$2
      AND period=$3
      AND CURRENT_DATE BETWEEN valid_from AND valid_to
    ORDER BY generated_at DESC
    LIMIT 1
    `,
    [admin_id, store_id, period]
  );

  res.json(target.rows[0] || null);
});
