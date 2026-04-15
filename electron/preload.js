const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isDesktop: true, // ✅ CRITICAL FLAG

  checkUpdates: () => ipcRenderer.invoke("check-for-updates"),

  installUpdate: () => ipcRenderer.send("install-update")
});