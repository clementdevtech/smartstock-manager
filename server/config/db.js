const { Pool } = require("pg");

let pool = null;
let isPostgresConnected = false;
let retryTimer = null;

/* =====================================================
   🔌 CONNECT TO SUPABASE POSTGRES
===================================================== */
async function connectDB() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set; using local SQLite only");
    return;
  }

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable"
        ? false
        : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" },
    });

    // 🔥 Test connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    isPostgresConnected = true;
    console.log("✅ Supabase PostgreSQL connected");
    logConnectionInfo();
    setupDisconnectHandler();
  } catch (error) {
    isPostgresConnected = false;
    console.error("❌ Supabase PostgreSQL connection failed:", error.message);
    console.log("⚠️ Running in OFFLINE MODE (SQLite only)");
    scheduleReconnect();
  }
}

/* =====================================================
   🔁 RETRY LOGIC (NON-BLOCKING)
===================================================== */
function scheduleReconnect() {
  if (retryTimer) return;

  retryTimer = setTimeout(async () => {
    retryTimer = null;
    console.log("🔄 Retrying Supabase PostgreSQL connection...");
    await connectDB();
  }, 15000);
}

/* =====================================================
   🧩 HELPER FUNCTIONS
===================================================== */
function logConnectionInfo() {
  if (!pool) return;
  const { host, port, database, user } = pool.options;
  console.log(`Connected to Postgres ${user}@${host}:${port}/${database}`);
}

function setupDisconnectHandler() {
  if (!pool) return;
  pool.on("error", (err) => {
    isPostgresConnected = false;
    console.warn("⚠️ PostgreSQL disconnected:", err.message);
    scheduleReconnect();
  });
}

/* =====================================================
   🧠 STATUS EXPORT (USED BY /api/health)
===================================================== */
function dbStatus() {
  return {
    connected: isPostgresConnected,
  };
}

/* =====================================================
   📦 QUERY WRAPPER (SAFE & CLEAN)
===================================================== */
async function query(text, params = []) {
  if (!pool) {
    throw new Error("PostgreSQL not initialized");
  }
  return pool.query(text, params);
}

/* =====================================================
   🧰 GETTER FOR POOL (SAFELY)
===================================================== */
function getPool() {
  if (!pool) {
    throw new Error("PostgreSQL not initialized");
  }
  return pool;
}

module.exports = {
  connectDB,
  dbStatus,
  query,
  getPool,
  get pool() {
    return pool;
  },
};
