const db = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   🔁 SYNC OFFLINE SALES → SUPABASE (FINAL)
===================================================== */
async function syncOfflineSales() {
  // 1️⃣ Check Postgres availability
  try {
    await query("SELECT 1");
  } catch {
    console.log("⚠️ Supabase offline — skipping sales sync");
    return;
  }

  // 2️⃣ Fetch pending offline sales
  const pendingSales = db.all(`
    SELECT *
    FROM offline_sales
    WHERE syncStatus = 'pending'
    ORDER BY createdAt ASC
  `);

  if (pendingSales.length === 0) {
    return;
  }

  console.log(`🔄 Syncing ${pendingSales.length} sale(s) → Supabase`);

  for (const sale of pendingSales) {
    try {
      const result = await query(
        `
        INSERT INTO sales (
          items,
          total_amount,
          total_profit,
          payment_status,
          customer_name,
          sale_date,
          admin_id,
          store_id,
          created_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9
        )
        RETURNING id
        `,
        [
          JSON.parse(sale.items),          // jsonb
          sale.total,                      // total_amount
          0,                               // total_profit (calc later if needed)
          sale.paymentStatus || "paid",    // payment_status
          "Walk-in Customer",              // customer_name
          sale.createdAt,                  // sale_date
          sale.adminId,                    // admin_id
          sale.storeId,                    // store_id
          sale.cashierId || sale.adminId   // created_by
        ]
      );

      const postgresId = result.rows[0].id;

      // 3️⃣ Mark as synced locally
      db.run(
        `
        UPDATE offline_sales
        SET
          syncStatus = 'synced',
          syncedAt = CURRENT_TIMESTAMP,
          postgresId = ?
        WHERE id = ?
        `,
        [postgresId, sale.id]
      );

      console.log(`✅ Sale synced → ${postgresId}`);
    } catch (err) {
      console.error(
        `❌ Failed to sync sale ${sale.receiptNo || sale.id}:`,
        err.message
      );
      // leave as pending → retry later
    }
  }
}

module.exports = syncOfflineSales;
