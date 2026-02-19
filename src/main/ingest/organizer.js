const path = require('path');

/**
 * Determine the destination path for a file based on organization scheme.
 *
 * Schemes:
 *   - "date": YYYY-MM-DD/<filename>
 *   - "year-month": YYYY/MM/<filename>
 *   - "flat": <filename> (all files in root of destination)
 *
 * If a label is provided, it's appended to the date folder: YYYY-MM-DD_Wedding/
 *
 * If renaming is enabled, the filename is replaced based on the pattern:
 *   {date}     -> YYYY-MM-DD
 *   {year}     -> YYYY
 *   {month}    -> MM
 *   {day}      -> DD
 *   {seq}      -> sequence number (zero-padded 3 digits)
 *   {original} -> original filename without extension
 *   {label}    -> shoot label (if provided)
 */
function buildDestPath(destinationRoot, file, scheme, { label, renameEnabled, renamePattern, sequenceNum } = {}) {
  const date = file.mtime || new Date();
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const ext = path.extname(file.fileName);
  const originalBase = path.basename(file.fileName, ext);

  // Build subdirectory
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

  // Append label to folder name if provided
  if (label && label.trim()) {
    const safeLabel = label.trim().replace(/[/\\:*?"<>|]/g, '_');
    if (subdir) {
      subdir = `${subdir}_${safeLabel}`;
    } else {
      subdir = safeLabel;
    }
  }

  // Build filename
  let fileName;
  if (renameEnabled && renamePattern) {
    const seq = (sequenceNum || 1).toString().padStart(3, '0');
    fileName = renamePattern
      .replace(/\{date\}/g, `${yyyy}-${mm}-${dd}`)
      .replace(/\{year\}/g, yyyy)
      .replace(/\{month\}/g, mm)
      .replace(/\{day\}/g, dd)
      .replace(/\{seq\}/g, seq)
      .replace(/\{original\}/g, originalBase)
      .replace(/\{label\}/g, (label || '').trim().replace(/[/\\:*?"<>|]/g, '_'));
    fileName = fileName + ext;
  } else {
    fileName = file.fileName;
  }

  return path.join(destinationRoot, subdir, fileName);
}

module.exports = { buildDestPath };
