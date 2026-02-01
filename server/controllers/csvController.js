const asyncHandler = require("express-async-handler");
const { pool } = require("../config/db");
const { Parser } = require("json2csv");

/* ================= EXPORT ================= */
exports.exportCSV = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { admin_id, store_id } = req.user;

  const map = {
    sales: "SELECT * FROM sales WHERE admin_id=$1 AND store_id=$2",
    expenses: "SELECT * FROM expenses WHERE admin_id=$1 AND store_id=$2",
    employees: "SELECT * FROM employees WHERE admin_id=$1 AND store_id=$2",
  };

  const result = await pool.query(map[type], [admin_id, store_id]);
  const parser = new Parser();
  const csv = parser.parse(result.rows);

  res.header("Content-Type", "text/csv");
  res.attachment(`${type}.csv`);
  res.send(csv);
});
