require("./loadEnv")();

const path = require("path");
const fs = require("fs");
const os = require("os");

/* =====================================================
   IMPORTS
===================================================== */
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const { connectDB, dbStatus } = require("./config/db");
const syncOfflineSales = require("./sync/syncSales");
const syncOfflineLogos = require("./sync/syncOfflineLogos");
const { syncPendingItems } = require("./sync/syncPendingItems");

/* =====================================================
   🧠 ENV / MODE DETECTION (pkg + Electron safe)
===================================================== */
const isElectron =
  !!process.versions.electron ||
  process.argv.some(arg => arg.toLowerCase().includes("electron"));

/* =====================================================
   🗂️ APP DATA DIR (WRITABLE & SAFE)
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

/* =====================================================
   ROUTES (FULL SYSTEM)
===================================================== */

/* 🔐 AUTH & USERS */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/upload", require("./routes/upload"));

/* 🏪 CORE POS */
app.use("/api/items", require("./routes/inventoryRoutes"));
app.use("/api/sales", require("./routes/salesRoutes"));

/* 👥 EMPLOYEES & PAYROLL */
app.use("/api/employees", require("./routes/employeeRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));

/* 📊 REPORTING & ANALYTICS */
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/forecast", require("./routes/forecastRoutes"));
app.use("/api/targets", require("./routes/targetRoutes"));

/* 📂 CSV / EXPORTS */
app.use("/api/csv", require("./routes/csvRoutes"));

/* ⚙️ SETTINGS & ADMIN */
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/keys", require("./routes/keyRoutes"));

/* 💾 BACKUPS */
app.use("/api/backup", require("./routes/backupRoutes"));

/* =====================================================
   ❤️ HEALTH CHECK (CRITICAL)
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
   🌍 STATIC CLIENT (WEB MODE ONLY)
===================================================== */
if (process.env.NODE_ENV === "production" && !isElectron) {
  const clientBuildPath = path.join(__dirname, "..", "client", "dist");

  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.get("*", (_, res) =>
      res.sendFile(path.join(clientBuildPath, "index.html"))
    );
  }
}

/* =====================================================
   ❌ GLOBAL ERROR HANDLER (NO CRASH EVER)
===================================================== */
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err.stack || err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

/* =====================================================
   🚀 START SERVER
===================================================== */
const PORT = Number(process.env.PORT) || 3333;
const HOST = isElectron ? "127.0.0.1" : "0.0.0.0";

let server;
let syncInterval;
let auxSyncInterval;

function start() {
  console.log("🧠 Mode:", isElectron ? "Electron" : "Web");
  console.log("🌐 Binding to:", HOST, PORT);

  // 🔥 Non-blocking DB connect
  connectDB();

  server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
  });

  // 🔁 Safe background sync
  auxSyncInterval = setInterval(() => {
    syncOfflineLogos();
    syncPendingItems();
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
