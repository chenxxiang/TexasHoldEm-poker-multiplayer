/**
 * Crops the reserved watermark band off the top of a generated image.
 *
 *   node scripts/crop-watermark.js <in> <out> [--top 0.14] [--max-width 1400]
 *
 * Used for the table backgrounds, which are photographic and so cannot be located by alpha
 * the way the card sheet is — the prompts instead reserve a detail-free band across the top
 * of the frame for the generator's watermark, and this discards it.
 *
 * Needs sharp (see scripts/build-card-sheet.js for the install note).
 */
const sharp = require('sharp');
const path = require('path');

const argv = process.argv.slice(2);
const num = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? parseFloat(argv[i + 1]) : fallback;
};
const TOP = num('--top', 0.14);
const MAX_W = num('--max-width', 0);
const skip = new Set();
for (const flag of ['--top', '--max-width']) {
  const i = argv.indexOf(flag);
  if (i >= 0) { skip.add(i); skip.add(i + 1); }
}
const [SRC, OUT] = argv.filter((a, i) => !skip.has(i));

if (!SRC || !OUT || !(TOP >= 0 && TOP < 0.5)) {
  console.error('usage: node scripts/crop-watermark.js <in> <out> [--top 0.14] [--max-width 1400]');
  process.exit(1);
}

(async () => {
  const meta = await sharp(SRC).metadata();
  const top = Math.round(meta.height * TOP);
  let pipe = sharp(SRC).extract({ left: 0, top, width: meta.width, height: meta.height - top });
  if (MAX_W && meta.width > MAX_W) pipe = pipe.resize({ width: Math.round(MAX_W) });
  await pipe.toFile(OUT);

  const out = await sharp(OUT).metadata();
  console.log(`${path.basename(SRC)} ${meta.width}x${meta.height}`
    + ` -> ${path.basename(OUT)} ${out.width}x${out.height}`
    + ` (ratio ${(out.width / out.height).toFixed(3)}, cropped top ${(TOP * 100).toFixed(0)}%)`);
})();
