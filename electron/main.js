const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const { autoUpdater } = require("electron-updater");

const isDev = !app.isPackaged;

let mainWindow;
let splashWindow;
let backendProcess;
let backendRestartTimer;
let backendCrashCount = 0;

/* ======================================================
   🛑 SINGLE INSTANCE LOCK
====================================================== */
if (!app.requestSingleInstanceLock()) {
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

  autoUpdater.on("error", err => {
    console.error("❌ AutoUpdater error:", err);
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("✅ Update downloaded — will install on quit");
  });
}

/* ======================================================
   🔁 PATH HELPERS
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
   🔁 START BACKEND
   Uses Electron internal Node runtime
====================================================== */
function startBackend() {
  if (backendProcess || isDev) return;

  const serverPath = getServerPath();
  const nodePath = process.execPath; // 🔥 CRITICAL FIX

  console.log("🚀 Starting backend:", serverPath);
  console.log("🟢 Using Electron Node:", nodePath);

  backendProcess = spawn(nodePath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: "3333"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  backendProcess.stdout.on("data", d =>
    console.log("[BACKEND]", d.toString().trim())
  );

  backendProcess.stderr.on("data", d =>
    console.error("[BACKEND ERROR]", d.toString().trim())
  );

  backendProcess.on("exit", code => {
    console.error("❌ Backend exited with code:", code);
    backendProcess = null;

    backendCrashCount++;

    if (backendCrashCount > 5) {
      console.error("🛑 Backend crash loop detected — stopping restart attempts.");
      return;
    }

    clearTimeout(backendRestartTimer);
    backendRestartTimer = setTimeout(startBackend, 4000);
  });
}

/* ======================================================
   ⏳ WAIT FOR BACKEND
====================================================== */
function waitForBackend(port, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1200);

      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();

        if (Date.now() - start > timeout) {
          reject(new Error("Backend timeout"));
        } else {
          setTimeout(check, 700);
        }
      });

      socket.connect(port, "127.0.0.1");
    };

    check();
  });
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
    icon: getIcon()
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

/* ======================================================
   🪟 MAIN WINDOW
====================================================== */
function createMainWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on("will-navigate", e => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  const startURL = isDev
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "..", "client", "dist", "index.html")}`;

  mainWindow.loadURL(startURL);

  mainWindow.once("ready-to-show", () => {
    splashWindow?.destroy();
    mainWindow.show();
  });

  if (isDev) mainWindow.webContents.openDevTools();
}

/* ======================================================
   🚀 APP BOOTSTRAP
====================================================== */
app.whenReady().then(async () => {
  createSplash();

  if (!isDev) {
    startBackend();
  }

  try {
    await waitForBackend(3333);
    console.log("✅ Backend ready");
    createMainWindow();
  } catch (err) {
    console.error("❌ Backend failed:", err.message);
    app.quit();
  }

  if (!isDev) autoUpdater.checkForUpdates().catch(() => {
  console.log("ℹ No updates available yet");
});

});

/* ======================================================
   🧹 CLEAN EXIT
====================================================== */
app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
