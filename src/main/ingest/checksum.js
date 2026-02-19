const crypto = require('crypto');
const fs = require('fs');

/**
 * Compute SHA-256 hash of a file using streaming (1MB chunks).
 * Returns hex digest string.
 * Supports an AbortSignal for cancellation.
 */
function checksumFile(filePath, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Aborted'));
    }

    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks

    const onAbort = () => {
      stream.destroy();
      reject(new Error('Aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve(hash.digest('hex'));
    });

    stream.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(err);
    });
  });
}

module.exports = { checksumFile };
