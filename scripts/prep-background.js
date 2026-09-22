/**
 * Prepares a generated table background for public/.
 *
 *   node scripts/prep-background.js <in> <out> [--max-width 1200] [--top 0.14]
 *
 * Backgrounds are photographic, so unlike the card sheet they cannot be located by alpha —
 * this just resizes them down to something sane to ship. --top additionally discards a
 * fraction off the top of the frame, for generators that stamp a watermark up there; it
 * defaults to 0 and is not needed normally.
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
const TOP = num('--top', 0);
const MAX_W = num('--max-width', 1200);
const skip = new Set();
for (const flag of ['--top', '--max-width']) {
  const i = argv.indexOf(flag);
  if (i >= 0) { skip.add(i); skip.add(i + 1); }
}
const [SRC, OUT] = argv.filter((a, i) => !skip.has(i));

if (!SRC || !OUT || !(TOP >= 0 && TOP < 0.5)) {
  console.error('usage: node scripts/prep-background.js <in> <out> [--max-width 1200] [--top 0]');
  process.exit(1);
}

(async () => {
  const meta = await sharp(SRC).metadata();
  const top = Math.round(meta.height * TOP);
  let pipe = sharp(SRC);
  if (top) pipe = pipe.extract({ left: 0, top, width: meta.width, height: meta.height - top });
  if (MAX_W && meta.width > MAX_W) pipe = pipe.resize({ width: Math.round(MAX_W) });
  await pipe.toFile(OUT);

  const out = await sharp(OUT).metadata();
  console.log(`${path.basename(SRC)} ${meta.width}x${meta.height}`
    + ` -> ${path.basename(OUT)} ${out.width}x${out.height} (ratio ${(out.width / out.height).toFixed(3)})`
    + (top ? `, cropped top ${(TOP * 100).toFixed(0)}%` : ''));
})();
