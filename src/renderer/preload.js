const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cardhopper', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickBackupFolder: () => ipcRenderer.invoke('pick-backup-folder'),
  pickWatchedFolder: () => ipcRenderer.invoke('pick-watched-folder'),
  getStatus: () => ipcRenderer.invoke('get-status')
});
