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
  splashWindow?.webContents?.send("boot-status", data);
  updateWindow?.webContents?.send("update-status", data);
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
    const indexPath = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "client",
      "dist",
      "index.html"
    );

    if (!fs.existsSync(indexPath)) {
      log.error("❌ UI build missing:", indexPath);
      app.quit();
      return;
    }

    mainWindow.loadFile(indexPath);
  }

  mainWindow.once("ready-to-show", () => {
    if (!FORCE_UPDATE) {
      splashWindow?.destroy();
      mainWindow.show();
    }
  });

  mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
    log.error("❌ UI failed to load:", code, desc);
  });
}

/* ======================================================
   🔄 UPDATE CHECK
====================================================== */
function startUpdateCheck() {
  if (isDev) return;

  clearTimeout(updateTimeout);

  updateTimeout = setTimeout(() => {
    updateState = "idle";
    buildMenu();
    sendSplash({ status: "Update timeout", progress: 0 });
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
    updateState = "checking";
    buildMenu();
    sendSplash({ status: "Checking updates…", progress: 10 });
  });

  autoUpdater.on("update-available", info => {
    updateState = "available";
    buildMenu();
    sendSplash({ status: `Update v${info.version}`, progress: 20 });
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
    sendSplash({ status: "Ready to install", progress: 100 });

    if (FORCE_UPDATE) autoUpdater.quitAndInstall();
  });

  autoUpdater.on("update-not-available", () => {
    updateState = "idle";
    buildMenu();
    sendSplash({ status: "Up to date", progress: 100 });
  });

  autoUpdater.on("error", err => {
    log.error("Updater error:", err);
    updateState = "idle";
    buildMenu();
    sendSplash({ status: "Update failed", progress: 0 });
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
  updateWindow.on("closed", () => (updateWindow = null));
}

/* ======================================================
   🔌 BACKEND ENTRY
====================================================== */
function getBackendEntry() {
  return isDev
    ? path.join(__dirname, "..", "server", "server.js")
    : path.join(
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
      http
        .get(HEALTH_URL, res => {
          if (res.statusCode === 200) return resolve();
          retry();
        })
        .on("error", retry);

      function retry() {
        if (Date.now() - start > timeout)
          return reject(new Error("Health timeout"));
        setTimeout(check, 500);
      }
    };

    check();
  });
}

/* ======================================================
   🚀 START BACKEND (FIXED)
====================================================== */
async function startBackend() {
  if (backendProcess) return;

  const entry = getBackendEntry();

  if (!fs.existsSync(entry)) {
    log.error("❌ Backend missing:", entry);
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

  backendProcess.stdout.on("data", d =>
    log.info("[BACKEND]", d.toString())
  );

  backendProcess.stderr.on("data", d =>
    log.error("[BACKEND ERROR]", d.toString())
  );

  try {
    await waitForHealth(60000);

    log.info("✅ Backend ready");

    // 🔥 CRITICAL FIX → give backend time to fully stabilize
    await new Promise(res => setTimeout(res, 1000));

  } catch (err) {
    log.error("❌ Backend failed:", err);
    app.quit();
  }
}

/* ======================================================
   🧠 APP BOOT (FIXED FLOW)
====================================================== */
app.whenReady().then(async () => {
  try {
    const currentVersion = app.getVersion();
    const savedVersion = appStore.get("version");

    if (savedVersion !== currentVersion) {
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData();

      appStore.set("version", currentVersion);
      log.info("✅ Cache cleared");
    }
  } catch (err) {
    log.error("Cache clear failed:", err);
  }

  buildMenu();
  createSplash();

  sendSplash({ status: "Launching SmartStock…", progress: 5 });

  if (!isDev) startUpdateCheck();

  await startBackend();

  sendSplash({ status: "Preparing UI…", progress: 85 });

  // 🔥 CRITICAL FIX → prevent incomplete UI render
  await new Promise(res => setTimeout(res, 800));

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