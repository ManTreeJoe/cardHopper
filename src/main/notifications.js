const { Notification } = require('electron');
const { getStore } = require('./store');
const log = require('electron-log');

function notify(title, body) {
  const prefs = getStore().get('notifications');

  log.info(`Notification: ${title} — ${body}`);

  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title: `CardHopper: ${title}`,
    body,
    silent: false
  });

  notification.show();
}

function notifyIngestStart(volumeName, fileCount) {
  const prefs = getStore().get('notifications');
  if (!prefs.onStart) return;
  notify('Ingest Started', `Copying ${fileCount} file${fileCount !== 1 ? 's' : ''} from ${volumeName}`);
}

function notifyIngestComplete(volumeName, fileCount, totalSize) {
  const prefs = getStore().get('notifications');
  if (!prefs.onComplete) return;
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
  notify('Ingest Complete', `Copied ${fileCount} file${fileCount !== 1 ? 's' : ''} (${sizeMB} MB) from ${volumeName}`);
}

function notifyIngestError(volumeName, message) {
  const prefs = getStore().get('notifications');
  if (!prefs.onError) return;
  notify('Ingest Error', `${volumeName}: ${message}`);
}

function notifyCardRemoved(volumeName, copiedCount, totalCount) {
  const prefs = getStore().get('notifications');
  if (!prefs.onError) return;
  notify('Card Removed', `${volumeName} removed during copy (${copiedCount}/${totalCount} files copied)`);
}

module.exports = { notify, notifyIngestStart, notifyIngestComplete, notifyIngestError, notifyCardRemoved };
