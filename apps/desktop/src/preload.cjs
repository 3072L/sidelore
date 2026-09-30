const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("sidelore", Object.freeze({
  call: (method, args = {}) => ipcRenderer.invoke("sidelore:call", method, args)
}));
