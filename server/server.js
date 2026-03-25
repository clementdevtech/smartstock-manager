require("./loadEnv")();

const path = require("path");
const fs = require("fs");
const os = require("os");

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { connectDB, dbStatus } = require("./config/db");
const syncOfflineSales = require("./sync/syncSales");
const syncOfflineLogos = require("./sync/syncOfflineLogos");
const { syncPendingItems } = require("./sync/syncPendingItems");

/* =====================================================
   🧠 MODE DETECTION
===================================================== */
const isElectron =
  process.env.ELECTRON_RUN === "true";

/* =====================================================
   🗂️ APP DATA DIR
===================================================== */
const APP_DATA =
  process.env.APP_DATA ||
  path.join(os.homedir(), ".smartstock");

if (!fs.existsSync(APP_DATA)) {
  fs.mkdirSync(APP_DATA, { recursive: true });
}

process.env.APP_DATA = APP_DATA;

/* =====================================================
   🚀 APP INIT
===================================================== */
const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: true
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev")
);

if (!isElectron) {
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500
    })
  );
}

/* =====================================================
   ROUTES
===================================================== */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/items", require("./routes/inventoryRoutes"));
app.use("/api/sales", require("./routes/salesRoutes"));
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/forecast", require("./routes/forecastRoutes"));
app.use("/api/targets", require("./routes/targetRoutes"));
app.use("/api/csv", require("./routes/csvRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/keys", require("./routes/keyRoutes"));
app.use("/api/backup", require("./routes/backupRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

/* =====================================================
   ❤️ HEALTH CHECK
===================================================== */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: isElectron ? "Electron" : "Web",
    postgres: dbStatus(),
    uptime: process.uptime(),
    appData: APP_DATA,
    time: new Date().toISOString()
  });
});

/* =====================================================
   ❌ GLOBAL ERROR HANDLER
===================================================== */
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err.stack || err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

/* =====================================================
   🚀 START SERVER (CRITICAL FIXED SECTION)
===================================================== */
const PORT = Number(process.env.PORT) || 3333;
const HOST = isElectron ? "127.0.0.1" : "0.0.0.0";

let server;
let syncInterval;
let auxSyncInterval;

function start() {
  console.log("🧠 Mode:", isElectron ? "Electron" : "Web");
  console.log("🌐 Binding to:", HOST, PORT);

  // ✅ START SERVER FIRST (NO BLOCKING)
  server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running on http://${HOST}:${PORT}`);

  // ✅ ADD THIS LINE
  console.log("✅ BACKEND_READY");
});

  server.on("error", err => {
    console.error("❌ Server failed to bind:", err);
  });

  // ✅ CONNECT DB IN BACKGROUND (NEVER BLOCK)
  setImmediate(async () => {
    try {
      console.log("🔄 Connecting database...");
      await connectDB();
      console.log("✅ Database connection completed");
    } catch (err) {
      console.error("⚠️ DB connection failed. Running SQLite only.", err.message);
    }
  });

  // ✅ SAFE BACKGROUND SYNC (CAN’T CRASH SERVER)
  auxSyncInterval = setInterval(() => {
    try {
      syncOfflineLogos();
      syncPendingItems();
    } catch (err) {
      console.error("⚠️ Background sync error:", err.message);
    }
  }, 30_000);

  syncOfflineSales().catch(() => {});
  syncInterval = setInterval(() => {
    syncOfflineSales().catch(() => {});
  }, 60_000);
}

start();

/* =====================================================
   🛑 GRACEFUL SHUTDOWN
===================================================== */
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("🛑 Shutting down backend...");

  if (syncInterval) clearInterval(syncInterval);
  if (auxSyncInterval) clearInterval(auxSyncInterval);

  if (server) {
    server.close(() => {
      console.log("✅ Backend stopped cleanly");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

module.exports = app;