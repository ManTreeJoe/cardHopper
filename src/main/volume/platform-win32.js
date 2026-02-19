const { EventEmitter } = require('events');
const { exec } = require('child_process');
const log = require('electron-log');

class Win32Watcher extends EventEmitter {
  constructor() {
    super();
    this.pollInterval = null;
    this.knownDrives = new Set();
  }

  start() {
    // Initial scan
    this._poll();
    // Poll every 2 seconds
    this.pollInterval = setInterval(() => this._poll(), 2000);
    log.info('[win32] Polling removable drives via wmic');
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  _poll() {
    // DriveType=2 means removable
    exec('wmic logicaldisk where drivetype=2 get DeviceID,VolumeName /format:csv', (err, stdout) => {
      if (err) {
        // Fallback to PowerShell if wmic is unavailable
        this._pollPowerShell();
        return;
      }

      const drives = new Set();
      const lines = stdout.trim().split('\n').slice(1); // skip header

      for (const line of lines) {
        const parts = line.trim().split(',');
        if (parts.length >= 2) {
          const deviceId = parts[1]?.trim();
          if (deviceId && /^[A-Z]:$/i.test(deviceId)) {
            drives.add(deviceId + '\\');
          }
        }
      }

      this._diff(drives);
    });
  }

  _pollPowerShell() {
    exec('powershell -Command "Get-WmiObject Win32_LogicalDisk -Filter \'DriveType=2\' | Select-Object -ExpandProperty DeviceID"', (err, stdout) => {
      if (err) {
        log.warn('[win32] Failed to poll drives:', err.message);
        return;
      }

      const drives = new Set();
      for (const line of stdout.trim().split('\n')) {
        const d = line.trim();
        if (d && /^[A-Z]:$/i.test(d)) {
          drives.add(d + '\\');
        }
      }
      this._diff(drives);
    });
  }

  _diff(currentDrives) {
    // Check for new drives
    for (const d of currentDrives) {
      if (!this.knownDrives.has(d)) {
        this.emit('change', { type: 'added', path: d });
      }
    }
    // Check for removed drives
    for (const d of this.knownDrives) {
      if (!currentDrives.has(d)) {
        this.emit('change', { type: 'removed', path: d });
      }
    }
    this.knownDrives = currentDrives;
  }
}

module.exports = { Win32Watcher };
