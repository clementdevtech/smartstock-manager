const db = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   🔧 CONFIG
===================================================== */
const MAX_RETRIES = 5;

/* =====================================================
   🧠 SAFE JSON PARSER
===================================================== */
function safeParseJSON(value) {
  try {
    if (!value) return [];
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return [];
  }
}

async function ensureColumn(table, column, type) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  const exists = cols.some(c => c.name === column);

  if (!exists) {
    console.warn(`🛠 Adding missing column: ${table}.${column}`);
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function healOfflineSalesSchema() {
  await ensureColumn("offline_sales", "retryCount", "INTEGER DEFAULT 0");
  await ensureColumn("offline_sales", "syncStatus", "TEXT DEFAULT 'pending'");
  await ensureColumn("offline_sales", "syncedAt", "TEXT");
  await ensureColumn("offline_sales", "postgresId", "TEXT");
}

/* =====================================================
   ⏱ EXPONENTIAL BACKOFF
===================================================== */
function backoff(retryCount = 0) {
  return Math.min(2 ** retryCount * 1000, 30000);
}


/* =====================================================
   🧠 SAFE JSON PARSER
===================================================== */
function safeParseJSON(value) {
  try {
    if (!value) return [];
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/* =====================================================
   ⏱ BACKOFF
===================================================== */
function backoff(retryCount = 0) {
  return Math.min(2 ** retryCount * 1000, 30000);
}

/* =====================================================
   🛠 SCHEMA HEALER
===================================================== */
async function ensureColumn(table, column, type) {
  const cols = await db.all(`PRAGMA table_info(${table})`);
  const exists = cols.some(c => c.name === column);

  if (!exists) {
    console.warn(`🛠 Adding missing column: ${table}.${column}`);
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

async function healOfflineSalesSchema() {
  await ensureColumn("offline_sales", "retryCount", "INTEGER DEFAULT 0");
  await ensureColumn("offline_sales", "syncStatus", "TEXT DEFAULT 'pending'");
  await ensureColumn("offline_sales", "syncedAt", "TEXT");
  await ensureColumn("offline_sales", "postgresId", "TEXT");
}

/* =====================================================
   🔁 SYNC OFFLINE SALES → POSTGRES
===================================================== */
async function syncOfflineSales() {
  /* 🔥 0️⃣ AUTO-HEAL SCHEMA */
  await healOfflineSalesSchema();

  /* 1️⃣ Check connectivity */
  try {
    await query("SELECT 1");
  } catch {
    console.log("⚠️ Supabase offline — skipping sales sync");
    return;
  }

  /* 2️⃣ Fetch pending sales */
  let pendingSales;

  try {
    pendingSales = await db.all(`
      SELECT *
      FROM offline_sales
      WHERE syncStatus = 'pending'
        AND (retryCount IS NULL OR retryCount < ${MAX_RETRIES})
      ORDER BY createdAt ASC
    `);
  } catch (err) {
    console.error("❌ Failed reading offline_sales:", err.message);
    return;
  }

  if (!pendingSales.length) return;

  console.log(`🔄 Syncing ${pendingSales.length} sale(s) → Supabase`);

  /* 3️⃣ Process each sale */
  for (const sale of pendingSales) {
    try {
      /* 🧠 SAFE PARSE */
      const items = safeParseJSON(sale.items);

      /* 🚫 SKIP CORRUPTED SALES */
      if (!Array.isArray(items) || items.length === 0) {
        console.warn("⚠️ Invalid sale items. Marking as failed:", sale.id);

        await db.run(
          `
          UPDATE offline_sales
          SET syncStatus = 'failed'
          WHERE id = ?
          `,
          [sale.id]
        );

        continue;
      }

      /* 🚀 INSERT INTO POSTGRES */
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
          JSON.stringify(items),
          Number(sale.total || 0),
          0,
          sale.paymentStatus || "paid",
          sale.customerName || "Walk-in Customer",
          sale.createdAt,
          sale.adminId,
          sale.storeId,
          sale.cashierId || sale.adminId
        ]
      );

      const postgresId = result.rows[0].id;

      /* ✅ MARK AS SYNCED */
      await db.run(
        `
        UPDATE offline_sales
        SET
          syncStatus = 'synced',
          syncedAt = CURRENT_TIMESTAMP,
          postgresId = ?,
          retryCount = 0
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

      /* 🔁 RETRY */
      try {
        await db.run(
          `
          UPDATE offline_sales
          SET retryCount = COALESCE(retryCount, 0) + 1
          WHERE id = ?
          `,
          [sale.id]
        );
      } catch (e) {
        console.error("❌ Retry update failed:", e.message);
      }

      /* 🛑 STOP AFTER MAX RETRIES */
      if ((sale.retryCount || 0) + 1 >= MAX_RETRIES) {
        console.warn("🚫 Max retries reached. Marking as failed:", sale.id);

        await db.run(
          `
          UPDATE offline_sales
          SET syncStatus = 'failed'
          WHERE id = ?
          `,
          [sale.id]
        );
      }

      /* ⏱ BACKOFF */
      await new Promise((r) =>
        setTimeout(r, backoff(sale.retryCount))
      );
    }
  }
}

module.exports = syncOfflineSales;