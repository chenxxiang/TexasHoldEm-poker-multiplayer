/**
 * Turns the AI-generated card art into the sprite sheet the game loads.
 *
 *   node scripts/build-card-sheet.js <face-sheet.png> <card-back.png>
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
 * Grid order matches server/game/deck.js: rows = SUITS, columns = VALUES.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const [SRC_FACE, SRC_BACK] = process.argv.slice(2);
if (!SRC_FACE || !SRC_BACK) {
  console.error('usage: node scripts/build-card-sheet.js <face-sheet.png> <card-back.png>');
  process.exit(1);
}
const OUT = path.join(__dirname, '..', 'public', 'cards');

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['s', 'h', 'd', 'c'];

// standard poker proportion (2.5 x 3.5in), matching the w/h ratios of Card.jsx SIZES
const CELL_W = 150;
const CELL_H = 210;

/** Split the sheet into bands of columns/rows that hold artwork, from alpha occupancy. */
function bands(occupancy, span) {
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

async function tightBoxes(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const alpha = (x, y) => data[(y * W + x) * C + 3];

  const colOcc = new Array(W).fill(0);
  const rowOcc = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) > 16) { colOcc[x]++; rowOcc[y]++; }
    }
  }
  const cols = bands(colOcc, H);
  const rows = bands(rowOcc, W);
  if (cols.length !== VALUES.length || rows.length !== SUITS.length) {
    throw new Error(`expected a ${VALUES.length}x${SUITS.length} grid, detected ${cols.length}x${rows.length}`);
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
          if (alpha(x, y) > 40) {
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
  const boxes = await tightBoxes(SRC_FACE);

  const layers = [];
  for (let r = 0; r < SUITS.length; r++) {
    for (let c = 0; c < VALUES.length; c++) {
      const b = boxes[r][c];
      layers.push({
        input: await sharp(SRC_FACE)
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
  const back = await sharp(SRC_BACK).trim({ threshold: 1 })
    .resize({ width: CELL_W * 2, height: CELL_H * 2, fit: 'fill', kernel: 'lanczos3' })
    .toBuffer();
  await sharp(back).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(OUT, 'card-back.webp'));

  const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
  console.log(`deck-sheet.webp ${sheetW}x${sheetH} (cell ${CELL_W}x${CELL_H})  ${kb('deck-sheet.webp')}`);
  console.log(`card-back.webp  ${CELL_W * 2}x${CELL_H * 2}  ${kb('card-back.webp')}`);
})();
