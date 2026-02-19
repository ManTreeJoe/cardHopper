const { EventEmitter } = require('events');
const chokidar = require('chokidar');
const log = require('electron-log');

class DarwinWatcher extends EventEmitter {
  constructor() {
    super();
    this.watcher = null;
  }

  start() {
    // Watch /Volumes for instant mount/unmount detection on macOS
    this.watcher = chokidar.watch('/Volumes', {
      depth: 0,
      ignoreInitial: true,
      persistent: true,
      // Don't follow symlinks
      followSymlinks: false
    });

    this.watcher.on('addDir', (dirPath) => {
      log.info(`[darwin] Volume appeared: ${dirPath}`);
      this.emit('change', { type: 'added', path: dirPath });
    });

    this.watcher.on('unlinkDir', (dirPath) => {
      log.info(`[darwin] Volume disappeared: ${dirPath}`);
      this.emit('change', { type: 'removed', path: dirPath });
    });

    this.watcher.on('error', (err) => {
      log.warn('[darwin] Watcher error:', err.message);
    });

    log.info('[darwin] Watching /Volumes');
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

module.exports = { DarwinWatcher };
