const path = require("path");
const fs = require("fs");
const os = require("os");

const isElectron = !!process.versions.electron;

/* =====================================================
   WRITEABLE APP DATA DIRECTORY
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
const DB_PATH = path.join(DATA_DIR, "data.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* =====================================================
   DATABASE INIT
===================================================== */

let db;
let rawDb;

if (isElectron) {
  const BetterSqlite3 = require("better-sqlite3");

  rawDb = new BetterSqlite3(DB_PATH);
  rawDb.pragma("journal_mode = WAL");
  rawDb.pragma("foreign_keys = ON");
  rawDb.pragma("synchronous = NORMAL");

  console.log("📦 SQLite initialized (Electron):", DB_PATH);

} else {
  const sqlite3 = require("sqlite3").verbose();

  rawDb = new sqlite3.Database(DB_PATH, err => {
    if (err) throw err;
  });

  rawDb.serialize(() => {
    rawDb.run("PRAGMA journal_mode = WAL");
    rawDb.run("PRAGMA foreign_keys = ON");
  });

  console.log("📦 SQLite initialized (Web):", DB_PATH);
}

/* =====================================================
   EXEC WRAPPER
===================================================== */

function exec(sql) {
  if (isElectron) {
    rawDb.exec(sql);
  } else {
    rawDb.exec
      ? rawDb.exec(sql)
      : rawDb.serialize(() => rawDb.run(sql));
  }
}

/* =====================================================
   TABLES
===================================================== */

exec(`

/* =========================
   STORES
========================= */
CREATE TABLE IF NOT EXISTS local_stores (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  name TEXT NOT NULL,
  location TEXT,
  adminId TEXT NOT NULL,
  businessType TEXT DEFAULT 'retail',
  industryType TEXT DEFAULT 'retail',
  isMainBranch INTEGER DEFAULT 0,
  syncStatus TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   USERS
========================= */
CREATE TABLE IF NOT EXISTS local_users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  storeId TEXT,
  storeName TEXT,
  adminId TEXT,
  phone TEXT,
  country TEXT,
  logoUrl TEXT,
  reset_password_token TEXT,
  reset_password_expire TEXT,
  syncStatus TEXT DEFAULT 'local',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT,
  CHECK (role = 'user')
);

/* =========================
   INVENTORY
========================= */
CREATE TABLE IF NOT EXISTS local_items (
  id INTEGER PRIMARY KEY,
  postgres_id TEXT,

  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT,

  cost_price REAL DEFAULT 0,
  wholesale_price REAL DEFAULT 0,
  retail_price REAL DEFAULT 0,

  stock_unit TEXT DEFAULT 'pcs',
  selling_unit TEXT DEFAULT 'pcs',
  units_per_package REAL DEFAULT 1,

  package_unit TEXT,
  min_sale_qty REAL DEFAULT 1,
  sale_step REAL DEFAULT 1,

  quantity REAL DEFAULT 0,
  low_stock_threshold REAL DEFAULT 5,

  allow_decimal_sales INTEGER DEFAULT 0,
  track_batches INTEGER DEFAULT 0,
  track_expiry INTEGER DEFAULT 0,
  is_controlled INTEGER DEFAULT 0,

  supplier TEXT,

  adminId TEXT NOT NULL,
  storeId TEXT NOT NULL,

  version INTEGER DEFAULT 1,
  device_id TEXT,
  deleted INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  syncStatus TEXT DEFAULT 'pending',
  last_synced_at TEXT,

  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_items_store
ON local_items (storeId);

CREATE INDEX IF NOT EXISTS idx_local_items_admin
ON local_items (adminId);

CREATE INDEX IF NOT EXISTS idx_local_items_sync
ON local_items (syncStatus);

CREATE INDEX IF NOT EXISTS idx_local_items_sku
ON local_items (sku);

/* =========================
   ITEM BATCHES
========================= */
CREATE TABLE IF NOT EXISTS item_batches (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  itemId INTEGER NOT NULL,
  batchNumber TEXT,
  expiryDate TEXT,
  quantity REAL NOT NULL,
  costPrice REAL,
  syncStatus TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   RECIPES
========================= */
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  finishedItemId INTEGER NOT NULL,
  ingredientId INTEGER NOT NULL,
  quantityRequired REAL NOT NULL,
  syncStatus TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   SALES
========================= */
CREATE TABLE IF NOT EXISTS offline_sales (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  receiptNo TEXT UNIQUE,
  subtotal REAL,
  tax REAL,
  total REAL,
  paymentType TEXT,
  paymentStatus TEXT DEFAULT 'paid',
  cashierId TEXT,
  storeId TEXT,
  adminId TEXT,
  version INTEGER DEFAULT 1,
  syncStatus TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  saleId INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  quantity REAL NOT NULL,
  unitPrice REAL NOT NULL,
  totalPrice REAL NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   STOCK MOVEMENTS
========================= */
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  itemId INTEGER NOT NULL,
  movementType TEXT NOT NULL,
  quantity REAL NOT NULL,
  referenceId INTEGER,
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   STOCK TRANSFERS
========================= */
CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  fromStoreId TEXT NOT NULL,
  toStoreId TEXT NOT NULL,
  items TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  adminId TEXT NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT
);

/* =========================
   CASHIER SHIFTS
========================= */
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  cashierId TEXT,
  storeId TEXT,
  adminId TEXT,
  openingCash REAL DEFAULT 0,
  closingCash REAL,
  expectedCash REAL,
  openedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  closedAt TEXT,
  status TEXT DEFAULT 'open',
  syncStatus TEXT DEFAULT 'pending'
);

/* =========================
   Z REPORTS
========================= */
CREATE TABLE IF NOT EXISTS z_reports (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  storeId TEXT,
  cashierId TEXT,
  adminId TEXT,
  totalSales REAL,
  cashSales REAL,
  cardSales REAL,
  mobileSales REAL,
  transactionCount INTEGER,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncStatus TEXT DEFAULT 'pending'
);

`);

