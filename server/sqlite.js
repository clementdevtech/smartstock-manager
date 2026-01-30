const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const os = require("os");

/* =====================================================
   WRITEABLE APP DATA DIRECTORY (ELECTRON + PROD SAFE)
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

/* =====================================================
   ENSURE DATA DIRECTORY EXISTS
===================================================== */
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/* =====================================================
   SQLITE INIT
===================================================== */
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

console.log("📦 SQLite initialized at:", DB_PATH);

/* =====================================================
   BASE TABLES
===================================================== */
db.exec(`
/* ================================
   LOCAL USERS (OFFLINE CACHE)
================================ */
CREATE TABLE IF NOT EXISTS local_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  phone TEXT,
  password TEXT,
  storeId TEXT,
  adminId TEXT,
  storeName TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* ================================
   INVENTORY
================================ */
CREATE TABLE IF NOT EXISTS local_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  mongoId TEXT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT DEFAULT 'pcs',

  wholesalePrice REAL,
  retailPrice REAL,
  quantity INTEGER DEFAULT 0,
  lowStockThreshold INTEGER DEFAULT 5,

  supplier TEXT,
  batchNumber TEXT,
  expiryDate TEXT,

  adminId TEXT NOT NULL,
  storeId TEXT NOT NULL,

  lastSyncedAt TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_items_sku ON local_items (sku);
CREATE INDEX IF NOT EXISTS idx_local_items_store ON local_items (storeId);

/* ================================
   OFFLINE SALES QUEUE
================================ */
CREATE TABLE IF NOT EXISTS offline_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mongoId TEXT,
  receiptNo TEXT UNIQUE,
  items TEXT NOT NULL,
  subtotal REAL,
  tax REAL,
  total REAL,
  paymentType TEXT,
  paymentStatus TEXT,
  cashierId TEXT,
  storeId TEXT,
  adminId TEXT,
  status TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_offline_sales_status
  ON offline_sales (status);

/* ================================
   RECEIPTS
================================ */
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saleId INTEGER,
  receiptData TEXT,
  printed INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* ================================
   CASHIER SHIFTS
================================ */
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashierId TEXT,
  storeId TEXT,
  openingCash REAL DEFAULT 0,
  closingCash REAL,
  expectedCash REAL,
  openedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  closedAt TEXT,
  status TEXT DEFAULT 'open'
);

/* ================================
   Z-REPORTS
================================ */
CREATE TABLE IF NOT EXISTS z_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storeId TEXT,
  cashierId TEXT,
  totalSales REAL,
  cashSales REAL,
  cardSales REAL,
  mobileSales REAL,
  transactionCount INTEGER,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* ================================
   META
================================ */
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT,
  entityId INTEGER,
  action TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  code TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  used INTEGER DEFAULT 0,
  assigned_email TEXT
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  createdBy TEXT,
  used INTEGER DEFAULT 0
);
`);

/* =====================================================
   🔥 SAFE MIGRATIONS (NO CRASH EVER)
===================================================== */
function migrate(table, column, type = "TEXT") {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(c => c.name);

  if (!cols.includes(column)) {
    console.log(`🛠 Migrating: ${table}.${column}`);
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// Example future-proof migrations
migrate("local_users", "phone", "TEXT");

/* =====================================================
   DB WRAPPER
===================================================== */
module.exports = {
  run(sql, params = []) {
    return db.prepare(sql).run(params);
  },
  get(sql, params = []) {
    return db.prepare(sql).get(params);
  },
  all(sql, params = []) {
    return db.prepare(sql).all(params);
  },
  transaction(fn) {
    return db.transaction(fn)();
  },
  db
};
