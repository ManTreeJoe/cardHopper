const fse = require('fs-extra');
const path = require('path');
const log = require('electron-log');

/**
 * Recursively scan a directory for media files matching the given extensions.
 * Returns array of { relativePath, absolutePath, size, mtime }
 */
async function scanVolume(volumePath, extensions) {
  const results = [];
  const extSet = new Set(extensions.map(e => e.toLowerCase()));

  await walk(volumePath, volumePath, extSet, results);

  log.info(`Scanned ${volumePath}: found ${results.length} media files`);
  return results;
}

async function walk(basePath, currentPath, extSet, results) {
  let entries;
  try {
    entries = await fse.readdir(currentPath, { withFileTypes: true });
  } catch (err) {
    log.warn(`Cannot read directory ${currentPath}: ${err.message}`);
    return;
  }

  for (const entry of entries) {
    // Skip hidden files/folders and system directories
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'System Volume Information') continue;
    if (entry.name === '$RECYCLE.BIN') continue;
    if (entry.name === 'TRASH') continue;

    const fullPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await walk(basePath, fullPath, extSet, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extSet.has(ext)) {
        try {
          const stat = await fse.stat(fullPath);
          results.push({
            relativePath: path.relative(basePath, fullPath),
            absolutePath: fullPath,
            fileName: entry.name,
            size: stat.size,
            mtime: stat.mtime
          });
        } catch (err) {
          log.warn(`Cannot stat ${fullPath}: ${err.message}`);
        }
      }
    }
  }
}

module.exports = { scanVolume };
