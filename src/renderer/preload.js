const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cardhopper', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getStatus: () => ipcRenderer.invoke('get-status')
});
