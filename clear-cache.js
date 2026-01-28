const fs = require("fs");
const path = require("path");
const os = require("os");

// Electron-builder cache location
const cachePath = path.join(os.homedir(), "AppData", "Local", "electron-builder", "Cache");

if (fs.existsSync(cachePath)) {
  fs.rmSync(cachePath, { recursive: true, force: true });
  console.log("✅ Electron-builder cache cleared:", cachePath);
} else {
  console.log("⚠️ Electron-builder cache not found.");
}
