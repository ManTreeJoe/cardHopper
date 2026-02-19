const { app, BrowserWindow, dialog } = require('electron');
const log = require('electron-log');
const chokidar = require('chokidar');
const { getStore, getEnabledExtensions } = require('./store');
const { createTray, setIngestProgress, setIngestComplete, clearIngest, setPaused, setActiveIcon } = require('./tray');
const { createSettingsWindow } = require('./settings-window');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createVolumeWatcher } = require('./volume/volume-watcher');
const { createIngestEngine } = require('./ingest/ingest-engine');
const { notifyIngestStart, notifyIngestComplete, notifyIngestError, notifyCardRemoved } = require('./notifications');
const fse = require('fs-extra');
const path = require('path');

log.info('CardHopper starting...');

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.info('Another instance is already running — exiting');
  app.exit(0);
}

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', () => {
  // Do nothing — keep running in tray
});

let volumeWatcher;
let ingestEngine;
const ingestQueue = [];
let isIngesting = false;
let folderWatchers = []; // chokidar watchers for watched folders

app.whenReady().then(async () => {
  const store = getStore();

  // Clean up any leftover .cardhopper-tmp files at destination
  const dest = store.get('destinationFolder');
  if (dest) {
    cleanupTempFiles(dest).catch(err => log.warn('Cleanup failed:', err.message));
  }

  // Register IPC
  registerIpcHandlers();

  // Create tray
  createTray({
    openSettings: () => createSettingsWindow(),
    togglePause: () => {
      const paused = !store.get('paused');
      store.set('paused', paused);
      setPaused(paused);
      log.info(paused ? 'Paused' : 'Resumed');

      if (!paused && ingestQueue.length > 0) {
        processQueue();
      }
    }
  });

  // Start volume watcher
  volumeWatcher = createVolumeWatcher();

  // Create ingest engine
  ingestEngine = createIngestEngine();

  // Wire volume events to ingest
  volumeWatcher.on('volume-added', (volume) => {
    log.info(`Volume added: ${volume.mountpoint} (${volume.label || 'unlabeled'})`);

    if (store.get('paused')) {
      log.info('Paused — skipping ingest');
      return;
    }

    queueVolume(volume);
  });

  volumeWatcher.on('volume-removed', (volume) => {
    log.info(`Volume removed: ${volume.mountpoint}`);

    if (ingestEngine.currentVolume &&
        ingestEngine.currentVolume.mountpoint === volume.mountpoint) {
      ingestEngine.abort();
    }

    const idx = ingestQueue.findIndex(v => v.mountpoint === volume.mountpoint);
    if (idx !== -1) ingestQueue.splice(idx, 1);
  });

  // Wire ingest engine events
  ingestEngine.on('start', ({ volumeName, fileCount }) => {
    setActiveIcon(true);
    notifyIngestStart(volumeName, fileCount);
  });

  ingestEngine.on('progress', (data) => {
    setIngestProgress(data);
  });

  ingestEngine.on('complete', (data) => {
    setActiveIcon(false);
    setIngestComplete(data);
    notifyIngestComplete(data.volumeName, data.fileCount, data.totalSize);
    isIngesting = false;
    processQueue();
  });

  ingestEngine.on('error', ({ volumeName, message }) => {
    setActiveIcon(false);
    clearIngest();
    notifyIngestError(volumeName, message);
    isIngesting = false;
    processQueue();
  });

  ingestEngine.on('aborted', ({ volumeName, copiedCount, totalCount }) => {
    setActiveIcon(false);
    clearIngest();
    notifyCardRemoved(volumeName, copiedCount, totalCount);
    isIngesting = false;
    processQueue();
  });

  volumeWatcher.start();

  // Start folder watchers
  startFolderWatchers();

  // Re-start folder watchers when settings change
  store.onDidChange('watchedFolders', () => {
    startFolderWatchers();
  });

  log.info('CardHopper ready');
});

// ── Shoot label prompt ──

async function promptForLabel(volumeName) {
  const store = getStore();
  if (!store.get('promptForLabel')) return null;

  // Show dock icon temporarily so the dialog is visible
  if (process.platform === 'darwin') app.dock.show();

  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'question',
    title: 'CardHopper — New Card Detected',
    message: `Import from "${volumeName}"`,
    detail: 'Enter a shoot name to organize this import, or leave blank for default.',
    buttons: ['Import', 'Skip'],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: 'Don\'t ask again for this session',
    // Unfortunately showMessageBox doesn't support text input,
    // so we'll use a BrowserWindow-based prompt instead
  });

  if (process.platform === 'darwin') app.dock.hide();

  if (response === 1) return '__skip__';
  return null;
}

