const { app, BrowserWindow, ipcMain, Menu, session } = require("electron");
const path = require("path");
const http = require("http");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { spawn } = require("child_process");
const fs = require("fs-extra");
const Store = require("electron-store").default;

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
let updateWindow;

let isReady = false;
let startAttempts = 0;

let updateState = "idle";
let downloadProgress = 0;
let updateTimeout;

app.isQuitting = false;

/* ======================================================
   🪵 LOGGER
====================================================== */
log.transports.file.level = "info";
autoUpdater.logger = log;

/* ======================================================
   💾 STORE
====================================================== */
const appStore = new Store();

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
      startUpdateCheck();
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

  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send("update-status", data);
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
      sandbox: true,
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
}

/* ======================================================
   🔄 UPDATE CHECK
====================================================== */
function startUpdateCheck() {
  if (isDev) {
    log.info("Skipping updates (dev mode)");
    return;
  }

  clearTimeout(updateTimeout);

  updateTimeout = setTimeout(() => {
    log.error("Update check timeout");

    updateState = "idle";
    buildMenu();

    sendSplash({
      status: "Update check timed out",
      progress: 0
    });
  }, 15000);

  autoUpdater.checkForUpdates();
}

/* ======================================================
   🔒 AUTO UPDATER
====================================================== */
if (!isDev) {
  autoUpdater.channel = UPDATE_CHANNEL;
  autoUpdater.autoDownload = false;

  autoUpdater.on("checking-for-update", () => {
    clearTimeout(updateTimeout);

    updateState = "checking";
    buildMenu();

    log.info("Checking for updates...");
    sendSplash({ status: "Checking for updates…", progress: 10 });
  });

  autoUpdater.on("update-available", info => {
    clearTimeout(updateTimeout);

    updateState = "available";
    buildMenu();

    log.info("Update available:", info.version);

    sendSplash({
      status: `Update found v${info.version}`,
      progress: 20
    });

    autoUpdater.downloadUpdate();
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

    log.info("Update downloaded");

    sendSplash({
      status: "Update ready to install",
      progress: 100
    });

    if (FORCE_UPDATE) autoUpdater.quitAndInstall();
  });

  autoUpdater.on("update-not-available", () => {
    clearTimeout(updateTimeout);

    log.info("No updates available");

    updateState = "idle";
    buildMenu();

    sendSplash({
      status: "You're up to date",
      progress: 100
    });
  });

  autoUpdater.on("error", err => {
    clearTimeout(updateTimeout);

    log.error("Updater error:", err);

    updateState = "idle";
    buildMenu();

    sendSplash({
      status: "Update failed",
      progress: 0
    });
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
function waitForHealth(timeout = 60000) {
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
        else setTimeout(check, 500);
      }
    };

    check();
  });
}

/* ======================================================
   🚀 START BACKEND (FINAL)
====================================================== */
async function startBackend() {
  if (backendProcess) {
    log.warn("Backend already running");
    return;
  }

  startAttempts++;

  const entry = getBackendEntry();
  if (!fs.existsSync(entry)) {
    log.error("Missing backend:", entry);
    app.quit();
    return;
  }

  sendSplash({ status: "Starting backend…", progress: 30 });

  backendProcess = spawn("node", [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      APP_DATA: app.getPath("userData"),
      ELECTRON_RUN: "true"
    }
  });

  backendProcess.stdout.on("data", d => {
    const msg = d.toString();
    log.info("[BACKEND]", msg);

    if (msg.includes("BACKEND_READY")) isReady = true;
  });

  backendProcess.stderr.on("data", d =>
    log.error("[BACKEND ERROR]", d.toString())
  );

  try {
    await Promise.race([
      waitForHealth(60000),
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Signal timeout")), 60000);

        backendProcess.stdout.on("data", d => {
          if (d.toString().includes("BACKEND_READY")) {
            clearTimeout(t);
            resolve();
          }
        });
      })
    ]);

    log.info("✅ Backend ready");
  } catch (err) {
    log.error("Backend failed:", err);
    app.quit();
  }
}

/* ======================================================
   🧠 APP BOOT
====================================================== */
app.whenReady().then(async () => {
  try {
    const currentVersion = app.getVersion();
    const savedVersion = appStore.get("version");

    if (savedVersion !== currentVersion) {
      if (session?.defaultSession) {
        await session.defaultSession.clearCache();
        await session.defaultSession.clearStorageData();
      }

      appStore.set("version", currentVersion);
      log.info("✅ Cache cleared after update");
    }
  } catch (err) {
    log.error("Cache clear failed:", err);
  }

  buildMenu();
  createSplash();

  sendSplash({ status: "Launching SmartStock…", progress: 5 });

  if (!isDev) startUpdateCheck();

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
  backendProcess?.kill("SIGTERM");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});