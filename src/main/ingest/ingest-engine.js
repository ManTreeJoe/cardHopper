const { EventEmitter } = require('events');
const path = require('path');
const fse = require('fs-extra');
const log = require('electron-log');
const { getStore, getEnabledExtensions } = require('../store');
const { scanVolume } = require('./file-scanner');
const { checksumFile } = require('./checksum');
const { buildDestPath } = require('./organizer');
const { resolveDuplicate } = require('./duplicate-resolver');
const { copyFile } = require('./file-copier');

class IngestEngine extends EventEmitter {
  constructor() {
    super();
    this.currentVolume = null;
    this.abortController = null;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async ingest(volume, { label } = {}) {
    const store = getStore();
    const dest = store.get('destinationFolder');
    const backupFolder = store.get('backupFolder');
    const backupEnabled = store.get('backupEnabled') && backupFolder;
    const scheme = store.get('organizationScheme');
    const autoDelete = store.get('autoDelete');
    const verifyChecksums = store.get('verifyChecksums');
    const duplicateHandling = store.get('duplicateHandling');
    const renameEnabled = store.get('renameEnabled');
    const renamePattern = store.get('renamePattern');
    const extensions = getEnabledExtensions();
    const volumeName = volume.label || path.basename(volume.mountpoint);

    this.currentVolume = volume;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    log.info(`Starting ingest: ${volume.mountpoint} -> ${dest}${backupEnabled ? ` + ${backupFolder}` : ''}`);
    if (label) log.info(`Shoot label: ${label}`);

    // Check destination exists
    try {
      await fse.ensureDir(dest);
      if (backupEnabled) await fse.ensureDir(backupFolder);
    } catch (err) {
      this.emit('error', { volumeName, message: `Cannot create destination: ${err.message}` });
      this.currentVolume = null;
      return;
    }

    // Check free space
    try {
      const stats = await fse.statfs(dest);
      const freeBytes = stats.bfree * stats.bsize;
      if (freeBytes < 100 * 1024 * 1024) {
        this.emit('error', { volumeName, message: 'Destination disk has less than 100MB free space' });
        this.currentVolume = null;
        return;
      }
    } catch {
      // statfs not available on all platforms
    }

    // Scan for media files
    let files;
    try {
      files = await scanVolume(volume.mountpoint, extensions);
    } catch (err) {
      this.emit('error', { volumeName, message: `Scan failed: ${err.message}` });
      this.currentVolume = null;
      return;
    }

    if (files.length === 0) {
      log.info(`No media files found on ${volumeName}`);
      this.emit('complete', { volumeName, fileCount: 0, totalSize: 0, skippedCount: 0, errorCount: 0, elapsed: 0 });
      this.currentVolume = null;
      return;
    }

    const totalSourceSize = files.reduce((sum, f) => sum + f.size, 0);

    this.emit('start', { volumeName, fileCount: files.length, totalSourceSize });

    // Load existing manifest for resume support
    const manifestPath = path.join(dest, '.cardhopper-manifest.json');
    let manifest = await loadManifest(manifestPath);
    let copiedCount = 0;
    let skippedCount = 0;
    let totalBytesCopied = 0;
    let errorCount = 0;
    let sequenceNum = 0;
    const startTime = Date.now();

    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) {
        this.emit('aborted', { volumeName, copiedCount, totalCount: files.length });
        this.currentVolume = null;
        await saveManifest(manifestPath, manifest);
        return;
      }

      const file = files[i];
      sequenceNum++;

      // Check if already ingested (resume support)
      // Only skip if the destination file actually exists on disk
      const manifestEntry = manifest.ingested[file.relativePath];
      if (manifestEntry?.verified && manifestEntry.destPath) {
        try {
          await fse.access(manifestEntry.destPath);
          // File exists at destination — safe to skip
          copiedCount++;
          skippedCount++;
          totalBytesCopied += file.size;
          this._emitProgress({ copiedCount, skippedCount, errorCount, total: files.length, totalBytesCopied, totalSourceSize, startTime, fileName: file.fileName, volumeName });
          continue;
        } catch {
          // Destination file missing — re-import it
          log.info(`Manifest says verified but file missing at ${manifestEntry.destPath}, re-importing`);
          delete manifest.ingested[file.relativePath];
        }
      }

      try {
        // Step 1: Checksum source
        let sourceHash = null;
        if (verifyChecksums) {
          sourceHash = await checksumFile(file.absolutePath, signal);
        }

        if (signal.aborted) break;

        // Step 2: Determine destination (with rename + label support)
        const orgOptions = { label, renameEnabled, renamePattern, sequenceNum };
        const rawDestPath = buildDestPath(dest, file, scheme, orgOptions);

        // Step 3: Resolve duplicates
        const { destPath, action } = await resolveDuplicate(
          rawDestPath, sourceHash, duplicateHandling
        );

        if (action === 'skip') {
          log.info(`Skipping duplicate: ${file.fileName}`);
          manifest.ingested[file.relativePath] = {
            destPath,
            sourceHash,
            verified: true,
            skipped: true,
            timestamp: new Date().toISOString()
          };
          copiedCount++;
          skippedCount++;
          totalBytesCopied += file.size;
          this._emitProgress({ copiedCount, skippedCount, errorCount, total: files.length, totalBytesCopied, totalSourceSize, startTime, fileName: file.fileName, volumeName });
          continue;
        }

        // Step 4: Stream-copy to primary destination
        await copyFile(file.absolutePath, destPath, { signal });

        if (signal.aborted) break;

        // Step 4b: Copy to backup destination if enabled
        let backupDestPath = null;
        if (backupEnabled) {
          backupDestPath = buildDestPath(backupFolder, file, scheme, orgOptions);
          try {
            await copyFile(file.absolutePath, backupDestPath, { signal });
          } catch (backupErr) {
            log.warn(`Backup copy failed for ${file.fileName}: ${backupErr.message}`);
            // Don't fail the whole ingest for a backup error
          }
        }

        if (signal.aborted) break;

        // Step 5: Verify checksum
        let verified = true;
        if (verifyChecksums && sourceHash) {
          let retries = 0;
          while (retries < 3) {
            const destHash = await checksumFile(destPath, signal);
            if (destHash === sourceHash) {
              break;
            }
            retries++;
            if (retries >= 3) {
              verified = false;
              log.error(`Checksum mismatch after 3 attempts: ${file.fileName}`);
              this.emit('error', { volumeName, message: `Checksum mismatch: ${file.fileName}` });
            } else {
              log.warn(`Checksum mismatch for ${file.fileName}, retry ${retries}/2`);
              await copyFile(file.absolutePath, destPath, { signal });
            }
          }
        }

        // Step 6: Delete original if enabled and verified
        if (autoDelete && verified) {
          try {
            await fse.remove(file.absolutePath);
            log.info(`Deleted original: ${file.absolutePath}`);
          } catch (err) {
            log.warn(`Failed to delete ${file.absolutePath}: ${err.message}`);
          }
        }

        // Record in manifest
        manifest.ingested[file.relativePath] = {
          destPath,
          backupDestPath,
          sourceHash,
          verified,
          deleted: autoDelete && verified,
          timestamp: new Date().toISOString()
        };

        copiedCount++;
        totalBytesCopied += file.size;

        this._emitProgress({ copiedCount, skippedCount, errorCount, total: files.length, totalBytesCopied, totalSourceSize, startTime, fileName: file.fileName, volumeName });

      } catch (err) {
        if (err.message === 'Aborted') {
          this.emit('aborted', { volumeName, copiedCount, totalCount: files.length });
          this.currentVolume = null;
          await saveManifest(manifestPath, manifest);
          return;
        }

        if (err.code === 'ENOSPC') {
          this.emit('error', { volumeName, message: 'Destination disk is full' });
          this.currentVolume = null;
          await saveManifest(manifestPath, manifest);
          return;
        }

        log.error(`Error processing ${file.fileName}:`, err);
        errorCount++;
      }
    }

