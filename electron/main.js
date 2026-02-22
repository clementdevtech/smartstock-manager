const { app, BrowserWindow } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { fork } = require("child_process");
const fs = require("fs-extra");

const isDev = !app.isPackaged;

let mainWindow;
let splashWindow;
let backendProcess = null;

const BACKEND_PORT = 3333;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

/* ======================================================
   🔐 SINGLE INSTANCE
====================================================== */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

/* ======================================================
   🧨 GLOBAL CRASH LOGGING
====================================================== */
process.on("uncaughtException", err => log.error("Uncaught:", err));
process.on("unhandledRejection", err => log.error("Unhandled:", err));

/* ======================================================
   🔒 AUTO UPDATER
====================================================== */
if (!isDev) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
}

/* ======================================================
   🎨 ICON
====================================================== */
function getIcon() {
  if (process.platform === "win32") return path.join(__dirname, "icon.ico");
  if (process.platform === "darwin") return path.join(__dirname, "icon.icns");
  return path.join(__dirname, "icon-1024.png");
}

/* ======================================================
   SPLASH
====================================================== */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 540,
    height: 420,
    minWidth: 520,
    minHeight: 400,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, "splashPreload.js"),
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function sendSplash(status, percent) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send("boot-status", { status, percent });
}

/* ======================================================
   MAIN WINDOW
====================================================== */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(app.getAppPath(), "client", "dist", "index.html")
    );
  }

  mainWindow.once("ready-to-show", () => {
    splashWindow?.destroy();
    mainWindow.show();
  });
}

/* ======================================================
   BACKEND ENTRY
====================================================== */
function getBackendEntry() {
  let entry;

  if (isDev) {
    entry = path.join(__dirname, "..", "server", "server.js");
  } else {
    entry = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "server",
      "server.js"
    );
  }

  console.log("Backend path:", entry);
  return entry;
}

/* ======================================================
   HARD KILL
====================================================== */
function hardKill(proc) {
  if (!proc) return;
  try { proc.kill("SIGKILL"); } catch {}
}

/* ======================================================
   WAIT TCP PORT
====================================================== */
function waitForPort(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error("Port timeout"));
        } else {
          setTimeout(check, 500);
        }
      });

      socket.connect(port, "127.0.0.1");
    };

    check();
  });
}

/* ======================================================
   WAIT HEALTH ENDPOINT
====================================================== */
function waitForHealth(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      http.get(HEALTH_URL, res => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on("error", retry);

      function retry() {
        if (Date.now() - start > timeout) {
          reject(new Error("Health timeout"));
        } else {
          setTimeout(check, 1000);
        }
      }
    };

    check();
  });
}

/* ======================================================
   BACKEND WATCHDOG
====================================================== */
let heartbeatTimer;

function startHeartbeatMonitor() {
  clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    try {
      await waitForHealth(5000);
    } catch {
      log.error("💥 Backend unresponsive — restarting...");
      await restartBackend();
    }
  }, 15000);
}

/* ======================================================
   START BACKEND WITH RETRY
====================================================== */
let startAttempts = 0;

async function startBackend() {
  const backendEntry = getBackendEntry();

  if (!fs.existsSync(backendEntry)) {
    throw new Error("Backend entry missing");
  }

  startAttempts++;

  sendSplash("Starting backend…", 35);

  backendProcess = fork(backendEntry, [], {
    cwd: path.dirname(backendEntry),
    env: {
      ...process.env,
      NODE_ENV: isDev ? "development" : "production",
      PORT: String(BACKEND_PORT),
      APP_DATA: app.getPath("userData")
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });

  backendProcess.stdout?.on("data", d =>
    log.info("[BACKEND]", d.toString())
  );

  backendProcess.stderr?.on("data", d =>
    log.error("[BACKEND ERROR]", d.toString())
  );

  backendProcess.on("exit", async code => {
    log.error("Backend exited:", code);

    if (startAttempts < 10) {
      await restartBackend();
    } else {
      sendSplash("Backend crash loop detected", 100);
      app.quit();
    }
  });

  await waitForPort(BACKEND_PORT, 60000);
  await waitForHealth(60000);

  startAttempts = 0;
  startHeartbeatMonitor();
}

/* ======================================================
   RESTART BACKEND
====================================================== */
async function restartBackend() {
  sendSplash("Recovering backend…", 60);

  clearInterval(heartbeatTimer);

  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => hardKill(backendProcess), 5000);
  }

  await startBackend();
}

/* ======================================================
   STOP BACKEND
====================================================== */
function stopBackend() {
  clearInterval(heartbeatTimer);

  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => hardKill(backendProcess), 5000);
  }
}

/* ======================================================
   APP BOOT
====================================================== */
app.whenReady().then(async () => {
  createSplash();
  sendSplash("Launching SmartStock…", 5);

  try {
    await startBackend();
    sendSplash("Loading UI…", 85);
    createMainWindow();

    if (!isDev) autoUpdater.checkForUpdates().catch(() => {});
  } catch (err) {
    log.error("Startup failed:", err);
    sendSplash("Startup failed", 100);
    setTimeout(() => app.quit(), 3000);
  }
});

/* ======================================================
   CLEAN EXIT
====================================================== */
app.on("before-quit", stopBackend);
app.on("will-quit", stopBackend);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
