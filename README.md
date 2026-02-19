# CardHopper

A menu bar app that automatically detects SD cards (and other removable media), copies all your media files to a local folder, and optionally wipes the card — so you always have a clean card ready to shoot.

Built with Electron. Runs on macOS, Windows, and Linux.

<!-- Add a hero screenshot or GIF here -->
<!-- ![CardHopper Screenshot](assets/screenshots/hero.png) -->

---

## Features

### Auto-Detect & Import
CardHopper sits in your menu bar and watches for SD cards, USB drives, and other removable media. The moment you insert a card, it scans for media files and starts copying — no clicks needed.

<!-- ![Auto Import Demo](assets/screenshots/auto-import.gif) -->

### Live Progress in Menu Bar
See the import percentage right in your menu bar. Click the icon for a full breakdown: file count, transfer speed, size, ETA, and the current file being copied.

<!-- ![Menu Bar Progress](assets/screenshots/menubar-progress.png) -->

### Date-Based Organization
Files are automatically sorted into folders by date taken:
```
~/Pictures/CardHopper/
├── 2025-12-24/
│   ├── DSC05031.ARW
│   └── DSC05032.ARW
├── 2025-12-25/
│   ├── DSC05039.ARW
│   └── ...
```
Choose from **Date** (`2025-12-25/`), **Year/Month** (`2025/12/`), or **Flat** (all in one folder).

### Shoot Labels
Optionally get prompted for a shoot name each time a card is inserted. The name gets appended to the folder:
```
2025-12-25_Wedding/
2025-12-27_Beach_Shoot/
```

<!-- ![Shoot Label Prompt](assets/screenshots/label-prompt.png) -->

### Rename on Import
Rename files automatically using a customizable pattern:
- `{date}_{seq}` → `2025-12-25_001.ARW`
- `{label}_{seq}` → `Wedding_001.ARW`
- `{year}-{month}-{day}_{original}` → `2025-12-25_DSC05031.ARW`

**Tokens:** `{date}` `{year}` `{month}` `{day}` `{seq}` `{original}` `{label}`

### Backup to Second Destination
Copy every file to two locations simultaneously — a primary drive and a backup. Ideal for photographers who want redundancy from the start.

### Folder Watching
Not just SD cards — watch any folder on your system for new media files. Great for:
- Drone WiFi transfer folders
- Camera tethering directories
- Airdrop locations

### SHA-256 Verification
Every copied file is checksummed at the source and destination to guarantee a perfect copy. Mismatches are automatically retried up to 3 times.

### Auto-Delete Originals
After a verified copy, CardHopper can automatically delete the originals from your card — so it's always clean and ready to shoot. Disabled by default, with a clear warning when enabled.

### Smart Duplicate Handling
- **Rename**: Adds `_1`, `_2` suffix to avoid collisions
- **Skip**: Skips files that already exist with matching checksums
- **Overwrite**: Replaces existing files

### Resume Support
If a card is removed mid-copy or the app crashes, CardHopper picks up where it left off. A manifest file tracks what's been verified, so nothing gets copied twice.

### Multi-Card Queue
Insert multiple cards in sequence — CardHopper queues them up and processes one at a time to avoid I/O contention.

---

## Supported File Types

| Category | Extensions |
|----------|-----------|
| **Images** | .jpg .jpeg .png .tiff .tif .bmp .gif .heic .heif .webp |
| **Video** | .mp4 .mov .avi .mkv .mts .m2ts .wmv .flv .webm .m4v |
| **Audio** | .mp3 .wav .aac .flac .ogg .m4a .wma .aiff .aif |
| **RAW** | .cr2 .cr3 .nef .arw .orf .rw2 .dng .raf .pef .srw .x3f |

Each category can be individually toggled on/off in settings.

---

## Installation

### macOS
1. Download `CardHopper-x.x.x-arm64.dmg` from [Releases](#)
2. Open the DMG and drag CardHopper to Applications
3. Right-click the app → **Open** (required first time for unsigned apps)
4. CardHopper appears in your menu bar — no Dock icon

<!-- ![Install](assets/screenshots/install.png) -->

### From Source
```bash
git clone https://github.com/MANTREEJOE/cardhopper.git
cd cardhopper
npm install
npm start
```

### Build
```bash
npm run build          # Build for current platform
npm run build:mac      # macOS .dmg
npm run build:win      # Windows .exe
npm run build:linux    # Linux .AppImage
```

---

## Settings

Click the tray icon → **Open Settings** to configure:

| Tab | Options |
|-----|---------|
| **General** | Destination folder, backup folder, organization scheme, duplicate handling |
| **File Types** | Toggle images, video, audio, RAW on/off |
| **Import** | Rename pattern, shoot label prompt, watched folders |
| **Safety** | Checksum verification, auto-delete originals, notification preferences |
| **Advanced** | Launch at login |

<!-- ![Settings Window](assets/screenshots/settings.png) -->

---

## How It Works

1. **Detect** — Watches for removable media via platform-native APIs (macOS: `/Volumes` + `diskutil`, Windows: `wmic`, Linux: `/proc/mounts`)
2. **Scan** — Recursively walks the card for media files matching your enabled types
3. **Checksum** — SHA-256 hash of each source file (1MB streaming chunks)
4. **Organize** — Builds the destination path based on your scheme + label + rename pattern
5. **Copy** — Stream-copies to a `.cardhopper-tmp` file, then renames on success
6. **Verify** — SHA-256 of the copy, compared against source (retry up to 3x on mismatch)
7. **Backup** — If enabled, repeats the copy to the backup destination
8. **Delete** — If enabled and verified, removes the original from the card
9. **Manifest** — Writes a JSON audit trail for resume support

---

## Screenshots

<!--
Add your screenshots and videos here. Recommended:
- Hero shot of the menu bar with progress
- Settings window (each tab)
- Shoot label prompt dialog
- Notification examples
- Before/after of organized folders
-->

### Menu Bar
<!-- ![Menu Bar](assets/screenshots/menubar.png) -->

### During Import
<!-- ![Import Progress](assets/screenshots/import-progress.png) -->

### Settings
<!-- ![Settings](assets/screenshots/settings-general.png) -->
<!-- ![Settings Import](assets/screenshots/settings-import.png) -->

### Shoot Label Prompt
<!-- ![Label Prompt](assets/screenshots/label-prompt.png) -->

---

## Demo

<!-- Add a video demo here -->
<!-- [![CardHopper Demo](assets/screenshots/video-thumbnail.png)](https://youtube.com/watch?v=YOUR_VIDEO_ID) -->

---

## Tech Stack

- **Electron** — App framework + Tray API
- **Node.js crypto** — SHA-256 checksum verification
- **chokidar** — File system watching (volumes + folders)
- **fs-extra** — Robust file operations
- **electron-store** — Persistent settings
- **auto-launch** — Start at login
- **electron-builder** — Packaging (.dmg, .exe, .AppImage)

---

## License

MIT
