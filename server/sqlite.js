const path = require("path");
const fs = require("fs");
const os = require("os");


const path = require("path");
const { createRequire } = require("module");

const requireFunc = createRequire(__filename);

let Database;

if (process.pkg) {
  // running inside packaged exe
  const basePath = path.dirname(process.execPath);
  Database = requireFunc(
    path.join(basePath, "node_modules/better-sqlite3")
  );
} else {
  // normal dev mode
  Database = requireFunc("better-sqlite3");
}

/* =====================================================
   WRITEABLE APP DATA DIRECTORY (ELECTRON + PROD SAFE)
===================================================== */
function getAppDataDir() {
  const appName = "SmartStockPOS";

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), appName);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
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
   BASE TABLES (OFFLINE CACHE)
===================================================== */
db.exec(`
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
  CONSTRAINT local_users_only_users CHECK (role = 'user')
);

CREATE TABLE IF NOT EXISTS local_items (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
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
  version INTEGER DEFAULT 1,
  deviceId TEXT,
  deleted INTEGER DEFAULT 0,
  syncStatus TEXT DEFAULT 'pending',
  retryCount INTEGER DEFAULT 0,
  lastSyncedAt TEXT,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_items_sku ON local_items (sku);

CREATE TABLE IF NOT EXISTS offline_sales (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
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
  syncStatus TEXT DEFAULT 'pending',
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY,
  saleId INTEGER,
  receiptData TEXT,
  printed INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  cashierId TEXT,
  storeId TEXT,
  openingCash REAL DEFAULT 0,
  closingCash REAL,
  expectedCash REAL,
  openedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  closedAt TEXT,
  status TEXT DEFAULT 'open',
  syncStatus TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS z_reports (
  id INTEGER PRIMARY KEY,
  postgresId TEXT,
  storeId TEXT,
  cashierId TEXT,
  totalSales REAL,
  cashSales REAL,
  cardSales REAL,
  mobileSales REAL,
  transactionCount INTEGER,
  generatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncStatus TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY,
  email TEXT,
  code TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offline_logos (
  id INTEGER PRIMARY KEY,
  store_name TEXT NOT NULL,
  local_path TEXT NOT NULL,
  syncStatus TEXT DEFAULT 'pending',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  syncedAt DATETIME,
  cloudinary_url TEXT,
  cloudinary_public_id TEXT
);
`);

/* =====================================================
   🔥 BACKWARD-SAFE MIGRATIONS
===================================================== */
function migrate(table, column, type = "TEXT") {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    console.log(`🛠 Migrating: ${table}.${column}`);
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/* =====================================================
   MIGRATIONS (NON-DESTRUCTIVE)
===================================================== */
migrate("local_users", "phone");
migrate("local_users", "country");
migrate("local_users", "logoUrl");
migrate("local_users", "syncStatus");
migrate("local_users", "reset_password_token");
migrate("local_users", "reset_password_expire");

migrate("local_items", "postgresId");
migrate("local_items", "syncStatus");
migrate("offline_sales", "postgresId");

/* =====================================================
   INDEXES (SAFE)
===================================================== */
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_local_items_sync
  ON local_items (syncStatus);
`);

/* =====================================================
   🧹 AUTO-CLEANUP (FIX EARLIER MESSES)
   - removes leaked admins from local_users
===================================================== */
db.exec(`
  DELETE FROM local_users
  WHERE role != 'user';
`);

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
