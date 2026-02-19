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

  // File types
  document.getElementById('ft-images').checked = settings.fileTypes?.images ?? true;
  document.getElementById('ft-video').checked = settings.fileTypes?.video ?? true;
  document.getElementById('ft-audio').checked = settings.fileTypes?.audio ?? true;
  document.getElementById('ft-raw').checked = settings.fileTypes?.raw ?? true;

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

// Folder picker
document.getElementById('pickFolder').addEventListener('click', async () => {
  const folder = await window.cardhopper.pickFolder();
  if (folder) {
    document.getElementById('destinationFolder').value = folder;
  }
});

// Auto-save on change: General
document.getElementById('organizationScheme').addEventListener('change', (e) => {
  window.cardhopper.setSetting('organizationScheme', e.target.value);
});

document.getElementById('duplicateHandling').addEventListener('change', (e) => {
  window.cardhopper.setSetting('duplicateHandling', e.target.value);
});

// Auto-save on change: File types
['images', 'video', 'audio', 'raw'].forEach(type => {
  document.getElementById(`ft-${type}`).addEventListener('change', async () => {
    const settings = await window.cardhopper.getSettings();
    const fileTypes = settings.fileTypes || {};
    fileTypes[type] = document.getElementById(`ft-${type}`).checked;
    window.cardhopper.setSetting('fileTypes', fileTypes);
  });
});

// Auto-save on change: Safety
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

// Auto-save on change: Notifications
['onStart', 'onComplete', 'onError'].forEach(key => {
  document.getElementById(`notif-${key}`).addEventListener('change', async () => {
    const settings = await window.cardhopper.getSettings();
    const notifications = settings.notifications || {};
    notifications[key] = document.getElementById(`notif-${key}`).checked;
    window.cardhopper.setSetting('notifications', notifications);
  });
});

// Auto-save on change: Advanced
document.getElementById('launchAtLogin').addEventListener('change', (e) => {
  window.cardhopper.setSetting('launchAtLogin', e.target.checked);
});

// Initialize
loadSettings();
