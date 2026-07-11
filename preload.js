const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridge', {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (callback) => ipcRenderer.on('usage-state', (_event, state) => callback(state))
});
