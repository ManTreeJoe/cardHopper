// Generate a 1024x1024 PNG app icon for CardHopper
// Then use sips + iconutil to create .icns
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 1024;

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = 0xffffffff;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeData));
    return Buffer.concat([len, typeData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const offset = y * (1 + width * 4) + 1 + x * 4;
      raw[offset] = pixels[i * 4];
      raw[offset + 1] = pixels[i * 4 + 1];
      raw[offset + 2] = pixels[i * 4 + 2];
      raw[offset + 3] = pixels[i * 4 + 3];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', compressed), iend]);
}

// Draw the icon
const px = new Uint8Array(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  // Alpha blend
  const srcA = a / 255;
  const dstA = px[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA > 0) {
    px[i] = Math.round((r * srcA + px[i] * dstA * (1 - srcA)) / outA);
    px[i + 1] = Math.round((g * srcA + px[i + 1] * dstA * (1 - srcA)) / outA);
    px[i + 2] = Math.round((b * srcA + px[i + 2] * dstA * (1 - srcA)) / outA);
    px[i + 3] = Math.round(outA * 255);
  }
}

function fillCircle(cx, cy, r, red, green, blue, alpha) {
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) {
        setPixel(cx + dx, cy + dy, red, green, blue, alpha);
      }
    }
  }
}

function fillRect(x1, y1, x2, y2, r, g, b, a) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setPixel(x, y, r, g, b, a);
    }
  }
}

function fillRoundedRect(x1, y1, x2, y2, radius, r, g, b, a) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      // Check corners
      let inside = true;
      if (x < x1 + radius && y < y1 + radius) {
        inside = ((x - (x1 + radius)) ** 2 + (y - (y1 + radius)) ** 2) <= radius * radius;
      } else if (x > x2 - radius && y < y1 + radius) {
        inside = ((x - (x2 - radius)) ** 2 + (y - (y1 + radius)) ** 2) <= radius * radius;
      } else if (x < x1 + radius && y > y2 - radius) {
        inside = ((x - (x1 + radius)) ** 2 + (y - (y2 - radius)) ** 2) <= radius * radius;
      } else if (x > x2 - radius && y > y2 - radius) {
        inside = ((x - (x2 - radius)) ** 2 + (y - (y2 - radius)) ** 2) <= radius * radius;
      }
      if (inside) setPixel(x, y, r, g, b, a);
    }
  }
}

// Color palette from nathanbupte.com
const bgR = 0x0a, bgG = 0x0a, bgB = 0x0a;          // #0a0a0a off-black
const surfR = 0x1a, surfG = 0x1a, surfB = 0x1a;      // #1a1a1a surface
const accentR = 0xe8, accentG = 0x6c, accentB = 0x2a; // #e86c2a orange
const accHovR = 0xf2, accHovG = 0x8a, accHovB = 0x4a; // #f28a4a orange hover
const textR = 0xf5, textG = 0xf0, textB = 0xe8;       // #f5f0e8 cream text
const borderR = 0x2a, borderG = 0x25, borderB = 0x20;  // #2a2520 border

// Background: off-black rounded rect
fillRoundedRect(0, 0, SIZE - 1, SIZE - 1, 200, bgR, bgG, bgB, 255);

// Subtle gradient — slightly lighter at top
for (let y = 0; y < SIZE; y++) {
  const t = y / SIZE;
  const r = Math.round(0x11 * (1 - t) + bgR * t);
  const g = Math.round(0x11 * (1 - t) + bgG * t);
  const b = Math.round(0x11 * (1 - t) + bgB * t);
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (px[i + 3] > 0) {
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
}

// SD Card shape (cream/warm white, centered)
const cardW = 420, cardH = 560;
const cardX = (SIZE - cardW) / 2;
const cardY = (SIZE - cardH) / 2 - 20;
const notch = 100;

// Card body
for (let y = cardY + notch; y < cardY + cardH; y++) {
  for (let x = cardX; x < cardX + cardW; x++) {
    setPixel(x, y, textR, textG, textB, 235);
  }
}
// Top part (with notched corner)
for (let y = cardY; y < cardY + notch; y++) {
  for (let x = cardX + notch; x < cardX + cardW; x++) {
    setPixel(x, y, textR, textG, textB, 235);
  }
}
// Diagonal notch
for (let i = 0; i < notch; i++) {
  for (let j = 0; j <= i; j++) {
    setPixel(cardX + j, cardY + notch - i, textR, textG, textB, 235);
  }
}

// Contact pins (orange accent)
for (let pin = 0; pin < 5; pin++) {
  const px1 = cardX + notch + 40 + pin * 55;
  fillRect(px1, cardY + 20, px1 + 30, cardY + 80, accentR, accentG, accentB, 230);
}

// Down arrow (orange accent, in lower half of card) - represents ingest
const arrowCx = SIZE / 2;
const arrowCy = cardY + cardH * 0.6;
const arrowW = 70;
const arrowH = 140;
const headW = 120;
const headH = 80;

// Arrow shaft
fillRect(arrowCx - arrowW/2, arrowCy - arrowH/2, arrowCx + arrowW/2, arrowCy + arrowH/2 - headH/2, accentR, accentG, accentB, 240);
// Arrow head (triangle)
for (let row = 0; row < headH; row++) {
  const t = row / headH;
  const halfWidth = headW * (1 - t);
  fillRect(arrowCx - halfWidth, arrowCy + arrowH/2 - headH + row, arrowCx + halfWidth, arrowCy + arrowH/2 - headH + row, accentR, accentG, accentB, 240);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
const pngPath = path.join(outDir, 'icon.png');
const png = createPNG(SIZE, SIZE, px);
fs.writeFileSync(pngPath, png);
console.log(`Created ${pngPath} (${png.length} bytes)`);
