const sqlite = require("../sqlite");
const { query } = require("../config/db");

/* =====================================================
   ONLINE CHECK
===================================================== */
async function isOnline() {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/* =====================================================
   EXPONENTIAL BACKOFF
===================================================== */
function backoff(retryCount) {
  return Math.min(2 ** retryCount * 1000, 30000);
}

/* =====================================================
   SQLITE SCHEMA HEALER
===================================================== */
async function ensureColumn(table, column, type = "TEXT") {
  const cols = await sqlite.all(`PRAGMA table_info(${table})`);
  const names = cols.map(c => c.name);

  if (!names.includes(column)) {
    console.warn(`🛠 Auto-healing: ${table}.${column}`);
    await sqlite.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function healLocalItemsSchema() {
  ensureColumn("local_items", "syncStatus", "TEXT DEFAULT 'pending'");
  ensureColumn("local_items", "retryCount", "INTEGER DEFAULT 0");
  ensureColumn("local_items", "version", "INTEGER DEFAULT 1");
  ensureColumn("local_items", "deleted", "INTEGER DEFAULT 0");
  ensureColumn("local_items", "lastSyncedAt", "TEXT");
}

/* =====================================================
   SAFE SQLITE QUERY WRAPPER
===================================================== */
async function safeSelectPendingItems() {
  try {
    return await sqlite.all(`
      SELECT *
      FROM local_items
      WHERE syncStatus = 'pending'
        AND retryCount < 5
      ORDER BY updatedAt ASC
    `);
  } catch (err) {
    if (err.message.includes("no such column")) {
      console.warn("⚠️ Schema mismatch detected. Healing...");
      healLocalItemsSchema();
      return [];
    }
    throw err;
  }
}

/* =====================================================
   MAIN SYNC WORKER
===================================================== */
async function syncPendingItems() {
  if (!(await isOnline())) return;

  const pendingItems = await safeSelectPendingItems();

  for (const item of pendingItems) {
    try {
      await syncSingleItem(item);

      sqlite.run(`
        UPDATE local_items
        SET syncStatus = 'synced',
            retryCount = 0,
            lastSyncedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [item.id]);

    } catch (err) {
      console.error("❌ Sync failed for item:", item.sku, err.message);

      try {
        sqlite.run(`
          UPDATE local_items
          SET retryCount = retryCount + 1
          WHERE id = ?
        `, [item.id]);
      } catch {
        // Heal & continue
        healLocalItemsSchema();
      }

      await new Promise(r => setTimeout(r, backoff(item.retryCount || 0)));
    }
  }
}

/* =====================================================
   SYNC ONE ITEM (CREATE / UPDATE / DELETE)
===================================================== */
async function syncSingleItem(item) {
  /* ============================
     CREATE
  ============================ */
  if (!item.postgresId && !item.deleted) {
    const { rows } = await query(
  `
  INSERT INTO items (
    sku, name, category, unit,
    wholesale_price, retail_price,
    quantity, low_stock_threshold,
    batch_number, expiry_date,
    admin_id, store_id,
    created_by, -- 🔥 ADD THIS
    version, last_device_id
  ) VALUES (
    $1,$2,$3,$4,
    $5,$6,$7,$8,
    $9,$10,
    $11,$12,
    $13, -- 🔥 NEW
    1,$14
  )
  RETURNING id, version
  `,
  [
    item.sku,
    item.name,
    item.category,
    item.unit,
    item.wholesalePrice,
    item.retailPrice,
    item.quantity,
    item.lowStockThreshold,
    item.batchNumber,
    item.expiryDate,
    item.adminId,
    item.storeId,
    item.adminId,        // 🔥 created_by FIX
    sqlite.DEVICE_ID
  ]
);

    sqlite.run(`
      UPDATE local_items
      SET postgresId = ?, version = ?
      WHERE id = ?
    `, [rows[0].id, rows[0].version, item.id]);

    return;
  }

  /* ============================
     DELETE
  ============================ */
  if (item.deleted) {
    await query(
      `
      UPDATE items
      SET deleted = true,
          version = version + 1,
          last_device_id = $1
      WHERE id = $2
      `,
      [sqlite.DEVICE_ID, item.postgresId]
    );

    sqlite.run(`DELETE FROM local_items WHERE id = ?`, [item.id]);
    return;
  }

  /* ============================
     CONFLICT CHECK
  ============================ */
  const { rows } = await query(
    `SELECT version FROM items WHERE id = $1`,
    [item.postgresId]
  );

  if (!rows.length) {
    throw new Error("Remote item missing");
  }

  if (rows[0].version > item.version) {
    sqlite.run(`
      UPDATE local_items
      SET syncStatus = 'conflict'
      WHERE id = ?
    `, [item.id]);
    return;
  }

  /* ============================
     SAFE UPDATE
  ============================ */
  const result = await query(
    `
    UPDATE items
    SET quantity = $1,
        wholesale_price = $2,
        retail_price = $3,
        version = version + 1,
        updated_at = now(),
        last_device_id = $4
    WHERE id = $5
      AND version = $6
    RETURNING version
    `,
    [
      item.quantity,
      item.wholesalePrice,
      item.retailPrice,
      sqlite.DEVICE_ID,
      item.postgresId,
      item.version
    ]
  );

  if (!result.rowCount) {
    throw new Error("Optimistic lock failed");
  }

  sqlite.run(`
    UPDATE local_items
    SET version = ?
    WHERE id = ?
  `, [result.rows[0].version, item.id]);
}

/* =====================================================
   AUTO-RUN TRIGGERS
===================================================== */
function startSyncWorker() {
  syncPendingItems();
  setInterval(syncPendingItems, 15000);
}

module.exports = {
  syncPendingItems,
  startSyncWorker
};
