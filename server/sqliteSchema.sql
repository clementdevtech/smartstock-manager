-- ------------------------------
-- USERS (Local / Normal Users)
-- ------------------------------
CREATE TABLE IF NOT EXISTS local_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  storeName TEXT,
  phone TEXT,
  country TEXT,
  logoUrl TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------
-- VERIFICATION CODES
-- ------------------------------
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  code TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------
-- PRODUCT KEYS
-- ------------------------------
CREATE TABLE IF NOT EXISTS product_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE,
  used INTEGER DEFAULT 0,
  assigned_email TEXT
);

-- ------------------------------
-- INVITE CODES
-- ------------------------------
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  createdBy TEXT,
  used INTEGER DEFAULT 0
);
