const { app, BrowserWindow } = require('electron');
const log = require('electron-log');
const { getStore } = require('./store');
const { createTray, setIngestProgress, setIngestComplete, clearIngest, setPaused } = require('./tray');
const { createSettingsWindow } = require('./settings-window');
const { registerIpcHandlers } = require('./ipc-handlers');
const { createVolumeWatcher } = require('./volume/volume-watcher');
const { createIngestEngine } = require('./ingest/ingest-engine');
const { notifyIngestStart, notifyIngestComplete, notifyIngestError, notifyCardRemoved } = require('./notifications');
const { setActiveIcon } = require('./tray');
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

      // If we unpaused and there's a queue, process it
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

    ingestQueue.push(volume);
    processQueue();
  });

  volumeWatcher.on('volume-removed', (volume) => {
    log.info(`Volume removed: ${volume.mountpoint}`);

    // If currently ingesting this volume, abort
    if (ingestEngine.currentVolume &&
        ingestEngine.currentVolume.mountpoint === volume.mountpoint) {
      ingestEngine.abort();
    }

    // Remove from queue
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
  log.info('CardHopper ready');
});

async function processQueue() {
  if (isIngesting || ingestQueue.length === 0) return;

  const store = getStore();
  if (store.get('paused')) return;

  isIngesting = true;
  const volume = ingestQueue.shift();

  try {
    await ingestEngine.ingest(volume);
  } catch (err) {
    log.error(`Ingest failed for ${volume.mountpoint}:`, err);
    isIngesting = false;
    processQueue();
  }
}

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
