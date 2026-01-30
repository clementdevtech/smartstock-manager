const path = require("path");
const fs = require("fs");

require("./loadEnv")();
/* =====================================================
   IMPORTS
===================================================== */
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const os = require("os");

const connectDB = require("./config/db");
const syncOfflineSales = require("./sync/syncSales");

/* =====================================================
   🗂️ APP DATA DIR (WRITABLE)
===================================================== */
const APP_DATA =
  process.env.APP_DATA ||
  path.join(os.homedir(), ".smartstock");

if (!fs.existsSync(APP_DATA)) {
  fs.mkdirSync(APP_DATA, { recursive: true });
}

process.env.APP_DATA = APP_DATA;

/* =====================================================
   APP INIT
===================================================== */
const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "*",
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev")
);

/* =====================================================
   ROUTES
===================================================== */
app.use("/api/items", require("./routes/inventoryRoutes"));
app.use("/api/sales", require("./routes/salesRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/backup", require("./routes/backupRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/upload", require("./routes/upload"));

/* =====================================================
   HEALTH CHECK
===================================================== */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    appData: APP_DATA,
    time: new Date().toISOString()
  });
});

/* =====================================================
   OPTIONAL WEB MODE (STATIC CLIENT)
===================================================== */
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "..", "client", "dist");

  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.get("*", (_, res) =>
      res.sendFile(path.join(clientBuildPath, "index.html"))
    );
  }
}

/* =====================================================
   ERROR HANDLER
===================================================== */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err.stack || err);
  res.status(500).json({ success: false, message: err.message });
});

/* =====================================================
   🚀 START SERVER (UNIVERSAL)
===================================================== */
const isElectron =
  !!process.versions.electron ||
  process.argv.some(a => a.includes("electron"));

const PORT = Number(process.env.PORT) || 3333;
const HOST = isElectron ? "127.0.0.1" : "0.0.0.0";

let server;

async function start() {
  try {
    console.log("🧠 Mode:", isElectron ? "Electron" : "Web");
    console.log("🌐 Binding to:", HOST, PORT);

    await connectDB();

    server = app.listen(PORT, HOST, () => {
      console.log(`🚀 Backend running on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Backend startup failed:", err);
    process.exit(1);
  }
}

start();


/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("🛑 Shutting down backend...");
  if (server) {
    server.close(() => {
      console.log("✅ Backend stopped cleanly");
      process.exit(0);
    });
  }
}

module.exports = app;
