const path = require("path");
const fs = require("fs");
const os = require("os");

/* =====================================================
   WRITEABLE APP DATA DIRECTORY
===================================================== */

function getAppDataDir() {
  if (process.env.SMARTSTOCK_APP_DATA) return process.env.SMARTSTOCK_APP_DATA;
  if (process.env.APP_DATA && process.env.ELECTRON_RUN !== "true") {
    return process.env.APP_DATA;
  }

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

const BetterSqlite3 = process.versions.electron || process.env.ELECTRON_RUN === "true"
  ? require(require.resolve("better-sqlite3", {
    paths: [path.resolve(__dirname, "..", "node_modules")],
  }))
  : require("better-sqlite3");
const rawDb = new BetterSqlite3(DB_PATH);
rawDb.pragma("journal_mode = WAL");
rawDb.pragma("foreign_keys = ON");
rawDb.pragma("synchronous = NORMAL");

console.log("SQLite initialized:", DB_PATH);

/* =====================================================
   EXEC WRAPPER
===================================================== */

function exec(sql) {
  rawDb.exec(sql);
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
  saleId TEXT,
  receiptNo TEXT UNIQUE,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal REAL,
  discountAmount REAL DEFAULT 0,
  taxRate REAL DEFAULT 0,
  tax REAL,
  total REAL,
  costOfGoods REAL DEFAULT 0,
  grossProfit REAL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  paymentType TEXT,
  paymentMethod TEXT DEFAULT 'cash',
  paymentStatus TEXT DEFAULT 'paid',
  amountPaid REAL DEFAULT 0,
  customerName TEXT,
  cashierId TEXT,
  storeId TEXT,
  adminId TEXT,
  version INTEGER DEFAULT 1,
  retryCount INTEGER DEFAULT 0,
  syncStatus TEXT DEFAULT 'pending',
  deleted INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  syncedAt TEXT
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY,
  saleId INTEGER NOT NULL,
  itemId INTEGER NOT NULL,
  itemName TEXT,
  sku TEXT,
  quantity REAL NOT NULL,
  unitPrice REAL NOT NULL,
  costPrice REAL DEFAULT 0,
  totalPrice REAL NOT NULL,
  totalCost REAL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

/* =========================
   STOCK MOVEMENTS
========================= */
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  movementId TEXT,
  itemId INTEGER NOT NULL,
  movementType TEXT NOT NULL,
  quantity REAL NOT NULL,
  unitCost REAL,
  supplierName TEXT,
  adminId TEXT,
  storeId TEXT,
  createdBy TEXT,
  referenceId INTEGER,
  notes TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  adminId TEXT NOT NULL,
  storeId TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  readAt TEXT,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_expenses (
  id TEXT PRIMARY KEY,
  expenseType TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  dueDate TEXT,
  paidAt TEXT,
  paymentMethod TEXT,
  supplierName TEXT,
  isRecurring INTEGER NOT NULL DEFAULT 0,
  recurrenceInterval TEXT,
  nextDueDate TEXT,
  parentExpenseId TEXT,
  periodKey TEXT,
  notes TEXT,
  storeId TEXT NOT NULL,
  adminId TEXT NOT NULL,
  createdBy TEXT,
  syncStatus TEXT NOT NULL DEFAULT 'pending',
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplierName TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  paymentMethod TEXT NOT NULL,
  reference TEXT,
  paidAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  storeId TEXT NOT NULL,
  adminId TEXT NOT NULL,
  createdBy TEXT,
  syncStatus TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS customer_receipts (
  id TEXT PRIMARY KEY,
  saleId TEXT NOT NULL,
  amount REAL NOT NULL,
  paymentMethod TEXT NOT NULL,
  reference TEXT,
  paidAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  storeId TEXT NOT NULL,
  adminId TEXT NOT NULL,
  createdBy TEXT,
  syncStatus TEXT NOT NULL DEFAULT 'pending'
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

const migrations = {
  offline_sales: {
    saleId: "TEXT",
    items: "TEXT NOT NULL DEFAULT '[]'",
    discountAmount: "REAL DEFAULT 0",
    taxRate: "REAL DEFAULT 0",
    costOfGoods: "REAL DEFAULT 0",
    grossProfit: "REAL DEFAULT 0",
    currency: "TEXT DEFAULT 'KES'",
    paymentMethod: "TEXT DEFAULT 'cash'",
    amountPaid: "REAL DEFAULT 0",
    customerName: "TEXT",
    retryCount: "INTEGER DEFAULT 0",
    deleted: "INTEGER DEFAULT 0",
    updatedAt: "TEXT",
  },
  sale_items: {
    itemName: "TEXT",
    sku: "TEXT",
    costPrice: "REAL DEFAULT 0",
    totalCost: "REAL DEFAULT 0",
  },
  stock_movements: {
    movementId: "TEXT",
    unitCost: "REAL",
    supplierName: "TEXT",
    adminId: "TEXT",
    storeId: "TEXT",
    createdBy: "TEXT",
  },
  local_expenses: {
    parentExpenseId: "TEXT",
    periodKey: "TEXT",
  },
};

for (const [table, columns] of Object.entries(migrations)) {
  const existingColumns = new Set(rawDb.pragma(`table_info(${table})`).map(({ name }) => name));
  for (const [column, definition] of Object.entries(columns)) {
    if (!existingColumns.has(column)) {
      rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

rawDb.exec(`
  UPDATE offline_sales
  SET saleId = COALESCE(saleId, receiptNo, 'legacy-' || id),
      items = CASE
        WHEN items IS NULL OR items = '[]' THEN COALESCE((
          SELECT json_group_array(json_object(
            'itemId', si.itemId,
            'name', si.itemName,
            'sku', si.sku,
            'quantity', si.quantity,
            'unitPrice', si.unitPrice,
            'costPrice', si.costPrice,
            'total', si.totalPrice,
            'totalCost', si.totalCost
          ))
          FROM sale_items si WHERE si.saleId = offline_sales.id
        ), '[]')
        ELSE items
      END,
      updatedAt = COALESCE(updatedAt, createdAt)
  WHERE saleId IS NULL OR items IS NULL OR items = '[]' OR updatedAt IS NULL
`);
rawDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_sales_sale_id ON offline_sales(saleId)");
rawDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_movement_id ON stock_movements(movementId) WHERE movementId IS NOT NULL");
rawDb.exec("CREATE INDEX IF NOT EXISTS idx_notifications_tenant_date ON notifications(adminId, storeId, createdAt)");
rawDb.exec("CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON local_expenses(adminId, storeId, dueDate)");
rawDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_period ON local_expenses(parentExpenseId, periodKey) WHERE parentExpenseId IS NOT NULL AND periodKey IS NOT NULL");
rawDb.exec("CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant_date ON supplier_payments(adminId, storeId, paidAt)");
rawDb.exec("CREATE INDEX IF NOT EXISTS idx_customer_receipts_sale ON customer_receipts(adminId, storeId, saleId)");

/* =====================================================
   DB WRAPPER
===================================================== */

db = {
  run(sql, params = []) {
    return rawDb.prepare(sql).run(params);
  },

  get(sql, params = []) {
    return rawDb.prepare(sql).get(params);
  },

  all(sql, params = []) {
    return rawDb.prepare(sql).all(params);
  },

  transaction(fn) {
    return rawDb.transaction(fn)();
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