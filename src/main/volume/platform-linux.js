const { EventEmitter } = require('events');
const fs = require('fs');
const log = require('electron-log');

class LinuxWatcher extends EventEmitter {
  constructor() {
    super();
    this.fsWatcher = null;
    this.debounceTimer = null;
  }

  start() {
    try {
      // Watch /proc/mounts for changes
      this.fsWatcher = fs.watch('/proc/mounts', () => {
        // Debounce — /proc/mounts can fire multiple times per mount event
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.emit('change', { type: 'rescan' });
        }, 500);
      });

      log.info('[linux] Watching /proc/mounts');
    } catch (err) {
      log.warn('[linux] Cannot watch /proc/mounts:', err.message);
      // Fallback: just rely on polling in volume-watcher.js
    }
  }

  stop() {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

module.exports = { LinuxWatcher };
