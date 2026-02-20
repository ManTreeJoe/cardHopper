const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayApi', {
  getState: () => ipcRenderer.invoke('tray-get-state'),
  cancelImport: () => ipcRenderer.send('tray-cancel-import'),
  openSettings: () => ipcRenderer.send('tray-open-settings'),
  togglePause: () => ipcRenderer.send('tray-toggle-pause'),
  openImportFolder: () => ipcRenderer.send('tray-open-import-folder'),
  about: () => ipcRenderer.send('tray-about'),
  quit: () => ipcRenderer.send('tray-quit'),
  setHeight: (h) => ipcRenderer.send('tray-set-height', h),
  onStateUpdate: (callback) => {
    ipcRenderer.on('tray-state-update', (_event, state) => callback(state));
  }
});
