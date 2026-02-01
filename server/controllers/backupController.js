const asyncHandler = require("express-async-handler");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { query } = require("../config/db"); 
const sqlite = require("../sqlite");

/* =====================================================
   APP DATA DIR (SAME AS SQLITE)
===================================================== */
function getAppDataDir() {
  const appName = "SmartStockPOS";

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), appName);
  }

  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      appName
    );
  }

  return path.join(os.homedir(), ".config", appName);
}

const DATA_DIR = getAppDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "data.db");
const BACKUP_DB_PATH = path.join(DATA_DIR, "backup.db");

/* =====================================================
   EXPORT BACKUP (POSTGRES → JSON)
===================================================== */
const exportBackup = asyncHandler(async (req, res) => {
  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;

  const [itemsRes, salesRes] = await Promise.all([
    query(
      `SELECT * FROM items WHERE admin_id = $1 AND store_id = $2`,
      [adminId, storeId]
    ),
    query(
      `SELECT * FROM sales WHERE admin_id = $1 AND store_id = $2`,
      [adminId, storeId]
    ),
  ]);

  const backupData = {
    meta: {
      app: "SmartStockPOS",
      adminId,
      storeId,
      exportedAt: new Date().toISOString(),
    },
    items: itemsRes.rows,
    sales: salesRes.rows,
  };

  await fs.ensureDir(UPLOADS_DIR);

  const fileName = `backup-${storeId}-${Date.now()}.json`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  await fs.writeJson(filePath, backupData, { spaces: 2 });

  res.download(filePath, fileName, async () => {
    setTimeout(() => fs.remove(filePath), 5000);
  });
});

/* =====================================================
   IMPORT BACKUP (JSON → POSTGRES)
===================================================== */
const importBackup = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No backup file uploaded");
  }

  const adminId = req.user.adminId || req.user.id;
  const storeId = req.user.storeId;

  const data = await fs.readJson(req.file.path);

  if (!data.items || !data.sales) {
    res.status(400);
    throw new Error("Invalid backup format");
  }

  /* ===============================
     CLEAR EXISTING DATA
  ============================== */
  await query(`DELETE FROM sales WHERE admin_id = $1 AND store_id = $2`, [
    adminId,
    storeId,
  ]);

  await query(`DELETE FROM items WHERE admin_id = $1 AND store_id = $2`, [
    adminId,
    storeId,
  ]);

  /* ===============================
     RESTORE ITEMS
  ============================== */
  for (const item of data.items) {
    await query(
      `
      INSERT INTO items (
        id, name, sku, category, unit,
        wholesale_price, retail_price, profit_margin,
        quantity, low_stock_threshold,
        batch_number, expiry_date, entry_date,
        supplier, image_url,
        admin_id, store_id, created_by,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,$13,$14,
        $15,$16,$17,
        now(), now()
      )
      `,
      [
        item.name,
        item.sku,
        item.category,
        item.unit,
        item.wholesale_price,
        item.retail_price,
        item.profit_margin,
        item.quantity,
        item.low_stock_threshold,
        item.batch_number,
        item.expiry_date,
        item.entry_date || new Date(),
        item.supplier || {},
        item.image_url || "",
        adminId,
        storeId,
        req.user.id,
      ]
    );
  }

  /* ===============================
     RESTORE SALES
  ============================== */
  for (const sale of data.sales) {
    await query(
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
        created_by,
        created_at,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()
      )
      `,
      [
        sale.items,
        sale.total_amount,
        sale.total_profit || 0,
        sale.payment_status || "paid",
        sale.customer_name || "Walk-in Customer",
        sale.sale_date || new Date(),
        adminId,
        storeId,
        req.user.id,
      ]
    );
  }

  await fs.remove(req.file.path);

  res.json({ message: "Backup imported successfully" });
});

/* =====================================================
   SQLITE FILE BACKUP (OFFLINE CACHE)
===================================================== */
const backupDatabase = asyncHandler(async (req, res) => {
  if (!fs.existsSync(DB_PATH)) {
    res.status(404);
    throw new Error("SQLite database not found");
  }

  await fs.copy(DB_PATH, BACKUP_DB_PATH, { overwrite: true });
  res.json({ message: "SQLite database backup completed" });
});

/* =====================================================
   SQLITE FILE RESTORE
===================================================== */
const restoreDatabase = asyncHandler(async (req, res) => {
  if (!fs.existsSync(BACKUP_DB_PATH)) {
    res.status(404);
    throw new Error("Backup database not found");
  }

  await fs.copy(BACKUP_DB_PATH, DB_PATH, { overwrite: true });
  res.json({ message: "SQLite database restored" });
});

module.exports = {
  exportBackup,
  importBackup,
  backupDatabase,
  restoreDatabase,
};
