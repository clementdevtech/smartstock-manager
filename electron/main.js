const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const net = require("net");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;

let mainWindow = null;
let splashWindow = null;
let backendProcess = null;
let backendRestartTimer = null;

/* ======================================================
   🛑 SINGLE INSTANCE LOCK
====================================================== */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

/* ======================================================
   🔒 AUTO UPDATE (PRODUCTION ONLY)
====================================================== */
if (!isDev) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    console.error("❌ AutoUpdater error:", err);
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("✅ Update downloaded — will install on quit");
  });
}

/* ======================================================
   📍 BACKEND COMMAND (DEV === PROD)
====================================================== */
function getBackendCommand() {
  if (isDev) {
    return {
      cmd: "node",
      args: [path.join(__dirname, "..", "server", "server.js")]
    };
  }

  const exeName = process.platform === "win32" ? "backend.exe" : "backend";
  const exePath = path.join(process.resourcesPath, "backend", exeName);

  return {
    cmd: exePath,
    args: []
  };
}

/* ======================================================
   🔁 START / RESTART BACKEND
====================================================== */
function startBackend() {
  if (isDev) return;
  if (backendProcess) return;


  const { cmd, args } = getBackendCommand();

  if (!isDev && !fs.existsSync(cmd)) {
    console.error("❌ Backend executable missing:", cmd);
    return;
  }

  console.log("🚀 Starting backend:", cmd);

  backendProcess = spawn(cmd, args, {
    env: {
      ...process.env,
      NODE_ENV: isDev ? "development" : "production",
      PORT: "3333"
    },
    stdio: "inherit",
    windowsHide: true
  });

  backendProcess.on("error", (err) => {
    console.error("❌ Backend spawn error:", err);
  });

  backendProcess.on("exit", (code, signal) => {
    console.error(`❌ Backend exited (code=${code}, signal=${signal})`);
    backendProcess = null;

    // 🔁 Auto-restart backend (production only)
    if (!isDev) {
      clearTimeout(backendRestartTimer);
      backendRestartTimer = setTimeout(() => {
        console.log("🔁 Restarting backend...");
        startBackend();
      }, 2000);
    }
  });
}

/* ======================================================
   ⏳ WAIT FOR BACKEND TCP
====================================================== */
function waitForBackend(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    (function tryConnect() {
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
          setTimeout(tryConnect, 400);
        }
      });

      socket.connect(port, "127.0.0.1");
    })();
  });
}

/* ======================================================
   🎨 WINDOW ICON
====================================================== */
function getWindowIcon() {
  if (process.platform === "win32") {
    return path.join(__dirname, "icon.ico");
  }
  if (process.platform === "darwin") {
    return path.join(__dirname, "icon.icns");
  }
  return path.join(__dirname, "icon-1024.png");
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
    icon: getWindowIcon()
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
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  // SECURITY
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

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
    console.log("✅ Backend ready");
  } catch (err) {
    console.warn("⚠️ Backend not ready:", err.message);
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
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