async function showLabelPrompt(volumeName) {
  const store = getStore();
  if (!store.get('promptForLabel')) return null;

  return new Promise((resolve) => {
    // Show dock temporarily
    if (process.platform === 'darwin') app.dock.show();

    const promptWin = new BrowserWindow({
      width: 400,
      height: 200,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      title: 'CardHopper',
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true
      }
    });

    const html = `<!DOCTYPE html>
<html><head><style>
  body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #f5f0e8; padding: 24px; margin: 0; }
  h3 { margin: 0 0 4px; font-size: 15px; }
  p { margin: 0 0 16px; font-size: 12px; color: #a89f91; }
  input { width: 100%; padding: 8px 10px; border: 1px solid #2a2520; border-radius: 6px; background: #1a1a1a; color: #f5f0e8; font-size: 13px; outline: none; box-sizing: border-box; }
  input:focus { border-color: #e86c2a; }
  .btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  button { padding: 7px 18px; border-radius: 6px; font-size: 13px; cursor: pointer; border: 1px solid #2a2520; }
  .primary { background: #e86c2a; color: #fff; border-color: #e86c2a; }
  .primary:hover { background: #f28a4a; }
  .secondary { background: #1a1a1a; color: #f5f0e8; }
  .secondary:hover { background: #2a2520; }
</style></head><body>
  <h3>Card detected: ${volumeName.replace(/'/g, '&#39;')}</h3>
  <p>Enter a shoot name (optional) — used in the folder name</p>
  <input id="label" placeholder="e.g. Wedding, Beach Shoot, Product" autofocus>
  <div class="btns">
    <button class="secondary" onclick="skip()">Skip Import</button>
    <button class="primary" onclick="go()">Import</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    document.getElementById('label').addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') skip(); });
    function go() { ipcRenderer.send('label-result', document.getElementById('label').value.trim()); }
    function skip() { ipcRenderer.send('label-result', '__skip__'); }
  </script>
</body></html>`;

    promptWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    promptWin.setMenu(null);

    const { ipcMain } = require('electron');
    const handler = (_event, label) => {
      ipcMain.removeListener('label-result', handler);
      promptWin.close();
      if (process.platform === 'darwin') app.dock.hide();
      resolve(label === '__skip__' ? '__skip__' : (label || null));
    };
    ipcMain.on('label-result', handler);

    promptWin.on('closed', () => {
      ipcMain.removeListener('label-result', handler);
      if (process.platform === 'darwin') app.dock.hide();
      resolve(null);
    });
  });
}

// ── Queue + process ──

async function queueVolume(volume) {
  const store = getStore();
  const volumeName = volume.label || path.basename(volume.mountpoint);

  // Prompt for label if enabled
  let label = null;
  if (store.get('promptForLabel')) {
    label = await showLabelPrompt(volumeName);
    if (label === '__skip__') {
      log.info(`User skipped import for ${volumeName}`);
      return;
    }
  }

  ingestQueue.push({ volume, label });
  processQueue();
}

async function processQueue() {
  if (isIngesting || ingestQueue.length === 0) return;

  const store = getStore();
  if (store.get('paused')) return;

  isIngesting = true;
  const { volume, label } = ingestQueue.shift();

  try {
    await ingestEngine.ingest(volume, { label });
  } catch (err) {
    log.error(`Ingest failed for ${volume.mountpoint}:`, err);
    isIngesting = false;
    processQueue();
  }
}

// ── Folder watching ──

function startFolderWatchers() {
  // Stop existing watchers
  for (const w of folderWatchers) {
    w.close();
  }
  folderWatchers = [];

  const store = getStore();
  const folders = store.get('watchedFolders') || [];
  const extensions = getEnabledExtensions();
  const extGlobs = extensions.map(e => `**/*${e}`);

  for (const folder of folders) {
    if (!folder) continue;

    log.info(`Watching folder: ${folder}`);

    // Debounce: collect new files for 5 seconds before triggering ingest
    let debounceTimer = null;
    let newFiles = new Set();

    const watcher = chokidar.watch(extGlobs, {
      cwd: folder,
      ignoreInitial: true,
      persistent: true,
      depth: 10
    });

    watcher.on('add', (relativePath) => {
      newFiles.add(relativePath);
      log.info(`[folder-watch] New file: ${folder}/${relativePath}`);

      // Reset debounce — wait for all files to land
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const count = newFiles.size;
        newFiles = new Set();
        log.info(`[folder-watch] Triggering ingest for ${count} new files in ${folder}`);

        // Create a virtual "volume" from the watched folder
        const pseudoVolume = {
          mountpoint: folder,
          label: path.basename(folder),
          device: '',
          isRemovable: false
        };

        if (!store.get('paused')) {
          ingestQueue.push({ volume: pseudoVolume, label: null });
          processQueue();
        }
      }, 5000);
    });

    watcher.on('error', (err) => {
      log.warn(`[folder-watch] Error watching ${folder}: ${err.message}`);
    });

    folderWatchers.push(watcher);
  }
}

// ── Cleanup ──

async function cleanupTempFiles(dir) {
  try {
    const exists = await fse.pathExists(dir);
    if (!exists) return;

    const entries = await fse.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await cleanupTempFiles(fullPath);
      } else if (entry.name.endsWith('.cardhopper-tmp')) {
        log.info(`Cleaning up temp file: ${fullPath}`);
        await fse.remove(fullPath);
      }
    }
  } catch (err) {
    log.warn(`Cleanup error in ${dir}:`, err.message);
  }
}

app.on('second-instance', () => {
  createSettingsWindow();
});
