const api = window.trayApi;

// DOM refs
const appStatus = document.getElementById('appStatus');
const importSection = document.getElementById('importSection');
const idleSection = document.getElementById('idleSection');
const lastImportSection = document.getElementById('lastImportSection');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const currentFile = document.getElementById('currentFile');
const sizeProgress = document.getElementById('sizeProgress');
const fileProgress = document.getElementById('fileProgress');
const cancelBtn = document.getElementById('cancelBtn');
const volumeSection = document.getElementById('volumeSection');
const volumeDivider = document.getElementById('volumeDivider');
const volumeDot = document.getElementById('volumeDot');
const volumeName = document.getElementById('volumeName');
const volumeStatus = document.getElementById('volumeStatus');
const lastVolumeName = document.getElementById('lastVolumeName');
const lastImportStats = document.getElementById('lastImportStats');
const openFolderBtn = document.getElementById('openFolderBtn');
const pauseBtn = document.getElementById('pauseBtn');
const pauseLabel = document.getElementById('pauseLabel');
const pauseIcon = document.getElementById('pauseIcon');

// Buttons
cancelBtn.addEventListener('click', () => api.cancelImport());
document.getElementById('settingsBtn').addEventListener('click', () => api.openSettings());
pauseBtn.addEventListener('click', () => api.togglePause());
document.getElementById('aboutBtn').addEventListener('click', () => api.about());
openFolderBtn.addEventListener('click', () => api.openImportFolder());
document.getElementById('quitBtn').addEventListener('click', () => api.quit());

// Format helpers
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

// Render state
function render(state) {
  if (!state) return;

  // Status text
  if (state.appState === 'importing') {
    appStatus.textContent = 'Importing...';
    appStatus.className = 'app-status importing';
  } else if (state.isPaused) {
    appStatus.textContent = 'Paused';
    appStatus.className = 'app-status paused';
  } else {
    appStatus.textContent = 'Ready';
    appStatus.className = 'app-status';
  }

  // Pause button
  if (state.isPaused) {
    pauseLabel.textContent = 'Resume';
    pauseIcon.innerHTML = '<path d="M4 2l10 6-10 6V2z" />';
  } else {
    pauseLabel.textContent = 'Pause';
    pauseIcon.innerHTML = '<path d="M5.5 3.5A1.5 1.5 0 017 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5zm5 0A1.5 1.5 0 0112 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5z"/>';
  }

  // Sections visibility
  const isImporting = state.appState === 'importing' && state.import;
  const hasLastImport = state.lastImport && state.appState !== 'importing';
  const isIdle = !isImporting && !hasLastImport;

  importSection.classList.toggle('hidden', !isImporting);
  lastImportSection.classList.toggle('hidden', !hasLastImport);
  idleSection.classList.toggle('hidden', !isIdle);

  // Import progress
  if (isImporting) {
    const imp = state.import;
    progressFill.style.width = `${imp.percent}%`;
    progressPct.textContent = `${imp.percent}%`;
    currentFile.textContent = imp.currentFile || '—';
    sizeProgress.textContent = `${formatBytes(imp.bytesCopied)} / ${formatBytes(imp.totalBytes)}`;
    fileProgress.textContent = `${imp.filesCopied}/${imp.totalFiles} files`;
  }

  // Last import
  if (hasLastImport) {
    const li = state.lastImport;
    lastVolumeName.textContent = `Last import: ${li.volumeName}`;
    let statsHtml = `${li.fileCount} files &middot; ${formatBytes(li.totalSize)}`;
    if (li.elapsed > 0) statsHtml += `<br>Duration: ${formatDuration(li.elapsed)}`;
    if (li.avgSpeed > 0) statsHtml += ` &middot; ${formatSpeed(li.avgSpeed)}`;
    if (li.skipped > 0) statsHtml += `<br>Skipped: ${li.skipped} duplicates`;
    if (li.errors > 0) statsHtml += `<br>Errors: ${li.errors}`;
    lastImportStats.innerHTML = statsHtml;
  }

  // Volume indicator
  const hasVolume = state.activeVolume || (state.detectedVolumes && state.detectedVolumes.length > 0);
  volumeSection.classList.toggle('hidden', !hasVolume);
  volumeDivider.classList.toggle('hidden', !hasVolume);

  if (hasVolume) {
    const vName = state.activeVolume || state.detectedVolumes[0];
    volumeName.textContent = vName;

    if (isImporting) {
      volumeDot.className = 'volume-dot';
      volumeStatus.textContent = 'Importing...';
      volumeStatus.className = 'volume-status';
    } else {
      volumeDot.className = 'volume-dot idle';
      volumeStatus.textContent = 'Connected';
      volumeStatus.className = 'volume-status idle';
    }
  }

  // Idle text
  if (isIdle) {
    const idleText = idleSection.querySelector('.idle-text');
    if (state.isPaused) {
      idleText.textContent = 'Paused — imports on hold';
    } else if (hasVolume) {
      idleText.textContent = 'Ready';
    } else {
      idleText.textContent = 'Waiting for card...';
    }
  }

  // Resize window to fit content
  requestAnimationFrame(() => {
    const h = document.querySelector('.popover').offsetHeight + 12;
    api.setHeight(h);
  });
}

// Initial state
api.getState().then(render);

// Live updates
api.onStateUpdate(render);
