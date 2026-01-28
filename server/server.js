const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const connectDB = require("./config/db");

// ==============================
// ROUTES
// ==============================
const inventoryRoutes = require("./routes/inventoryRoutes");
const salesRoutes = require("./routes/salesRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const backupRoutes = require("./routes/backupRoutes");
const adminRoutes = require("./routes/adminRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const uploadRoutes = require("./routes/upload");

// ==============================
// APP INIT
// ==============================
const app = express();

// ==============================
// DATABASE
// ==============================
connectDB();

// ==============================
// MIDDLEWARES
// ==============================

// Electron + browser safe CORS
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logging (less noisy in production)
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// Lightweight request log (keeps your "vibe")
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
  );
  next();
});

// ==============================
// API ROUTES
// ==============================
app.use("/api/items", inventoryRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/upload", uploadRoutes);

// ==============================
// HEALTH CHECK
// ==============================
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    time: new Date().toISOString()
  });
});

// ==============================
// SERVE CLIENT (OPTIONAL WEB MODE)
// ==============================
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "..", "client", "dist");

  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(clientBuildPath, "index.html"));
    });
  } else {
    console.warn("⚠️ Client build not found:", clientBuildPath);
  }
}

// ==============================
// GLOBAL ERROR HANDLER
// ==============================
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err.stack || err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

// ==============================
// SERVER START
// ==============================
const PORT = Number(process.env.PORT) || 3333;

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `🚀 SmartStock backend running on http://127.0.0.1:${PORT} (${process.env.NODE_ENV || "development"})`
  );
});

// ==============================
// GRACEFUL SHUTDOWN (Electron-safe)
// ==============================
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

function shutdown() {
  console.log("🛑 Shutting down backend...");
  server.close(() => {
    console.log("✅ Backend stopped cleanly");
    process.exit(0);
  });
}

module.exports = app;
