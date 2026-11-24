const asyncHandler = require("express-async-handler");
const db = require("../sqlite");
const { forecastSales } = require("../services/forecastService");

exports.getForecast = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId || "default-store";
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  currentMonth.setUTCMonth(currentMonth.getUTCMonth() - 5);
  const from = currentMonth.toISOString().slice(0, 10);

  const rows = db.all(
    `SELECT currency, strftime('%Y-%m', createdAt) AS month,
        COALESCE(SUM(subtotal - discountAmount), 0) AS revenue
     FROM offline_sales
     WHERE adminId = ? AND storeId = ? AND COALESCE(deleted, 0) = 0
       AND DATE(createdAt) >= DATE(?)
     GROUP BY currency, strftime('%Y-%m', createdAt)
     ORDER BY month ASC`,
    [adminId, storeId, from]
  );

  const monthKeys = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  for (let offset = 0; offset < 6; offset += 1) {
    const month = new Date(start);
    month.setUTCMonth(month.getUTCMonth() + offset);
    monthKeys.push(month.toISOString().slice(0, 7));
  }

  const currencies = new Set(rows.map((row) => row.currency || "KES"));
  if (!currencies.size) currencies.add("KES");
  const forecasts = [...currencies].map((currency) => {
    const byMonth = new Map(
      rows.filter((row) => (row.currency || "KES") === currency)
        .map((row) => [row.month, Number(row.revenue)])
    );
    const history = monthKeys.map((month) => ({ month, revenue: byMonth.get(month) || 0 }));
    return { currency, ...forecastSales(history) };
  });

  res.json({ windowMonths: 6, forecastMonths: 3, forecasts });
});