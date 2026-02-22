const db = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   🔁 SYNC OFFLINE SALES → SUPABASE
===================================================== */
async function syncOfflineSales() {
  /* 1️⃣ Check Postgres availability */
  try {
    await query("SELECT 1");
  } catch {
    console.log("⚠️ Supabase offline — skipping sales sync");
    return;
  }

  /* 2️⃣ Fetch pending offline sales */
  let pendingSales;

  try {
    pendingSales = await db.all(`
      SELECT *
      FROM offline_sales
      WHERE syncStatus = 'pending'
      ORDER BY createdAt ASC
    `);
  } catch (err) {
    console.error("❌ Failed reading offline_sales:", err.message);
    return;
  }

  if (!pendingSales.length) return;

  console.log(`🔄 Syncing ${pendingSales.length} sale(s) → Supabase`);

  /* 3️⃣ Sync each sale */
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
          JSON.parse(sale.items),
          sale.total,
          0,
          sale.paymentStatus || "paid",
          "Walk-in Customer",
          sale.createdAt,
          sale.adminId,
          sale.storeId,
          sale.cashierId || sale.adminId
        ]
      );

      const postgresId = result.rows[0].id;

      /* 4️⃣ Mark as synced locally */
      await db.run(
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