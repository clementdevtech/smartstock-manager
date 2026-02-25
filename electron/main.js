const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const net = require("net");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { fork } = require("child_process");
const fs = require("fs-extra");

const isDev = !app.isPackaged;

/* ======================================================
   🔐 CONFIG
====================================================== */
const FORCE_UPDATE = false; // set true for mandatory update
const UPDATE_CHANNEL = process.env.UPDATE_CHANNEL || "latest";

const BACKEND_PORT = 3333;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

let mainWindow;
let splashWindow;
let backendProcess;
let heartbeatTimer;
let startAttempts = 0;

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
   🎨 ICON
====================================================== */
function getIcon() {
  if (process.platform === "win32") return path.join(__dirname, "icon.ico");
  if (process.platform === "darwin") return path.join(__dirname, "icon.icns");
  return path.join(__dirname, "icon-1024.png");
}

/* ======================================================
   🖥 SPLASH
====================================================== */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 540,
    height: 420,
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

  splashWindow.webContents.on("did-finish-load", () => {
    splashWindow.webContents.send("boot-status", {
      version: `v${app.getVersion()}`
    });
  });
}

function sendSplash(data) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.send("boot-status", data);
}

/* ======================================================
   🖥 MAIN WINDOW
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
    if (!FORCE_UPDATE) {
      splashWindow?.destroy();
      mainWindow.show();
    }
  });
}

/* ======================================================
   🔒 AUTO UPDATER (ENTERPRISE HYBRID)
====================================================== */
if (!isDev) {
  autoUpdater.channel = UPDATE_CHANNEL;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    sendSplash({ status: "Checking for updates…", progress: 8 });
  });

  autoUpdater.on("update-available", info => {
    const sizeMB = info.files?.[0]?.size
      ? (info.files[0].size / 1024 / 1024).toFixed(2)
      : "Unknown";

    sendSplash({
      status: "Update available",
      version: info.version,
      size: sizeMB,
      notes: info.releaseNotes,
      progress: 15
    });

    autoUpdater.downloadUpdate();
  });

  autoUpdater.on("download-progress", progress => {
    sendSplash({
      status: `Downloading update ${Math.round(progress.percent)}%`,
      progress: progress.percent
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendSplash({
      status: "Update ready to install",
      ready: true,
      progress: 100
    });

    if (FORCE_UPDATE) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("update-not-available", () => {
    sendSplash({ status: "App is up to date", progress: 100 });
  });

  autoUpdater.on("error", err => {
    log.error("Updater error:", err);
    sendSplash({ status: "Update failed — continuing", progress: 100 });
  });
}

/* ======================================================
   🔌 BACKEND ENTRY
====================================================== */
function getBackendEntry() {
  if (isDev)
    return path.join(__dirname, "..", "server", "server.js");

  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "server",
    "server.js"
  );
}

/* ======================================================
   💀 HARD KILL
====================================================== */
function hardKill(proc) {
  if (!proc) return;
  try { proc.kill("SIGKILL"); } catch {}
}

/* ======================================================
   ⏳ WAIT FOR PORT
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
        if (Date.now() - start > timeout)
          reject(new Error("Port timeout"));
        else setTimeout(check, 500);
      });

      socket.connect(port, "127.0.0.1");
    };

    check();
  });
}

/* ======================================================
   🏥 WAIT FOR HEALTH
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
        if (Date.now() - start > timeout)
          reject(new Error("Health timeout"));
        else setTimeout(check, 1000);
      }
    };

    check();
  });
}

/* ======================================================
   🔄 HEARTBEAT MONITOR
====================================================== */
function startHeartbeatMonitor() {
  clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    try {
      await waitForHealth(5000);
    } catch {
      log.error("Backend unresponsive — restarting...");
      await restartBackend();
    }
  }, 15000);
}

/* ======================================================
   🚀 START BACKEND
====================================================== */
async function startBackend() {
  const entry = getBackendEntry();

  if (!fs.existsSync(entry))
    throw new Error("Backend entry missing");

  startAttempts++;
  sendSplash({ status: "Starting backend…", progress: 35 });

  backendProcess = fork(entry, [], {
    cwd: path.dirname(entry),
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
      sendSplash({ status: "Backend crash loop detected", progress: 100 });
      app.quit();
    }
  });

  await waitForPort(BACKEND_PORT, 60000);
  await waitForHealth(60000);

  startAttempts = 0;
  startHeartbeatMonitor();
}

/* ======================================================
   🔁 RESTART BACKEND
====================================================== */
async function restartBackend() {
  sendSplash({ status: "Recovering backend…", progress: 60 });

  clearInterval(heartbeatTimer);

  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => hardKill(backendProcess), 5000);
  }

  await startBackend();
}

/* ======================================================
   🛑 STOP BACKEND
====================================================== */
function stopBackend() {
  clearInterval(heartbeatTimer);

  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => hardKill(backendProcess), 5000);
  }
}

/* ======================================================
   🧠 APP BOOT
====================================================== */
app.whenReady().then(async () => {
  createSplash();
  sendSplash({ status: "Launching SmartStock…", progress: 5 });

  try {
    if (!isDev) {
      autoUpdater.checkForUpdates(); // background
    }

    await startBackend();
    sendSplash({ status: "Loading UI…", progress: 85 });

    createMainWindow();

  } catch (err) {
    log.error("Startup failed:", err);
    sendSplash({ status: "Startup failed", progress: 100 });
    setTimeout(() => app.quit(), 3000);
  }
});

/* ======================================================
   🔔 INSTALL UPDATE IPC
====================================================== */
ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

/* ======================================================
   🧹 CLEAN EXIT
====================================================== */
app.on("before-quit", stopBackend);
app.on("will-quit", stopBackend);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});