const path = require('path');

/**
 * Determine the destination path for a file based on organization scheme.
 *
 * Schemes:
 *   - "date": YYYY-MM-DD/<filename>
 *   - "year-month": YYYY/MM/<filename>
 *   - "flat": <filename> (all files in root of destination)
 */
function buildDestPath(destinationRoot, file, scheme) {
  const date = file.mtime || new Date();
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');

  let subdir;
  switch (scheme) {
    case 'date':
      subdir = `${yyyy}-${mm}-${dd}`;
      break;
    case 'year-month':
      subdir = path.join(yyyy, mm);
      break;
    case 'flat':
      subdir = '';
      break;
    default:
      subdir = `${yyyy}-${mm}-${dd}`;
  }

  return path.join(destinationRoot, subdir, file.fileName);
}

module.exports = { buildDestPath };
