const { contextBridge, ipcRenderer } = require("electron");

const listen = (channel, callback) => {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("abao", {
  openHtml: () => ipcRenderer.invoke("content:open-html"),
  openImage: () => ipcRenderer.invoke("content:open-image"),
  showWhiteboard: () => ipcRenderer.invoke("content:show-whiteboard"),
  showStage: () => ipcRenderer.invoke("stage:show"),
  toggleStage: () => ipcRenderer.invoke("stage:toggle"),
  getStageVisibility: () => ipcRenderer.invoke("stage:get-visibility"),
  sendSettings: (settings) => ipcRenderer.send("stage:settings", settings),
  beginRecording: (profile) => ipcRenderer.invoke("recording:start", profile),
  appendRecordingChunk: (id, bytes) => ipcRenderer.invoke("recording:append", { id, bytes }),
  finishRecording: (id) => ipcRenderer.invoke("recording:finish", id),
  cancelRecording: (id) => ipcRenderer.invoke("recording:cancel", id),
  openRecordingsFolder: () => ipcRenderer.invoke("recordings:open-folder"),
  onScene: (callback) => listen("controller:scene", callback),
  onDevices: (callback) => listen("controller:devices", callback),
  onStageStatus: (callback) => listen("controller:stage-status", callback),
  onStageVisibility: (callback) => listen("controller:stage-visibility", callback)
});
