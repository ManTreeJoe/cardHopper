const { BrowserWindow } = require('electron');
const path = require('path');
const log = require('electron-log');

let settingsWindow = null;

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'CardHopper Settings',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'renderer', 'preload.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // Prevent navigation
  settingsWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  log.info('Settings window created');
  return settingsWindow;
}

function getSettingsWindow() {
  return settingsWindow;
}

module.exports = { createSettingsWindow, getSettingsWindow };
