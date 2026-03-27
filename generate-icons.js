/**
 * assets/generate-icons.js
 * Run with Node.js to generate PNG icons from SVG.
 * Requires: npm install sharp
 *
 * Usage: node assets/generate-icons.js
 */

// This script is a dev-time helper.
// For production, replace the icons/ folder with your own branded PNGs.

const fs   = require('fs');
const path = require('path');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#0d0f14"/>
  <circle cx="64" cy="64" r="52" stroke="url(#g)" stroke-width="4" fill="none"/>
  <path d="M36 64 L52 44 L52 56 L76 56 L76 44 L92 64 L76 84 L76 72 L52 72 L52 84 Z"
        fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="128" y2="128">
      <stop offset="0%" stop-color="#00E5A0"/>
      <stop offset="100%" stop-color="#00B4FF"/>
    </linearGradient>
  </defs>
</svg>`;

const SIZES = [16, 32, 48, 128];
const OUT   = path.join(__dirname, 'icons');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

try {
  const sharp = require('sharp');
  SIZES.forEach(async (size) => {
    const buf = Buffer.from(SVG);
    await sharp(buf).resize(size, size).png().toFile(path.join(OUT, `icon${size}.png`));
    console.log(`✓ icon${size}.png`);
  });
} catch {
  // sharp not installed — write SVG as a fallback reference
  fs.writeFileSync(path.join(OUT, 'icon.svg'), SVG);
  console.log('sharp not found. SVG saved. Install sharp and re-run, or replace icons manually.');
}
