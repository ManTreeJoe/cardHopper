const { EventEmitter } = require('events');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

// System mount paths/prefixes to always ignore
const IGNORED_MOUNTS_DARWIN = new Set([
  '/', '/System/Volumes/Data', '/System/Volumes/Preboot',
  '/System/Volumes/VM', '/System/Volumes/Update',
  '/System/Volumes/Data/home'
]);

const IGNORED_PREFIXES_DARWIN = [
  '/System/Volumes/'
];

class VolumeWatcher extends EventEmitter {
  constructor() {
    super();
    this.knownVolumes = new Map(); // mountpoint -> volume info
    this.pollTimer = null;
    this.platformWatcher = null;
  }

  start() {
    // Initial scan — also emit volume-added for any already-mounted removable volumes
    this._scan().then(volumes => {
      for (const vol of volumes) {
        this.knownVolumes.set(vol.mountpoint, vol);
        log.info(`Volume found at startup: ${vol.mountpoint}`);
        this.emit('volume-added', vol);
      }
      log.info(`Initial volumes: ${volumes.map(v => v.mountpoint).join(', ') || 'none'}`);
    });

    // Start platform-specific watcher for instant detection
    this._startPlatformWatcher();

    // Poll every 3 seconds as fallback
    this.pollTimer = setInterval(() => this._poll(), 3000);

    log.info('Volume watcher started');
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.platformWatcher) {
      this.platformWatcher.stop();
      this.platformWatcher = null;
    }
  }

  _startPlatformWatcher() {
    try {
      if (process.platform === 'darwin') {
        const { DarwinWatcher } = require('./platform-darwin');
        this.platformWatcher = new DarwinWatcher();
      } else if (process.platform === 'win32') {
        const { Win32Watcher } = require('./platform-win32');
        this.platformWatcher = new Win32Watcher();
      } else if (process.platform === 'linux') {
        const { LinuxWatcher } = require('./platform-linux');
        this.platformWatcher = new LinuxWatcher();
      }

      if (this.platformWatcher) {
        this.platformWatcher.on('change', () => {
          // Trigger an immediate re-poll on any platform change
          this._poll();
        });
        this.platformWatcher.start();
      }
    } catch (err) {
      log.warn('Platform watcher failed to start:', err.message);
    }
  }

  async _poll() {
    try {
      const current = await this._scan();
      const currentMap = new Map(current.map(v => [v.mountpoint, v]));

      // Detect additions
      for (const [mp, vol] of currentMap) {
        if (!this.knownVolumes.has(mp)) {
          log.info(`Volume added: ${mp}`);
          this.knownVolumes.set(mp, vol);
          this.emit('volume-added', vol);
        }
      }

      // Detect removals
      for (const [mp, vol] of this.knownVolumes) {
        if (!currentMap.has(mp)) {
          log.info(`Volume removed: ${mp}`);
          this.knownVolumes.delete(mp);
          this.emit('volume-removed', vol);
        }
      }
    } catch (err) {
      log.warn('Volume poll error:', err.message);
    }
  }

  async _scan() {
    if (process.platform === 'darwin') {
      return this._scanDarwin();
    } else if (process.platform === 'win32') {
      return this._scanWin32();
    } else {
      return this._scanLinux();
    }
  }

  _scanDarwin() {
    return new Promise((resolve) => {
      // Get all mounted volumes from mount command, then check each with diskutil info
      // to see if it has removable media. This catches both external drives AND
      // built-in SD card readers (which macOS reports as "internal" but "Removable Media").
      exec('mount', (err, mountOutput) => {
        if (err) return resolve([]);

        const candidates = [];
        for (const line of mountOutput.split('\n')) {
          const match = line.match(/^\/dev\/(disk\d+s?\d*)\s+on\s+(.+?)\s+\(/);
          if (!match) continue;

          const diskId = match[1];
          const mountpoint = match[2];
          if (IGNORED_MOUNTS_DARWIN.has(mountpoint)) continue;
          if (IGNORED_PREFIXES_DARWIN.some(p => mountpoint.startsWith(p))) continue;

          // Get the whole-disk identifier (disk4s1 -> disk4)
          const wholeDisk = diskId.replace(/s\d+$/, '');
          candidates.push({ diskId, wholeDisk, mountpoint });
        }

        if (candidates.length === 0) return resolve([]);

        // Check each unique whole-disk with diskutil info to find removable media
        const uniqueWholeDisks = [...new Set(candidates.map(c => c.wholeDisk))];
        let completed = 0;
        const removableDisks = new Set();

        for (const disk of uniqueWholeDisks) {
          exec(`diskutil info /dev/${disk}`, (err2, info) => {
            if (!err2 && info) {
              // Check for "Removable Media: Removable" or "Ejectable: Yes"
              const isRemovable = /Removable Media:\s*(Removable|Yes)/i.test(info);
              const isEjectable = /Ejectable:\s*Yes/i.test(info);
              // Also match SD card protocol specifically
              const isSDCard = /Protocol:\s*Secure Digital/i.test(info);

              if (isRemovable || isEjectable || isSDCard) {
                removableDisks.add(disk);
              }
            }

            completed++;
            if (completed === uniqueWholeDisks.length) {
              // Now filter candidates to only removable disks
              const volumes = candidates
                .filter(c => removableDisks.has(c.wholeDisk))
                .filter(c => {
                  const name = path.basename(c.mountpoint);
                  return name !== 'Macintosh HD' && name !== 'Macintosh HD - Data';
                })
                .map(c => ({
                  mountpoint: c.mountpoint,
                  label: path.basename(c.mountpoint),
                  device: `/dev/${c.diskId}`,
                  isRemovable: true
                }));

              resolve(volumes);
            }
          });
        }
      });
    });
  }

  _scanWin32() {
    return new Promise((resolve) => {
      exec('wmic logicaldisk where drivetype=2 get DeviceID,VolumeName /format:csv', (err, stdout) => {
        if (err) {
          // Fallback to PowerShell
          exec('powershell -Command "Get-WmiObject Win32_LogicalDisk -Filter \'DriveType=2\' | Select-Object DeviceID,VolumeName | ConvertTo-Csv -NoTypeInformation"', (err2, stdout2) => {
            if (err2) return resolve([]);
            resolve(this._parseWin32Csv(stdout2));
          });
          return;
        }
        resolve(this._parseWin32Csv(stdout));
      });
    });
  }

  _parseWin32Csv(csv) {
    const volumes = [];
    const lines = csv.trim().split('\n').slice(1); // skip header

    for (const line of lines) {
      const parts = line.trim().split(',');
      if (parts.length >= 2) {
        const deviceId = (parts[1] || '').trim();
        const volumeName = (parts[2] || '').trim();
        if (deviceId && /^[A-Z]:$/i.test(deviceId)) {
          volumes.push({
            mountpoint: deviceId + '\\',
            label: volumeName || deviceId,
            device: deviceId,
            isRemovable: true
          });
        }
      }
    }
    return volumes;
  }

  _scanLinux() {
    return new Promise((resolve) => {
      fs.readFile('/proc/mounts', 'utf8', (err, data) => {
        if (err) return resolve([]);

        const volumes = [];
        const lines = data.split('\n');

        for (const line of lines) {
          const parts = line.split(' ');
          if (parts.length < 3) continue;

          const device = parts[0];
          const mountpoint = parts[1].replace(/\\040/g, ' ');

          // Only look at common removable mount points
          if (!mountpoint.startsWith('/media/') &&
              !mountpoint.startsWith('/mnt/') &&
              !mountpoint.startsWith('/run/media/')) {
            continue;
          }

          // Skip system filesystems
          if (['tmpfs', 'devtmpfs', 'sysfs', 'proc'].includes(parts[2])) continue;

          volumes.push({
            mountpoint,
            label: path.basename(mountpoint),
            device,
            isRemovable: true
          });
        }

        resolve(volumes);
      });
    });
  }
}

function createVolumeWatcher() {
  return new VolumeWatcher();
}

module.exports = { createVolumeWatcher };
