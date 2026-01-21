const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

require("dotenv").config({
  path: path.join(__dirname, "..", "server", ".env"),
});

const isDev = !app.isPackaged;

let mainWindow;
let splashWindow;
let serverProcess;

/**
 * 🔁 Start backend ONLY in production
 */
function startBackend() {
  if (isDev) return;

  const serverPath = path.join(__dirname, "..", "server", "server.js");

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, "..", "server"),
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
    stdio: "inherit",
  });

  serverProcess.on("exit", (code) => {
    console.log("Backend exited with code:", code);
  });
}

/**
 * 🪟 Splash Screen
 */
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, "icon.ico"),
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

/**
 * 🪟 Main Window
 */
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
      nodeIntegration: false,
    },
  });

  const startURL = isDev
    ? "http://localhost:5173"
    : `file://${path.join(
        __dirname,
        "..",
        "client",
        "dist",
        "index.html"
      )}`;

  mainWindow.loadURL(startURL);

  /**
   * ✅ PRIMARY HANDOFF (reliable)
   */
  mainWindow.webContents.once("did-finish-load", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }
    mainWindow.show();
  });

  /**
   * ⏱️ FAILSAFE: never stay on splash > 10s
   */
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      mainWindow.show();
    }
  }, 10000);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  startBackend();
  createSplash();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
