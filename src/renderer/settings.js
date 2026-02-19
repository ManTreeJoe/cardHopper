// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// Load settings from main process
async function loadSettings() {
  const settings = await window.cardhopper.getSettings();

  // General
  document.getElementById('destinationFolder').value = settings.destinationFolder || '';
  document.getElementById('organizationScheme').value = settings.organizationScheme || 'date';
  document.getElementById('duplicateHandling').value = settings.duplicateHandling || 'rename';
  document.getElementById('backupEnabled').checked = settings.backupEnabled || false;
  document.getElementById('backupFolder').value = settings.backupFolder || '';
  toggleSubsection('backupEnabled', 'backupSection');

  // File types
  document.getElementById('ft-images').checked = settings.fileTypes?.images ?? true;
  document.getElementById('ft-video').checked = settings.fileTypes?.video ?? true;
  document.getElementById('ft-audio').checked = settings.fileTypes?.audio ?? true;
  document.getElementById('ft-raw').checked = settings.fileTypes?.raw ?? true;

  // Import
  document.getElementById('renameEnabled').checked = settings.renameEnabled || false;
  document.getElementById('renamePattern').value = settings.renamePattern || '{date}_{seq}';
  toggleSubsection('renameEnabled', 'renameSection');
  document.getElementById('promptForLabel').checked = settings.promptForLabel || false;
  renderWatchedFolders(settings.watchedFolders || []);

  // Safety
  document.getElementById('verifyChecksums').checked = settings.verifyChecksums ?? true;
  document.getElementById('autoDelete').checked = settings.autoDelete ?? false;
  updateAutoDeleteWarning();

  // Notifications
  document.getElementById('notif-onStart').checked = settings.notifications?.onStart ?? true;
  document.getElementById('notif-onComplete').checked = settings.notifications?.onComplete ?? true;
  document.getElementById('notif-onError').checked = settings.notifications?.onError ?? true;

  // Advanced
  document.getElementById('launchAtLogin').checked = settings.launchAtLogin ?? false;
}

function toggleSubsection(checkboxId, sectionId) {
  const section = document.getElementById(sectionId);
  const checked = document.getElementById(checkboxId).checked;
  section.style.display = checked ? 'block' : 'none';
}

// Folder picker
document.getElementById('pickFolder').addEventListener('click', async () => {
  const folder = await window.cardhopper.pickFolder();
  if (folder) {
    document.getElementById('destinationFolder').value = folder;
  }
});

document.getElementById('pickBackupFolder').addEventListener('click', async () => {
  const folder = await window.cardhopper.pickBackupFolder();
  if (folder) {
    document.getElementById('backupFolder').value = folder;
  }
});

// Auto-save: General
document.getElementById('organizationScheme').addEventListener('change', (e) => {
  window.cardhopper.setSetting('organizationScheme', e.target.value);
});

document.getElementById('duplicateHandling').addEventListener('change', (e) => {
  window.cardhopper.setSetting('duplicateHandling', e.target.value);
});

document.getElementById('backupEnabled').addEventListener('change', (e) => {
  window.cardhopper.setSetting('backupEnabled', e.target.checked);
  toggleSubsection('backupEnabled', 'backupSection');
});

// Auto-save: File types
['images', 'video', 'audio', 'raw'].forEach(type => {
  document.getElementById(`ft-${type}`).addEventListener('change', async () => {
    const settings = await window.cardhopper.getSettings();
    const fileTypes = settings.fileTypes || {};
    fileTypes[type] = document.getElementById(`ft-${type}`).checked;
    window.cardhopper.setSetting('fileTypes', fileTypes);
  });
});

// Auto-save: Import
document.getElementById('renameEnabled').addEventListener('change', (e) => {
  window.cardhopper.setSetting('renameEnabled', e.target.checked);
  toggleSubsection('renameEnabled', 'renameSection');
});

document.getElementById('renamePattern').addEventListener('change', (e) => {
  window.cardhopper.setSetting('renamePattern', e.target.value);
});

document.getElementById('promptForLabel').addEventListener('change', (e) => {
  window.cardhopper.setSetting('promptForLabel', e.target.checked);
});

// Watched folders
function renderWatchedFolders(folders) {
  const list = document.getElementById('watchedFoldersList');
  list.innerHTML = '';
  folders.forEach((folder, i) => {
    const row = document.createElement('div');
    row.className = 'watched-folder-row';
    row.innerHTML = `
      <span class="watched-folder-path">${folder}</span>
      <button class="btn btn-small" data-index="${i}">Remove</button>
    `;
    row.querySelector('button').addEventListener('click', async () => {
      const settings = await window.cardhopper.getSettings();
      const wf = settings.watchedFolders || [];
      wf.splice(i, 1);
      window.cardhopper.setSetting('watchedFolders', wf);
      renderWatchedFolders(wf);
    });
    list.appendChild(row);
  });
}

document.getElementById('addWatchedFolder').addEventListener('click', async () => {
  const folder = await window.cardhopper.pickWatchedFolder();
  if (folder) {
    const settings = await window.cardhopper.getSettings();
    const wf = settings.watchedFolders || [];
    if (!wf.includes(folder)) {
      wf.push(folder);
      window.cardhopper.setSetting('watchedFolders', wf);
      renderWatchedFolders(wf);
    }
  }
});

// Auto-save: Safety
document.getElementById('verifyChecksums').addEventListener('change', (e) => {
  window.cardhopper.setSetting('verifyChecksums', e.target.checked);
});

document.getElementById('autoDelete').addEventListener('change', (e) => {
  window.cardhopper.setSetting('autoDelete', e.target.checked);
  updateAutoDeleteWarning();
});

function updateAutoDeleteWarning() {
  const warning = document.getElementById('autoDeleteWarning');
  const checked = document.getElementById('autoDelete').checked;
  warning.classList.toggle('visible', checked);
}

// Auto-save: Notifications
['onStart', 'onComplete', 'onError'].forEach(key => {
  document.getElementById(`notif-${key}`).addEventListener('change', async () => {
    const settings = await window.cardhopper.getSettings();
    const notifications = settings.notifications || {};
    notifications[key] = document.getElementById(`notif-${key}`).checked;
    window.cardhopper.setSetting('notifications', notifications);
  });
});

// Auto-save: Advanced
document.getElementById('launchAtLogin').addEventListener('change', (e) => {
  window.cardhopper.setSetting('launchAtLogin', e.target.checked);
});

// Initialize
loadSettings();
