const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("abaoStage", {
  onScene: (callback) => listen("stage:scene", callback),
  onSettings: (callback) => listen("stage:settings", callback),
  reportDevices: (devices) => ipcRenderer.send("stage:devices", devices),
  reportStatus: (status) => ipcRenderer.send("stage:status", status),
  ready: () => ipcRenderer.send("stage:ready")
});
