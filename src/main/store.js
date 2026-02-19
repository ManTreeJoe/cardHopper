const Store = require('electron-store');
const path = require('path');
const { app } = require('electron');

const schema = {
  destinationFolder: {
    type: 'string',
    default: ''
  },
  organizationScheme: {
    type: 'string',
    enum: ['date', 'flat', 'year-month'],
    default: 'date'
  },
  autoDelete: {
    type: 'boolean',
    default: false
  },
  verifyChecksums: {
    type: 'boolean',
    default: true
  },
  fileTypes: {
    type: 'object',
    properties: {
      images: { type: 'boolean', default: true },
      video: { type: 'boolean', default: true },
      audio: { type: 'boolean', default: true },
      raw: { type: 'boolean', default: true }
    },
    default: { images: true, video: true, audio: true, raw: true }
  },
  duplicateHandling: {
    type: 'string',
    enum: ['rename', 'skip', 'overwrite'],
    default: 'rename'
  },
  notifications: {
    type: 'object',
    properties: {
      onStart: { type: 'boolean', default: true },
      onComplete: { type: 'boolean', default: true },
      onError: { type: 'boolean', default: true }
    },
    default: { onStart: true, onComplete: true, onError: true }
  },
  launchAtLogin: {
    type: 'boolean',
    default: false
  },
  paused: {
    type: 'boolean',
    default: false
  }
};

let store;

function getStore() {
  if (!store) {
    store = new Store({ schema });

    // Set default destination to ~/CardHopper if not set
    if (!store.get('destinationFolder')) {
      const defaultDest = path.join(app.getPath('pictures'), 'CardHopper');
      store.set('destinationFolder', defaultDest);
    }

    // Always start unpaused — pause is a session-only state
    store.set('paused', false);
  }
  return store;
}

// Media extensions grouped by category
const MEDIA_EXTENSIONS = {
  images: ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.heic', '.heif', '.webp'],
  video: ['.mp4', '.mov', '.avi', '.mkv', '.mts', '.m2ts', '.wmv', '.flv', '.webm', '.m4v'],
  audio: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma', '.aiff', '.aif'],
  raw: ['.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.dng', '.raf', '.pef', '.srw', '.x3f']
};

function getEnabledExtensions() {
  const s = getStore();
  const fileTypes = s.get('fileTypes');
  const extensions = [];
  for (const [category, enabled] of Object.entries(fileTypes)) {
    if (enabled && MEDIA_EXTENSIONS[category]) {
      extensions.push(...MEDIA_EXTENSIONS[category]);
    }
  }
  return extensions;
}

module.exports = { getStore, MEDIA_EXTENSIONS, getEnabledExtensions };
