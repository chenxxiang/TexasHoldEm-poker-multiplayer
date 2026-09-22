/**
 * Turns the AI-generated card art into the sprite sheet the game loads.
 *
 *   node scripts/build-card-sheet.js <face-sheet.png> <card-back.png> [--crop-top 0.14]
 *
 * Needs sharp, which is not a project dependency (this runs once per art revision, not at
 * build time):  npm i -g sharp   and run with NODE_PATH pointing at the global modules.
 *
 * The generated art is close to a grid but not machine-uniform: card widths drift over a few
 * pixels across the columns and each suit row comes out its own height. So every card is
 * located by its own alpha bounding box and resized to fill one fixed cell, which leaves the
 * artwork flush with the cell edges and lets Card.jsx address a card with nothing but a
 * background-position offset.
 *
 * Generators that stamp a watermark (Doubao puts one in the top-left) are handled two ways:
 * --crop-top removes a reserved band off the top of both inputs first, and on top of that any
 * detected band that does not run the length of the sheet is discarded, since a real card row
 * spans nearly the full width and a real card column nearly the full height.
 *
 * Grid order matches server/game/deck.js: rows = SUITS, columns = VALUES.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? parseFloat(argv[i + 1]) : fallback;
};
const CROP_TOP = flag('--crop-top', 0);
// A card's body is fully opaque. Anything softer than this is backdrop — a glow, a drop
// shadow, an antialiased fringe — and must not count as artwork, or a sheet whose cards sit
// on a translucent halo reads as one solid blob and no grid can be found in it.
const OPAQUE = flag('--alpha', 200);
const valueIdx = new Set();
for (const name of ['--crop-top', '--alpha']) {
  const i = argv.indexOf(name);
  if (i >= 0) valueIdx.add(i + 1);
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
const [SRC_FACE, SRC_BACK, DECK_ID] = positional;

if (!SRC_FACE || !SRC_BACK || !DECK_ID || !/^[a-z][a-z0-9-]*$/.test(DECK_ID)
    || !(CROP_TOP >= 0 && CROP_TOP < 0.5) || !(OPAQUE >= 0 && OPAQUE < 255)) {
  console.error('usage: node scripts/build-card-sheet.js <face-sheet.png> <card-back.png> <deck-id> [--alpha 200] [--crop-top 0]');
  console.error('  <deck-id>   skin id from src/data/decks.js; output lands in public/cards/<deck-id>/');
  console.error('  --alpha     alpha above which a pixel counts as card body (0-254, default 200)');
  console.error('  --crop-top  fraction of height to discard off the top of both inputs (0 - 0.5),');
  console.error('              for a blank band reserved for a generator watermark');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'public', 'cards', DECK_ID);

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

// standard poker proportion (2.5 x 3.5in), matching the w/h ratios of Card.jsx SIZES
const CELL_W = 150;
const CELL_H = 210;

/** Drop the reserved watermark band off the top, returning a PNG buffer. */
async function cropTop(src) {
  const img = sharp(src);
  if (!CROP_TOP) return img.png().toBuffer();
  const { width, height } = await img.metadata();
  const top = Math.round(height * CROP_TOP);
  return sharp(src).extract({ left: 0, top, width, height: height - top }).png().toBuffer();
}

