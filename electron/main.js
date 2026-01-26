const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;

/* ======================================================
   🛑 SINGLE INSTANCE LOCK (prevents multi-launch bug)
====================================================== */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/* ======================================================
   🔒 AUTO UPDATE (silent, production only)
====================================================== */
if (!isDev) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.error("AutoUpdater error:", err);
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("Update downloaded — will install on quit");
  });
}

/* ======================================================
   📍 BACKEND PATH (asar-safe)
====================================================== */
function getServerPath() {
  if (isDev) {
    return path.join(__dirname, "..", "server", "server.js");
  }

  return path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "server",
    "server.js"
  );
}

/* ======================================================
   🔁 START BACKEND (production only)
====================================================== */
function startBackend() {
  if (isDev) return;

  const serverPath = getServerPath();

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "3333" // SINGLE SOURCE OF TRUTH
    },
    stdio: "ignore",
    windowsHide: true
  });

  serverProcess.on("exit", (code) => {
    console.log("Backend exited with code:", code);
  });
}

/* ======================================================
   🔍 WAIT FOR BACKEND TCP
====================================================== */
function waitForBackend(port, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);

      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error("Backend timeout"));
        } else {
          setTimeout(tryConnect, 300);
        }
      });

      socket.connect(port, "127.0.0.1");
    };

    tryConnect();
  });
}

/* ======================================================
   🪟 SPLASH WINDOW
====================================================== */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, "icon.ico")
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

/* ======================================================
   🪟 MAIN WINDOW
====================================================== */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  // SECURITY: block navigation
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  mainWindow.webContents.on("new-window", (e) => e.preventDefault());

  const startURL = isDev
    ? "http://localhost:5173"
    : `file://${path.join(
        process.resourcesPath,
        "app.asar",
        "client",
        "dist",
        "index.html"
      )}`;

  mainWindow.loadURL(startURL);

  mainWindow.once("ready-to-show", () => {
    splashWindow?.destroy();
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

/* ======================================================
   🚀 APP BOOT
====================================================== */
app.whenReady().then(async () => {
  createSplash();
  startBackend();

  try {
    await waitForBackend(3333);
  } catch {
    console.warn("Backend not ready — continuing UI load");
  }

  createMainWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

/* ======================================================
   🧹 CLEAN EXIT
====================================================== */
app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
