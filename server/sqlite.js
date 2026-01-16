const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// Database directory
const DB_DIR = path.join(__dirname);

// SQLite file
const DB_PATH = path.join(DB_DIR, "data.db");

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Connect to SQLite
const db = new Database(DB_PATH);
console.log("📦 SQLite initialized:", DB_PATH);

// ---------------------------------------------
// CREATE TABLES
// ---------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS local_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    storeName TEXT,
    phone TEXT,
    country TEXT,
    logoUrl TEXT,
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


// ----------------------------------------------------------
// WRAPPER FUNCTIONS (run, get, all)
// MATCHING EXACTLY your previous API
// ----------------------------------------------------------
module.exports = {
  run: (sql, params = []) => {
    const stmt = db.prepare(sql);
    const result = stmt.run(params);
    return result;
  },

  get: (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.get(params);
  },

  all: (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.all(params);
  },

  db, // export full db if needed
};
