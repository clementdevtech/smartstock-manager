const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { spawn } = require("child_process");
const fs = require("fs-extra");

const isDev = !app.isPackaged;

/* ======================================================
   🔐 CONFIG
====================================================== */
const FORCE_UPDATE = false;
const UPDATE_CHANNEL = process.env.UPDATE_CHANNEL || "latest";

const BACKEND_PORT = 3333;
const HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;

let mainWindow;
let splashWindow;
let backendProcess;
let isReady = false;
let heartbeatTimer;
let startAttempts = 0;
let updateWindow;

app.isQuitting = false;

/* ======================================================
   🧠 UPDATE MENU STATE
====================================================== */
let updateState = "idle";
let downloadProgress = 0;

/* ======================================================
   🎨 ICON
====================================================== */
function getIcon() {
  if (process.platform === "win32") return path.join(__dirname, "icon.ico");
  if (process.platform === "darwin") return path.join(__dirname, "icon.icns");
  return path.join(__dirname, "icon-1024.png");
}

/* ======================================================
   🧭 MENU
====================================================== */
function buildMenu() {
  let updateItem = {
    label: "Check for Updates",
    click: () => {
      createUpdateWindow();
      autoUpdater.checkForUpdates();
    }
  };

  if (updateState === "checking")
    updateItem = { label: "Checking for Updates…", enabled: false };

  if (updateState === "available")
    updateItem = { label: "Update Available — Downloading…", enabled: false };

  if (updateState === "downloading")
    updateItem = {
      label: `Downloading (${Math.round(downloadProgress)}%)`,
      enabled: false
    };

  if (updateState === "downloaded")
    updateItem = {
      label: "Restart to Install Update",
      click: () => autoUpdater.quitAndInstall()
    };

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "SmartStock",
      submenu: [updateItem, { type: "separator" }, { role: "quit" }]
    }
  ]));
}

/* ======================================================
   🔐 SINGLE INSTANCE
====================================================== */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

/* ======================================================
   🧨 GLOBAL ERRORS
====================================================== */
process.on("uncaughtException", err => log.error("Uncaught:", err));
process.on("unhandledRejection", err => log.error("Unhandled:", err));

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
}

function sendSplash(data) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send("boot-status", data);
  }
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
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableWebSQL: false,
      devTools: isDev
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), "client/dist/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    if (!FORCE_UPDATE) {
      splashWindow?.destroy();
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });
}

/* ======================================================
   🔒 AUTO UPDATER
====================================================== */
if (!isDev) {
  autoUpdater.channel = UPDATE_CHANNEL;
  autoUpdater.autoDownload = false;

  autoUpdater.on("checking-for-update", () => {
    updateState = "checking";
    buildMenu();
    sendSplash({ status: "Checking for updates…", progress: 8 });
  });

  autoUpdater.on("update-available", info => {
    updateState = "available";
    buildMenu();

    autoUpdater.downloadUpdate();

    sendSplash({
      status: "Update available",
      version: info.version,
      progress: 15
    });
  });

  autoUpdater.on("download-progress", p => {
    updateState = "downloading";
    downloadProgress = p.percent;
    buildMenu();

    sendSplash({
      status: `Downloading ${Math.round(p.percent)}%`,
      progress: p.percent
    });
  });

  autoUpdater.on("update-downloaded", () => {
    updateState = "downloaded";
    buildMenu();

    sendSplash({
      status: "Update ready",
      progress: 100
    });

    if (FORCE_UPDATE) autoUpdater.quitAndInstall();
  });

  autoUpdater.on("update-not-available", () => {
    updateState = "idle";
    buildMenu();
  });

  autoUpdater.on("error", err => {
    log.error("Updater error:", err);
  });
}

/* ======================================================
   ⬆️ UPDATE WINDOW
====================================================== */
function createUpdateWindow() {
  if (updateWindow) return updateWindow.focus();

  updateWindow = new BrowserWindow({
    width: 520,
    height: 420,
    resizable: false,
    icon: getIcon(),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  updateWindow.loadFile(path.join(__dirname, "update.html"));

  updateWindow.on("closed", () => {
    updateWindow = null;
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
   🏥 HEALTH CHECK
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
        else
          setTimeout(check, 1000);
      }
    };

    check();
  });
}

/* ======================================================
   🔄 HEARTBEAT
====================================================== */
function startHeartbeatMonitor() {
  clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    try {
      await waitForHealth(5000);
    } catch {
      log.error("Backend unresponsive → restarting");
      await restartBackend();
    }
  }, 15000);
}

/* ======================================================
   🚀 START BACKEND
====================================================== */
async function startBackend() {
  try {
    isReady = false;
    startAttempts++;

    const entry = getBackendEntry();
    if (!fs.existsSync(entry)) throw new Error("Missing backend");

    sendSplash({ status: "Starting backend…", progress: 30 });

    backendProcess = spawn("node", [entry], {
      cwd: path.dirname(entry),
      env: {
        ...process.env,
        PORT: String(BACKEND_PORT),
        APP_DATA: app.getPath("userData"),
        ELECTRON_RUN: "true"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    backendProcess.stdout.on("data", d => {
      const msg = d.toString();
      log.info("[BACKEND]", msg);

      if (msg.includes("BACKEND_READY")) {
        isReady = true;
      }
    });

    backendProcess.stderr.on("data", d =>
      log.error("[BACKEND ERROR]", d.toString())
    );

    backendProcess.on("exit", async (code, signal) => {
      log.error(`Backend exited: ${code} ${signal}`);

      if (app.isQuitting) return;

      await new Promise(r => setTimeout(r, 2000));

      if (startAttempts < 5) {
        await restartBackend();
      } else {
        app.quit();
      }
    });

    const start = Date.now();
    while (!isReady) {
      if (Date.now() - start > 60000)
        throw new Error("Backend ready timeout");
      await new Promise(r => setTimeout(r, 300));
    }

    await waitForHealth(30000);

    startAttempts = 0;
    startHeartbeatMonitor();

    log.info("✅ Backend started");

  } catch (err) {
    log.error("Backend start failed:", err);
    app.quit();
  }
}

/* ======================================================
   🔁 RESTART BACKEND
====================================================== */
async function restartBackend() {
  clearInterval(heartbeatTimer);

  if (backendProcess) {
    backendProcess.kill("SIGTERM");
    setTimeout(() => backendProcess.kill("SIGKILL"), 5000);
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
    setTimeout(() => backendProcess.kill("SIGKILL"), 5000);
  }
}

/* ======================================================
   🧠 APP BOOT
====================================================== */
app.whenReady().then(async () => {
  buildMenu();
  createSplash();

  sendSplash({ status: "Launching SmartStock…", progress: 5 });

  if (!isDev) autoUpdater.checkForUpdates();

  await startBackend();

  sendSplash({ status: "Loading UI…", progress: 85 });

  createMainWindow();
});

/* ======================================================
   🔔 IPC
====================================================== */
ipcMain.on("install-update", () => {
  autoUpdater.quitAndInstall();
});

/* ======================================================
   🧹 CLEAN EXIT
====================================================== */
app.on("before-quit", () => {
  app.isQuitting = true;
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});