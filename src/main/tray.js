const { Tray, BrowserWindow, nativeImage, ipcMain, screen, shell, app } = require('electron');
const path = require('path');
const log = require('electron-log');
const { getStore } = require('./store');

let tray = null;
let popoverWin = null;
let lastBlurTime = 0;

// Callbacks from main.js
let callbacks = {};

// ── State ──

const trayState = {
  appState: 'idle',        // 'idle' | 'importing'
  isPaused: false,
  import: null,            // progress data during import
  lastImport: null,        // summary after import
  activeVolume: null,      // currently importing volume name
  detectedVolumes: []      // list of detected volume names
};

// ── Create ──

function createTray({ openSettings, togglePause, cancelImport }) {
  callbacks = { openSettings, togglePause, cancelImport };

  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray-iconTemplate.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('CardHopper');

  // Click toggles popover (no native context menu)
  tray.on('click', (_event, bounds) => {
    togglePopover(bounds);
  });
  tray.on('right-click', (_event, bounds) => {
    togglePopover(bounds);
  });

  createPopoverWindow();
  registerIpc();

  log.info('Tray created with popover');
  return tray;
}

// ── Popover Window ──

function createPopoverWindow() {
  popoverWin = new BrowserWindow({
    width: 340,
    height: 440,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'renderer', 'tray-preload.js')
    }
  });

  popoverWin.loadFile(path.join(__dirname, '..', 'renderer', 'tray-menu.html'));

  // Hide on blur (click outside)
  popoverWin.on('blur', () => {
    lastBlurTime = Date.now();
    popoverWin.hide();
  });

  // Prevent navigation
  popoverWin.webContents.on('will-navigate', (e) => e.preventDefault());

  // macOS: set window level above menu bar
  if (process.platform === 'darwin') {
    popoverWin.setAlwaysOnTop(true, 'pop-up-menu');
  }
}

function togglePopover(trayBounds) {
  if (!popoverWin || popoverWin.isDestroyed()) {
    createPopoverWindow();
  }

  // If the popover was just closed by blur, don't reopen immediately
  if (Date.now() - lastBlurTime < 300) return;

  if (popoverWin.isVisible()) {
    popoverWin.hide();
  } else {
    positionPopover(trayBounds);
    sendState();
    popoverWin.show();
    popoverWin.focus();
  }
}

function positionPopover(trayBounds) {
  if (!popoverWin || popoverWin.isDestroyed()) return;

  const winBounds = popoverWin.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y
  });

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y;

  if (process.platform === 'darwin') {
    // macOS: tray is at top, window goes below
    y = trayBounds.y + trayBounds.height + 4;
  } else {
    // Windows/Linux: tray at bottom, window goes above
    y = trayBounds.y - winBounds.height - 4;
  }

  // Keep on screen horizontally
  const maxX = display.bounds.x + display.bounds.width - winBounds.width - 8;
  if (x > maxX) x = maxX;
  if (x < display.bounds.x + 8) x = display.bounds.x + 8;

  popoverWin.setPosition(x, y);
}

// ── IPC ──

function registerIpc() {
  ipcMain.handle('tray-get-state', () => {
    return { ...trayState };
  });

  ipcMain.on('tray-cancel-import', () => {
    if (callbacks.cancelImport) callbacks.cancelImport();
  });

  ipcMain.on('tray-open-settings', () => {
    popoverWin?.hide();
    if (callbacks.openSettings) callbacks.openSettings();
  });

  ipcMain.on('tray-toggle-pause', () => {
    if (callbacks.togglePause) callbacks.togglePause();
  });

  ipcMain.on('tray-open-import-folder', () => {
    popoverWin?.hide();
    const dest = getStore().get('destinationFolder');
    if (dest) shell.openPath(dest);
  });

  ipcMain.on('tray-about', () => {
    popoverWin?.hide();
    const { dialog } = require('electron');
    dialog.showMessageBox({
      type: 'info',
      title: 'About CardHopper',
      message: 'CardHopper',
      detail: `Version ${app.getVersion()}\n\nAutomatic SD card media importer.\nBuilt with Electron.\n\nCopyright \u00A9 2025`,
      buttons: ['OK']
    });
  });

  ipcMain.on('tray-quit', () => {
    app.quit();
  });

  ipcMain.on('tray-set-height', (_event, height) => {
    if (popoverWin && !popoverWin.isDestroyed()) {
      const [w] = popoverWin.getSize();
      popoverWin.setSize(w, Math.min(Math.max(height, 100), 600));
    }
  });
}

// ── Send state to popover ──

function sendState() {
  if (popoverWin && !popoverWin.isDestroyed()) {
    popoverWin.webContents.send('tray-state-update', { ...trayState });
  }
}

// ── Public API (called from main.js) ──

let lastUpdate = 0;

function setIngestProgress(data) {
  trayState.appState = 'importing';
  trayState.activeVolume = data.volumeName;
  trayState.import = {
    volumeName: data.volumeName,
    percent: data.percent || 0,
    currentFile: data.fileName,
    bytesCopied: data.totalBytesCopied,
    totalBytes: data.totalSourceSize,
    filesCopied: data.current,
    totalFiles: data.total,
    speed: data.bytesPerSec,
    eta: data.etaMs,
    skipped: data.skippedCount,
    errors: data.errorCount
  };

  // Always update menu bar title
  if (tray) {
    tray.setTitle(` ${data.percent}%`);
  }

  // Throttle popover updates to every 500ms
  const now = Date.now();
  if (now - lastUpdate > 500) {
    lastUpdate = now;
    sendState();
  }
}

function setIngestComplete(data) {
  trayState.appState = 'idle';
  trayState.import = null;
  trayState.activeVolume = null;
  trayState.lastImport = {
    volumeName: data.volumeName,
    fileCount: data.fileCount,
    totalSize: data.totalSize,
    elapsed: data.elapsed,
    skipped: data.skippedCount || 0,
    errors: data.errorCount || 0,
    avgSpeed: data.elapsed > 0 ? (data.totalSize / (data.elapsed / 1000)) : 0
  };

  if (tray) {
    tray.setTitle(' Done');
    setTimeout(() => {
      if (tray) tray.setTitle('');
    }, 5000);
  }

  sendState();
}

function clearIngest() {
  trayState.appState = 'idle';
  trayState.import = null;
  trayState.activeVolume = null;
  if (tray) tray.setTitle('');
  sendState();
}

function setPaused(paused) {
  trayState.isPaused = paused;
  sendState();
}

function addVolume(volumeName) {
  if (!trayState.detectedVolumes.includes(volumeName)) {
    trayState.detectedVolumes.push(volumeName);
    sendState();
  }
}

function removeVolume(volumeName) {
  const idx = trayState.detectedVolumes.indexOf(volumeName);
  if (idx !== -1) {
    trayState.detectedVolumes.splice(idx, 1);
    sendState();
  }
}

function setActiveIcon(active) {
  if (!tray) return;
  const iconName = active ? 'tray-activeTemplate.png' : 'tray-iconTemplate.png';
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', iconName);
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) tray.setImage(icon);
  } catch {
    // ignore missing icon
  }
}

function getTray() {
  return tray;
}

module.exports = {
  createTray,
  setIngestProgress,
  setIngestComplete,
  clearIngest,
  setPaused,
  addVolume,
  removeVolume,
  setActiveIcon,
  getTray
};
