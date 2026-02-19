const { ipcMain, dialog, app } = require('electron');
const { getStore } = require('./store');
const AutoLaunch = require('auto-launch');
const log = require('electron-log');

const autoLauncher = new AutoLaunch({
  name: 'CardHopper',
  path: app.getPath('exe')
});

function registerIpcHandlers() {
  const store = getStore();

  ipcMain.handle('get-settings', () => {
    return store.store;
  });

  ipcMain.handle('set-setting', async (_event, key, value) => {
    store.set(key, value);
    log.info(`Setting changed: ${key} = ${JSON.stringify(value)}`);

    if (key === 'launchAtLogin') {
      try {
        if (value) {
          await autoLauncher.enable();
        } else {
          await autoLauncher.disable();
        }
      } catch (err) {
        log.warn('Auto-launch toggle failed:', err.message);
      }
    }

    return true;
  });

  ipcMain.handle('pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Destination Folder'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    store.set('destinationFolder', folder);
    return folder;
  });

  ipcMain.handle('pick-backup-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Backup Folder'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0];
    store.set('backupFolder', folder);
    return folder;
  });

  ipcMain.handle('pick-watched-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose Folder to Watch'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('get-status', () => {
    return { status: 'idle', message: 'Waiting for card' };
  });

  log.info('IPC handlers registered');
}

module.exports = { registerIpcHandlers };
