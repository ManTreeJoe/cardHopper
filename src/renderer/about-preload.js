const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aboutApi', {
  getVersion: () => ipcRenderer.invoke('about-get-version'),
  openUrl: (url) => ipcRenderer.send('about-open-url', url),
  close: () => ipcRenderer.send('about-close')
});