/* =====================================================
   DB WRAPPER
===================================================== */

db = {
  run(sql, params = []) {
    if (isElectron) {
      return rawDb.prepare(sql).run(params);
    }

    return new Promise((resolve, reject) => {
      rawDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },

  get(sql, params = []) {
    if (isElectron) {
      return rawDb.prepare(sql).get(params);
    }

    return new Promise((resolve, reject) => {
      rawDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    if (isElectron) {
      return rawDb.prepare(sql).all(params);
    }

    return new Promise((resolve, reject) => {
      rawDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  transaction(fn) {
    if (isElectron) {
      return rawDb.transaction(fn)();
    }

    return new Promise(async (resolve, reject) => {
      try {
        await db.run("BEGIN");
        await fn();
        await db.run("COMMIT");
        resolve();
      } catch (e) {
        await db.run("ROLLBACK");
        reject(e);
      }
    });
  },

  raw: rawDb
};

/* =====================================================
   MIGRATIONS
===================================================== */

async function migrate(table, column, type = "TEXT") {
  try {
    const cols = await db.all(`PRAGMA table_info(${table})`);
    const names = cols.map(c => c.name);

    if (!names.includes(column)) {
      console.log(`🛠 Migrating: ${table}.${column}`);
      await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  } catch (err) {
    console.error(`❌ Migration failed`, err);
  }
}

/* =====================================================
   RUN MIGRATIONS
===================================================== */

(async () => {
  try {

    await migrate("local_users", "phone");
    await migrate("local_users", "country");
    await migrate("local_users", "logoUrl");

    await migrate("local_items", "updatedAt");

    await migrate("offline_sales", "postgresId");

    console.log("✅ All migrations complete");

  } catch (err) {
    console.error("❌ Migration system failed:", err);
  }
})();

module.exports = db;