/** Split an occupancy profile into runs of "has artwork". */
function runs(occupancy, span) {
  const threshold = Math.max(1, Math.floor(span * 0.02));
  const out = [];
  let start = -1;
  for (let i = 0; i < occupancy.length; i++) {
    const filled = occupancy[i] > threshold;
    if (filled && start < 0) start = i;
    if (!filled && start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) out.push([start, occupancy.length - 1]);
  return out;
}

async function tightBoxes(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const alpha = (x, y) => data[(y * W + x) * C + 3];

  // Rows first. A row of cards runs nearly the full width of the sheet; a watermark does not,
  // so the short bands drop out here.
  const rowOcc = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (alpha(x, y) > OPAQUE) rowOcc[y]++;
  }
  const allRows = runs(rowOcc, W);
  const rows = allRows.filter(([y0, y1]) => {
    let min = Infinity, max = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < W; x++) if (alpha(x, y) > OPAQUE) { if (x < min) min = x; if (x > max) max = x; }
    }
    return max >= 0 && (max - min + 1) / W >= 0.6;
  });
  if (allRows.length !== rows.length) {
    console.log(`ignored ${allRows.length - rows.length} partial row band(s) — most likely a generator watermark`);
  }

  // Columns are then measured only inside the surviving rows. Restricting the scan this way
  // matters: a watermark wide enough to bridge the gutters would otherwise fuse neighbouring
  // columns into one band and the grid would come out short.
  const inRow = new Uint8Array(H);
  let bandHeight = 0;
  for (const [y0, y1] of rows) {
    for (let y = y0; y <= y1; y++) { inRow[y] = 1; bandHeight++; }
  }
  const colOcc = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    if (!inRow[y]) continue;
    for (let x = 0; x < W; x++) if (alpha(x, y) > OPAQUE) colOcc[x]++;
  }
  const allCols = runs(colOcc, bandHeight);
  const cols = allCols.filter(([x0, x1]) => {
    let min = Infinity, max = -1;
    for (let x = x0; x <= x1; x++) {
      for (let y = 0; y < H; y++) if (inRow[y] && alpha(x, y) > OPAQUE) { if (y < min) min = y; if (y > max) max = y; }
    }
    return max >= 0 && (max - min + 1) / bandHeight >= 0.6;
  });
  if (allCols.length !== cols.length) {
    console.log(`ignored ${allCols.length - cols.length} partial column band(s)`);
  }

  if (cols.length !== VALUES.length || rows.length !== SUITS.length) {
    throw new Error(
      `expected a ${VALUES.length}x${SUITS.length} grid, detected ${cols.length}x${rows.length}. ` +
      'If the watermark sits on the cards rather than in a reserved band, re-generate with a ' +
      'wider blank strip at the top, or pass a larger --crop-top.'
    );
  }

  const boxes = [];
  for (let r = 0; r < SUITS.length; r++) {
    boxes[r] = [];
    for (let c = 0; c < VALUES.length; c++) {
      // pad the window so a card drifting past its band edge is still caught whole
      const x0 = Math.max(0, cols[c][0] - 8), x1 = Math.min(W - 1, cols[c][1] + 8);
      const y0 = Math.max(0, rows[r][0] - 8), y1 = Math.min(H - 1, rows[r][1] + 8);
      let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (alpha(x, y) > OPAQUE) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      boxes[r][c] = {
        code: VALUES[c] + SUITS[r],
        left: minX, top: minY,
        width: maxX - minX + 1, height: maxY - minY + 1,
      };
    }
  }
  return boxes;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const faceBuf = await cropTop(SRC_FACE);
  const backBuf = await cropTop(SRC_BACK);
  const boxes = await tightBoxes(faceBuf);

  const layers = [];
  for (let r = 0; r < SUITS.length; r++) {
    for (let c = 0; c < VALUES.length; c++) {
      const b = boxes[r][c];
      layers.push({
        input: await sharp(faceBuf)
          .extract({ left: b.left, top: b.top, width: b.width, height: b.height })
          .resize({ width: CELL_W, height: CELL_H, fit: 'fill', kernel: 'lanczos3' })
          .png()
          .toBuffer(),
        left: c * CELL_W,
        top: r * CELL_H,
      });
    }
  }

  const sheetW = VALUES.length * CELL_W;
  const sheetH = SUITS.length * CELL_H;
  const sheet = await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(layers).png().toBuffer();
  await sharp(sheet).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, 'deck-sheet.webp'));

  // backs render larger than faces in the win animation, so keep twice the cell resolution
  const back = await sharp(backBuf).trim({ threshold: 1 })
    .resize({ width: CELL_W * 2, height: CELL_H * 2, fit: 'fill', kernel: 'lanczos3' })
    .toBuffer();
  await sharp(back).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, 'card-back.webp'));

  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
  if (CROP_TOP) console.log(`cropped top ${(CROP_TOP * 100).toFixed(0)}% off both inputs`);
  const src = await sharp(faceBuf).metadata();
  console.log(`[${DECK_ID}] source ${src.width}x${src.height} -> per-card ${Math.round(src.width / VALUES.length)}px wide`);
  console.log(`[${DECK_ID}] deck-sheet.webp ${sheetW}x${sheetH} (cell ${CELL_W}x${CELL_H})  ${kb('deck-sheet.webp')}`);
  console.log(`[${DECK_ID}] card-back.webp  ${CELL_W * 2}x${CELL_H * 2}  ${kb('card-back.webp')}`);
})();
