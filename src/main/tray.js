const { Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const log = require('electron-log');
const { getStore } = require('./store');

let tray = null;
let isPaused = false;
let onOpenSettings = null;
let onTogglePause = null;

// Current ingest state
let ingestState = null;   // null = idle, object = active ingest
let lastImport = null;    // summary of last completed import

function createTray({ openSettings, togglePause }) {
  onOpenSettings = openSettings;
  onTogglePause = togglePause;

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
  updateMenu();

  log.info('Tray created');
  return tray;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  if (min < 60) return `${min}m ${remainSec}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
}

function formatSpeed(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

function updateMenu() {
  if (!tray) return;

  const template = [
    { label: 'CardHopper', type: 'normal', enabled: false }
  ];

  if (ingestState) {
    // ── Active ingest stats ──
    template.push({ type: 'separator' });
    template.push({ label: `Importing from ${ingestState.volumeName}`, type: 'normal', enabled: false });
    template.push({ type: 'separator' });

    const pct = ingestState.percent || 0;
    const bar = buildProgressBar(pct);
    template.push({ label: `${bar}  ${pct}%`, type: 'normal', enabled: false });
    template.push({ label: `Files: ${ingestState.current} / ${ingestState.total}`, type: 'normal', enabled: false });
    template.push({ label: `Size: ${formatBytes(ingestState.totalBytesCopied)} / ${formatBytes(ingestState.totalSourceSize)}`, type: 'normal', enabled: false });

    if (ingestState.bytesPerSec > 0) {
      template.push({ label: `Speed: ${formatSpeed(ingestState.bytesPerSec)}`, type: 'normal', enabled: false });
    }
    if (ingestState.etaMs > 0) {
      template.push({ label: `Time left: ~${formatDuration(ingestState.etaMs)}`, type: 'normal', enabled: false });
    }
    if (ingestState.skippedCount > 0) {
      template.push({ label: `Skipped: ${ingestState.skippedCount} (already imported)`, type: 'normal', enabled: false });
    }
    if (ingestState.errorCount > 0) {
      template.push({ label: `Errors: ${ingestState.errorCount}`, type: 'normal', enabled: false });
    }

    template.push({ label: `Current: ${ingestState.fileName}`, type: 'normal', enabled: false });
  } else if (lastImport) {
    // ── Last import summary ──
    template.push({ type: 'separator' });
    template.push({ label: 'Last Import', type: 'normal', enabled: false });
    template.push({ type: 'separator' });
    template.push({ label: `Card: ${lastImport.volumeName}`, type: 'normal', enabled: false });
    template.push({ label: `Files: ${lastImport.fileCount} copied`, type: 'normal', enabled: false });
    template.push({ label: `Size: ${formatBytes(lastImport.totalSize)}`, type: 'normal', enabled: false });
    template.push({ label: `Duration: ${formatDuration(lastImport.elapsed)}`, type: 'normal', enabled: false });

    if (lastImport.skippedCount > 0) {
      template.push({ label: `Skipped: ${lastImport.skippedCount} duplicates`, type: 'normal', enabled: false });
    }
    if (lastImport.errorCount > 0) {
      template.push({ label: `Errors: ${lastImport.errorCount}`, type: 'normal', enabled: false });
    }
    if (lastImport.avgSpeed) {
      template.push({ label: `Avg speed: ${formatSpeed(lastImport.avgSpeed)}`, type: 'normal', enabled: false });
    }

    // Open destination folder
    template.push({ type: 'separator' });
    template.push({
      label: 'Open Import Folder',
      type: 'normal',
      click: () => {
        const dest = getStore().get('destinationFolder');
        if (dest) shell.openPath(dest);
      }
    });
  } else {
    // ── Idle ──
    template.push({ type: 'separator' });
    template.push({ label: isPaused ? 'Paused' : 'Idle — waiting for card', type: 'normal', enabled: false });
  }

  template.push({ type: 'separator' });
  template.push({
    label: 'Open Settings...',
    type: 'normal',
    click: () => onOpenSettings && onOpenSettings()
  });
  template.push({
    label: isPaused ? 'Resume' : 'Pause',
    type: 'normal',
    click: () => onTogglePause && onTogglePause()
  });
  template.push({ type: 'separator' });
  template.push({
    label: 'Quit CardHopper',
    type: 'normal',
    click: () => {
      const { app } = require('electron');
      app.quit();
    }
  });

  const menu = Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);
}

function buildProgressBar(percent) {
  const filled = Math.round(percent / 5);
  const empty = 20 - filled;
  return '\u25A0'.repeat(filled) + '\u25A1'.repeat(empty);
}

let lastMenuUpdate = 0;

function setIngestProgress(data) {
  ingestState = data;

  // Always update the menu bar title (lightweight)
  if (tray) {
    tray.setTitle(` ${data.percent}%`);
  }

  // Throttle context menu rebuilds to every 2 seconds
  const now = Date.now();
  if (now - lastMenuUpdate > 2000) {
    lastMenuUpdate = now;
    updateMenu();
  }
}

function setIngestComplete(data) {
  ingestState = null;
  lastImport = {
    volumeName: data.volumeName,
    fileCount: data.fileCount,
    totalSize: data.totalSize,
    elapsed: data.elapsed,
    skippedCount: data.skippedCount || 0,
    errorCount: data.errorCount || 0,
    avgSpeed: data.elapsed > 0 ? (data.totalSize / (data.elapsed / 1000)) : 0
  };
  // Clear the menu bar title, show checkmark briefly
  if (tray) {
    tray.setTitle(' Done');
    setTimeout(() => {
      if (tray) tray.setTitle('');
    }, 5000);
  }
  updateMenu();
}

function clearIngest() {
  ingestState = null;
  if (tray) tray.setTitle('');
  updateMenu();
}

function setPaused(paused) {
  isPaused = paused;
  updateMenu();
}

function setActiveIcon(active) {
  if (!tray) return;
  const iconName = active ? 'tray-activeTemplate.png' : 'tray-iconTemplate.png';
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', iconName);
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      tray.setImage(icon);
    }
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
  setActiveIcon,
  getTray,
  updateMenu
};
