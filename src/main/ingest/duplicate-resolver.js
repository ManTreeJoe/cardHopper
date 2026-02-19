const path = require('path');
const fse = require('fs-extra');
const { checksumFile } = require('./checksum');

/**
 * Resolve a destination path considering duplicates.
 *
 * Modes:
 *   - "rename": append _1, _2, etc. to avoid collision
 *   - "skip": return null if file already exists with same checksum
 *   - "overwrite": return path as-is (overwrite existing)
 *
 * Returns { destPath, action } where action is 'copy', 'skip', or 'overwrite'
 */
async function resolveDuplicate(destPath, sourceChecksum, mode) {
  const exists = await fse.pathExists(destPath);

  if (!exists) {
    return { destPath, action: 'copy' };
  }

  if (mode === 'overwrite') {
    return { destPath, action: 'overwrite' };
  }

  // Check if existing file has same checksum (true duplicate)
  try {
    const existingChecksum = await checksumFile(destPath);
    if (existingChecksum === sourceChecksum) {
      return { destPath, action: 'skip' };
    }
  } catch {
    // Can't read existing file — treat as name collision
  }

  if (mode === 'skip') {
    // Different content but skip mode — still need to rename to avoid data loss
    return renameWithSuffix(destPath);
  }

  // Default: rename mode
  return renameWithSuffix(destPath);
}

async function renameWithSuffix(destPath) {
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);

  let counter = 1;
  let candidate;
  do {
    candidate = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  } while (await fse.pathExists(candidate));

  return { destPath: candidate, action: 'copy' };
}

module.exports = { resolveDuplicate };
