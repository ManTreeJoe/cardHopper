const path = require('path');
const fse = require('fs-extra');
const { getExtensionCategory } = require('../store');

/**
 * Determine the destination path for a file based on organization scheme.
 *
 * Schemes:
 *   - "date-type": YYYY-MM-DD/Photos/ (default)
 *   - "date":      YYYY-MM-DD/
 *   - "year-month": YYYY/MM/
 *   - "flat":      all files in destination root
 *   - "custom":    user-defined template using tokens
 *
 * Options:
 *   label             - shoot label string
 *   renameEnabled     - rename files on import
 *   renamePattern     - filename template
 *   sequenceNum       - current file sequence number
 *   typeFolderNames   - { images, video, audio, raw } folder name overrides
 *   customTemplate    - template string for 'custom' scheme
 *   sessionCache      - Map<string, string> shared across a single ingest session;
 *                       ensures all files go to the same session folder even if
 *                       the date folder already existed from a prior import
 *
 * Template tokens: {date} {year} {month} {day} {type} {label}
 * Rename tokens:   {date} {year} {month} {day} {seq} {original} {label}
 */
async function buildDestPath(destinationRoot, file, scheme, options = {}) {
  const {
    label,
    renameEnabled,
    renamePattern,
    sequenceNum,
    typeFolderNames,
    customTemplate,
    sessionCache
  } = options;

  const fileDate = file.mtime || new Date();
  const yyyy = fileDate.getFullYear().toString();
  const mm = (fileDate.getMonth() + 1).toString().padStart(2, '0');
  const dd = fileDate.getDate().toString().padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const ext = path.extname(file.fileName);
  const originalBase = path.basename(file.fileName, ext);
  const safeLabel = label?.trim() ? label.trim().replace(/[/\\:*?"<>|]/g, '_') : '';

  // Resolve the type subfolder name for this file
  const category = getExtensionCategory(ext);
  const folderNames = Object.assign(
    { images: 'Photos', video: 'Video', audio: 'Audio', raw: 'RAW' },
    typeFolderNames
  );
  const typeName = category ? (folderNames[category] || 'Other') : 'Other';

  // Build top-level folder and optional type subfolder
  let topFolder = '';
  let typeFolder = '';

  switch (scheme) {
    case 'date-type':
      topFolder = safeLabel ? `${dateStr}_${safeLabel}` : dateStr;
      typeFolder = typeName;
      break;

    case 'date':
      topFolder = safeLabel ? `${dateStr}_${safeLabel}` : dateStr;
      break;

    case 'year-month':
      topFolder = path.join(yyyy, mm);
      break;

    case 'flat':
      break;

    case 'custom': {
      const template = customTemplate || '{date}/{type}';
      topFolder = template
        .replace(/\{date\}/g, dateStr)
        .replace(/\{year\}/g, yyyy)
        .replace(/\{month\}/g, mm)
        .replace(/\{day\}/g, dd)
        .replace(/\{type\}/g, typeName)
        .replace(/\{label\}/g, safeLabel);
      break;
    }

    default:
      topFolder = safeLabel ? `${dateStr}_${safeLabel}` : dateStr;
      typeFolder = typeName;
  }

  // Session folder: for date and date-type schemes, if the top folder already
  // has content from a prior import, use a suffixed folder (_2, _3...) for this
  // entire session. The cache ensures all files in one session share the same folder.
  if (sessionCache && topFolder && (scheme === 'date-type' || scheme === 'date')) {
    const cacheKey = topFolder;
    if (!sessionCache.has(cacheKey)) {
      sessionCache.set(cacheKey, await resolveSessionFolder(destinationRoot, topFolder));
    }
    topFolder = sessionCache.get(cacheKey);
  }

  // Build filename
  let fileName;
  if (renameEnabled && renamePattern) {
    const seq = (sequenceNum || 1).toString().padStart(3, '0');
    fileName = renamePattern
      .replace(/\{date\}/g, dateStr)
      .replace(/\{year\}/g, yyyy)
      .replace(/\{month\}/g, mm)
      .replace(/\{day\}/g, dd)
      .replace(/\{seq\}/g, seq)
      .replace(/\{original\}/g, originalBase)
      .replace(/\{label\}/g, safeLabel);
    fileName = fileName + ext;
  } else {
    fileName = file.fileName;
  }

  const parts = [destinationRoot, topFolder, typeFolder, fileName].filter(Boolean);
  return path.join(...parts);
}

/**
 * Find an available session folder name. If baseName already exists and has
 * content, tries baseName_2, baseName_3, etc. until it finds a free slot.
 */
async function resolveSessionFolder(destinationRoot, baseName) {
  let candidate = baseName;
  let counter = 2;

  while (true) { // eslint-disable-line no-constant-condition
    const fullPath = path.join(destinationRoot, candidate);
    if (!await fse.pathExists(fullPath)) return candidate;

    try {
      const entries = (await fse.readdir(fullPath)).filter(e => !e.startsWith('.'));
      if (entries.length === 0) return candidate; // folder exists but is empty — reuse it
    } catch {
      return candidate;
    }

    candidate = `${baseName}_${counter}`;
    counter++;
  }
}

module.exports = { buildDestPath };
