// Generate a 1024x1024 PNG app icon for CardHopper
// macOS applies the rounded squircle mask automatically on Big Sur+
// Content should fill ~80% of canvas (centered in safe area)
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

const px = new Uint8Array(SIZE * SIZE * 4);

function setPixel(x, y, r, g, b, a) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
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

function fillRect(x1, y1, x2, y2, r, g, b, a) {
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      setPixel(x, y, r, g, b, a);
    }
  }
}

// Draw a thick outlined rectangle (no fill)
function strokeRect(x1, y1, x2, y2, thickness, r, g, b, a) {
  fillRect(x1, y1, x2, y1 + thickness, r, g, b, a);           // top
  fillRect(x1, y2 - thickness, x2, y2, r, g, b, a);           // bottom
  fillRect(x1, y1, x1 + thickness, y2, r, g, b, a);           // left
  fillRect(x2 - thickness, y1, x2, y2, r, g, b, a);           // right
}

// Draw a thick line between two points
function strokeLine(x1, y1, x2, y2, thickness, r, g, b, a) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    for (let ty = -thickness / 2; ty <= thickness / 2; ty++) {
      for (let tx = -thickness / 2; tx <= thickness / 2; tx++) {
        setPixel(cx + tx, cy + ty, r, g, b, a);
      }
    }
  }
}

// ── Colors ──
const bgR = 0x0a, bgG = 0x0a, bgB = 0x0a;
const acR = 0xe8, acG = 0x6c, acB = 0x2a;   // #e86c2a orange
const acLR = 0xf2, acLG = 0x8a, acLB = 0x4a; // #f28a4a lighter orange
const dimR = 0x3a, dimG = 0x28, dimB = 0x15;  // dim orange for retro glow

// ── Background: solid off-black, full bleed ──
fillRect(0, 0, SIZE - 1, SIZE - 1, bgR, bgG, bgB, 255);

// ── Retro scanline texture ──
for (let y = 0; y < SIZE; y += 4) {
  for (let x = 0; x < SIZE; x++) {
    setPixel(x, y, 0x0e, 0x0e, 0x0e, 40);
  }
}

// ── SD Card outline (orange, large, centered in safe area) ──
// macOS safe area: ~100px inset on each side -> 824x824 usable
// Card proportions: roughly 24mm x 32mm = 3:4 ratio
const STROKE = 28;           // thick retro outline
const cardW = 480;
const cardH = 640;
const cardX = (SIZE - cardW) / 2;
const cardY = (SIZE - cardH) / 2;
const notch = 120;            // corner notch size

// Draw the SD card outline path:
//    notch corner at top-left, rest is a rectangle
//
//        (cardX + notch, cardY)
//       /                      (cardX + cardW, cardY)
//      /                       |
//     (cardX, cardY + notch)   |
//     |                        |
//     |                        |
//     (cardX, cardY + cardH)---(cardX + cardW, cardY + cardH)

const oR = acR, oG = acG, oB = acB, oA = 255;

// Top edge (from notch to top-right)
fillRect(cardX + notch, cardY, cardX + cardW, cardY + STROKE, oR, oG, oB, oA);
// Right edge
fillRect(cardX + cardW - STROKE, cardY, cardX + cardW, cardY + cardH, oR, oG, oB, oA);
// Bottom edge
fillRect(cardX, cardY + cardH - STROKE, cardX + cardW, cardY + cardH, oR, oG, oB, oA);
// Left edge (from notch down)
fillRect(cardX, cardY + notch, cardX + STROKE, cardY + cardH, oR, oG, oB, oA);
// Notch diagonal
strokeLine(cardX + notch, cardY, cardX, cardY + notch, STROKE, oR, oG, oB, oA);
// Fill the notch corner joint at top
fillRect(cardX + notch - STROKE / 2, cardY, cardX + notch + STROKE / 2, cardY + STROKE, oR, oG, oB, oA);
// Fill the notch corner joint at left
fillRect(cardX, cardY + notch - STROKE / 2, cardX + STROKE, cardY + notch + STROKE / 2, oR, oG, oB, oA);

// ── Contact pins (5 small orange rectangles near top) ──
const pinAreaX = cardX + notch + 50;
const pinY = cardY + 55;
const pinW = 30;
const pinH = 80;
const pinGap = 52;
for (let p = 0; p < 5; p++) {
  const px1 = pinAreaX + p * pinGap;
  // Outlined pins for retro look
  strokeRect(px1, pinY, px1 + pinW, pinY + pinH, 6, oR, oG, oB, 200);
}

// ── Down arrow (orange outline, centered in lower portion of card) ──
const arrowCx = SIZE / 2;
const arrowCy = cardY + cardH * 0.58;
const shaftW = 70;
const shaftH = 160;
const headW = 180;
const headH = 130;
const aS = 20; // arrow stroke thickness

// Arrow shaft (outlined)
const sx1 = arrowCx - shaftW / 2;
const sy1 = arrowCy - shaftH / 2;
const sx2 = arrowCx + shaftW / 2;
const sy2 = arrowCy + shaftH / 2 - headH * 0.4;
strokeRect(sx1, sy1, sx2, sy2, aS, oR, oG, oB, oA);
// Fill shaft interior with bg to ensure it's hollow
fillRect(sx1 + aS, sy1 + aS, sx2 - aS, sy2, bgR, bgG, bgB, 255);

// Arrow head (outlined triangle pointing down)
const tipY = arrowCy + shaftH / 2 + headH * 0.3;
const headBaseY = arrowCy + shaftH / 2 - headH * 0.5;

// Left edge of arrowhead
strokeLine(arrowCx - headW / 2, headBaseY, arrowCx, tipY, aS, oR, oG, oB, oA);
// Right edge of arrowhead
strokeLine(arrowCx + headW / 2, headBaseY, arrowCx, tipY, aS, oR, oG, oB, oA);
// Top edge of arrowhead (connecting the two sides)
strokeLine(arrowCx - headW / 2, headBaseY, arrowCx - shaftW / 2, headBaseY, aS, oR, oG, oB, oA);
strokeLine(arrowCx + headW / 2, headBaseY, arrowCx + shaftW / 2, headBaseY, aS, oR, oG, oB, oA);

// ── Retro glow effect — faint orange around the card edges ──
for (let pass = 0; pass < 3; pass++) {
  const spread = (pass + 1) * 8;
  const glowA = 15 - pass * 4;
  // Glow on right edge
  fillRect(cardX + cardW, cardY, cardX + cardW + spread, cardY + cardH, dimR, dimG, dimB, glowA);
  // Glow on bottom
  fillRect(cardX, cardY + cardH, cardX + cardW, cardY + cardH + spread, dimR, dimG, dimB, glowA);
  // Glow on left
  fillRect(cardX - spread, cardY + notch, cardX, cardY + cardH, dimR, dimG, dimB, glowA);
}

// ── Output ──
const outDir = path.join(__dirname, '..', 'assets', 'icons');
const pngPath = path.join(outDir, 'icon.png');
const pngBuf = createPNG(SIZE, SIZE, px);
fs.writeFileSync(pngPath, pngBuf);
console.log(`Created ${pngPath} (${pngBuf.length} bytes)`);
