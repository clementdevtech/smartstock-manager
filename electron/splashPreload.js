const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splashAPI", {
  installUpdate: () => ipcRenderer.send("install-update")
});

ipcRenderer.on("update-ready", () => {
  window.postMessage({ type: "UPDATE_READY" }, "*");
});