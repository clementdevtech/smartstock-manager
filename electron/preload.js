const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkUpdates: () => ipcRenderer.invoke("check-for-updates")
});