    // Save final manifest
    manifest.completedAt = new Date().toISOString();
    manifest.volumeName = volumeName;
    manifest.volumeMountpoint = volume.mountpoint;
    manifest.label = label || null;
    await saveManifest(manifestPath, manifest);

    const elapsed = Date.now() - startTime;
    this.currentVolume = null;
    this.abortController = null;
    this.emit('complete', {
      volumeName,
      fileCount: copiedCount,
      totalSize: totalBytesCopied,
      skippedCount,
      errorCount,
      elapsed
    });
  }

  _emitProgress({ copiedCount, skippedCount, errorCount, total, totalBytesCopied, totalSourceSize, startTime, fileName, volumeName }) {
    const elapsed = Date.now() - startTime;
    const percent = Math.round((copiedCount / total) * 100);
    const bytesPerSec = elapsed > 0 ? (totalBytesCopied / (elapsed / 1000)) : 0;
    const bytesRemaining = totalSourceSize - totalBytesCopied;
    const etaMs = bytesPerSec > 0 ? (bytesRemaining / bytesPerSec) * 1000 : 0;

    this.emit('progress', {
      current: copiedCount,
      total,
      percent,
      fileName,
      volumeName,
      totalBytesCopied,
      totalSourceSize,
      bytesPerSec,
      elapsed,
      etaMs,
      skippedCount,
      errorCount
    });
  }
}

async function loadManifest(manifestPath) {
  try {
    const data = await fse.readJson(manifestPath);
    return { ...data, ingested: data.ingested || {} };
  } catch {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      ingested: {}
    };
  }
}

async function saveManifest(manifestPath, manifest) {
  try {
    await fse.writeJson(manifestPath, manifest, { spaces: 2 });
  } catch (err) {
    log.warn('Failed to save manifest:', err.message);
  }
}

function createIngestEngine() {
  return new IngestEngine();
}

module.exports = { createIngestEngine };
