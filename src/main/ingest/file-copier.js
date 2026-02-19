const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const log = require('electron-log');

/**
 * Stream-copy a file to destination using a .cardhopper-tmp temp file.
 * Reports progress via onProgress(bytesCopied).
 * On success, renames temp to final destination.
 * On abort/error, cleans up the temp file.
 *
 * Returns the final file path.
 */
async function copyFile(sourcePath, destPath, { signal, onProgress } = {}) {
  const destDir = path.dirname(destPath);
  await fse.ensureDir(destDir);

  const tmpPath = destPath + '.cardhopper-tmp';

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Aborted'));
    }

    const readStream = fs.createReadStream(sourcePath, { highWaterMark: 1024 * 1024 });
    const writeStream = fs.createWriteStream(tmpPath);

    let bytesCopied = 0;
    let aborted = false;

    const cleanup = async () => {
      if (!aborted) {
        aborted = true;
        readStream.destroy();
        writeStream.destroy();
        // Remove temp file
        try {
          await fse.remove(tmpPath);
        } catch {
          // best effort
        }
      }
    };

    const onAbort = () => {
      cleanup().then(() => reject(new Error('Aborted')));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    readStream.on('data', (chunk) => {
      bytesCopied += chunk.length;
      if (onProgress) onProgress(bytesCopied);
    });

    readStream.pipe(writeStream);

    writeStream.on('finish', async () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (aborted) return;

      try {
        // Rename temp file to final destination
        await fse.rename(tmpPath, destPath);
        resolve(destPath);
      } catch (err) {
        await cleanup();
        reject(err);
      }
    });

    writeStream.on('error', async (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      await cleanup();
      reject(err);
    });

    readStream.on('error', async (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      await cleanup();
      reject(err);
    });
  });
}

module.exports = { copyFile };
