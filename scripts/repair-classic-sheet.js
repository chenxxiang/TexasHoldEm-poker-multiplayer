/**
 * Repairs the generated "classic" sheet, which came back with 12 ranks instead of 13.
 *
 *   node scripts/repair-classic-sheet.js <in.png> <out.png>
 *
 * The generator dropped the tens and shifted the indices around them: in every suit the nine
 * carries a rotated "10" in its bottom-right corner, and the jack carries an upright "10" in
 * its top-left. So the glyphs all exist, just printed on the wrong cards. This rebuilds the
 * missing tens out of those blocks and puts the nines' own indices back, producing a normal
 * 13-column sheet that scripts/build-card-sheet.js can then process like any other skin.
 *
 * Nothing here is drawn from scratch — every mark on the repaired cards is lifted from the
 * generated art, so the tens match the other 48 cards exactly.
 *
 * Needs sharp (see scripts/build-card-sheet.js for the install note).
 */
const sharp = require('sharp');
const path = require('path');

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('usage: node scripts/repair-classic-sheet.js <in.png> <out.png>');
  process.exit(1);
}

const OPAQUE = 200;
const SUITS = 4;
const SRC_COLS = 12;          // 2 3 4 5 6 7 8 9 J Q K A — the ten is what is missing
const NINE = 7;               // source column holding the nine
const JACK = 8;               // and the jack, which wears the ten's top-left index
const OUT_COLS = 13;

// Card-relative rectangles, measured off a 6x render of the nine and checked by eye.
const TL_INDEX = [0.030, 0.020, 0.215, 0.300];   // "9" over its suit pip
const BR_INDEX = [0.785, 0.660, 0.972, 0.975];   // rotated pip over the rotated "10"
const PIP_DONOR = [0.250, 0.150, 0.560, 0.390];  // one full-size field pip, taken off the two
const CLEAR = [0.050, 0.030, 0.950, 0.970];      // wipeable area, inside the printed border rule
// A court card's top-left index can only be repainted in the strip left of the illustration's
// frame. The right edge is measured per card rather than assumed: the "10" the jack is wearing
// is wider than the "J" replacing it, and anything left behind shows as a stray rule.
const JACK_TL_Y = [0.030, 0.225];
const JACK_TL_X0 = 0.045;
const JACK_BR = [0.800, 0.660, 0.972, 0.975];

// Standard ten: two columns of four with two more down the middle. Lower half is upside down,
// the way a real deck prints it.
const PIP_LAYOUT = [
  [0.30, 0.215], [0.70, 0.215],
  [0.50, 0.305],
  [0.30, 0.395], [0.70, 0.395],
  [0.30, 0.605], [0.70, 0.605],
  [0.50, 0.695],
  [0.30, 0.785], [0.70, 0.785],
];
const PIP_W = 0.165;   // of card width

const rect = (b, [fx0, fy0, fx1, fy1]) => ({
  left: b.left + Math.round(b.width * fx0),
  top: b.top + Math.round(b.height * fy0),
  width: Math.round(b.width * (fx1 - fx0)),
  height: Math.round(b.height * (fy1 - fy0)),
});

function runs(occ, span) {
  const t = Math.max(1, Math.floor(span * 0.02));
  const out = []; let s = -1;
  for (let i = 0; i < occ.length; i++) {
    const on = occ[i] > t;
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push([s, i - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, occ.length - 1]);
  return out;
}

let RAW = null;   // { data, W, H, C } — kept so the jack fix can look at pixels too

async function gridBoxes(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  RAW = { data, W, H, C };
  const opaque = (x, y) => data[(y * W + x) * C + 3] > OPAQUE;

  const rowOcc = new Array(H).fill(0), colOcc = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) { rowOcc[y]++; colOcc[x]++; }
  const rows = runs(rowOcc, W), cols = runs(colOcc, H);
  if (rows.length !== SUITS || cols.length !== SRC_COLS) {
    throw new Error(`expected a ${SRC_COLS}x${SUITS} sheet, found ${cols.length}x${rows.length} — `
      + 'this repair only applies to the sheet that came back a rank short');
  }

  const boxes = [];
  for (let r = 0; r < SUITS; r++) {
    boxes[r] = [];
    for (let c = 0; c < SRC_COLS; c++) {
      let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
      for (let y = Math.max(0, rows[r][0] - 6); y <= Math.min(H - 1, rows[r][1] + 6); y++)
        for (let x = Math.max(0, cols[c][0] - 6); x <= Math.min(W - 1, cols[c][1] + 6); x++)
          if (opaque(x, y)) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
      boxes[r][c] = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    }
  }
  return boxes;
}

const cut = (r) => sharp(SRC).extract(r).png().toBuffer();
// rotations go through their own pipeline: inside one, sharp rotates before it extracts,
// which would crop the opposite corner of the sheet
const turn = async (r) => sharp(await cut(r)).rotate(180).png().toBuffer();

/**
 * Where a court card's illustration frame begins and ends, in absolute pixels. Both index
 * corners have to be cut outside it: lift a block that includes an edge of the frame and that
 * rule gets carried across the card with the glyph.
 */
function illustrationEdges(b) {
  return { left: illustrationLeft(b), right: illustrationRight(b) };
}

function illustrationRight(b) {
  const { data, W, C } = RAW;
  const ink = (x, y) => {
    const i = (y * W + x) * C;
    if (data[i + 3] <= OPAQUE) return false;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return lum < 110 || (data[i] > 110 && data[i] - data[i + 1] > 55 && data[i] - data[i + 2] > 55);
  };
  const inset = Math.round(b.width * 0.06);
  for (let x = b.left + b.width - 1 - inset; x > b.left + Math.round(b.width * 0.5); x--) {
    for (let y = b.top + Math.round(b.height * 0.35); y <= b.top + Math.round(b.height * 0.65); y++) {
      if (ink(x, y)) return x;
    }
  }
  return b.left + Math.round(b.width * 0.79);
}

/** Leftmost printed column of a court card's illustration frame, in absolute pixels. */
function illustrationLeft(b) {
  const { data, W, C } = RAW;
  const ink = (x, y) => {
    const i = (y * W + x) * C;
    if (data[i + 3] <= OPAQUE) return false;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return lum < 110 || (data[i] > 110 && data[i] - data[i + 1] > 55 && data[i] - data[i + 2] > 55);
  };
  const inset = Math.round(b.width * 0.06);
  // a band with no index in it, so the first ink across it is the frame
  for (let x = b.left + inset; x < b.left + Math.round(b.width * 0.5); x++) {
    for (let y = b.top + Math.round(b.height * 0.35); y <= b.top + Math.round(b.height * 0.65); y++) {
      if (ink(x, y)) return x;
    }
  }
  return b.left + Math.round(b.width * 0.21);
}

/** White out a 2px frame, so a neighbouring pip clipped at the crop edge does not travel. */
async function deburr(buf) {
  const m = await sharp(buf).metadata();
  const band = Buffer.from(
    `<svg width="${m.width}" height="${m.height}">
       <rect x="0" y="0" width="${m.width}" height="${m.height}" fill="none" stroke="#ffffff" stroke-width="4"/>
     </svg>`);
  return sharp(buf).composite([{ input: band }]).png().toBuffer();
}

(async () => {
  const boxes = await gridBoxes(SRC);
  const cardW = Math.max(...boxes.flat().map(b => b.width));
  const cardH = Math.max(...boxes.flat().map(b => b.height));
  const gutter = Math.round(cardW * 0.10);
  const cellW = cardW + gutter, cellH = cardH + gutter;

  const layers = [];
  for (let r = 0; r < SUITS; r++) {
    const nine = boxes[r][NINE];
    const tlRect = rect(nine, TL_INDEX);
    const brRect = rect(nine, BR_INDEX);

    const tl9 = await deburr(await cut(tlRect));          // "9" + pip, upright
    const br9 = await deburr(await turn(tlRect));         // the same block, turned over
    const br10 = await deburr(await cut(brRect));         // rotated "10" + pip
    const tl10 = await deburr(await turn(brRect));        // that block, turned upright

    // one field pip for this suit, at the size a ten wants
    const pipRaw = await sharp(await cut(rect(boxes[r][0], PIP_DONOR))).trim({ threshold: 40 }).toBuffer();
    const pipW = Math.round(cardW * PIP_W);
    const pipUp = await sharp(pipRaw).resize({ width: pipW }).png().toBuffer();
    const pipDown = await sharp(pipUp).rotate(180).png().toBuffer();
    const pipH = (await sharp(pipUp).metadata()).height;

    const place = (col, buf, dx, dy) => layers.push({
      input: buf,
      left: col * cellW + Math.round(gutter / 2) + dx,
      top: r * cellH + Math.round(gutter / 2) + dy,
    });

    for (let c = 0; c < SRC_COLS; c++) {
      const b = boxes[r][c];
      const outCol = c < NINE + 1 ? c : c + 1;            // leave column 8 free for the ten
      const dx = Math.round((cardW - b.width) / 2);
      const dy = Math.round((cardH - b.height) / 2);

      if (c === NINE) {
        // The nine keeps its face but gets its own index back in the bottom-right corner.
        // Wipe first: the wrong "10" block is taller than the "9" that replaces it, so without
        // this its tail still shows under the new glyph. Then sit the new block against the
        // bottom-right of the area it is replacing, the way an index hugs its corner.
        const m = await sharp(br9).metadata();
        const wipeBR = Buffer.from(
          `<svg width="${brRect.width}" height="${brRect.height}">
             <rect width="${brRect.width}" height="${brRect.height}" fill="#ffffff"/>
           </svg>`);
        const patched = await sharp(await cut(b))
          .composite([
            { input: wipeBR, left: brRect.left - b.left, top: brRect.top - b.top },
            {
              input: br9,
              left: brRect.left - b.left + (brRect.width - m.width),
              top: brRect.top - b.top + (brRect.height - m.height),
            },
          ])
          .png().toBuffer();
        place(outCol, patched, dx, dy);
      } else if (c === JACK) {
        // In at least one suit the jack is wearing the ten's index in its top-left corner.
        // Rather than guess which, rebuild every jack's from its own bottom-right block turned
        // upright — the glyph a jack should carry there, whatever the generator printed.
        const frame = illustrationEdges(b);
        const tlX0 = b.left + Math.round(b.width * JACK_TL_X0);
        const jtl = {
          left: tlX0,
          top: b.top + Math.round(b.height * JACK_TL_Y[0]),
          // clear right up to the frame: the "10" being replaced reaches within a pixel of it,
          // and a single column left behind reads as a stray rule beside the J
          width: Math.max(4, frame.left - tlX0),
          height: Math.round(b.height * (JACK_TL_Y[1] - JACK_TL_Y[0])),
        };
        const brX0 = frame.right + 2;
        const jbr = {
          left: brX0,
          top: b.top + Math.round(b.height * JACK_BR[1]),
          width: Math.max(4, b.left + b.width - Math.round(b.width * 0.028) - brX0),
          height: Math.round(b.height * (JACK_BR[3] - JACK_BR[1])),
        };
        const mark = await sharp(await turn(jbr)).trim({ threshold: 40 }).png().toBuffer();
        const mm = await sharp(mark).metadata();
        const wipeTL = Buffer.from(
          `<svg width="${jtl.width}" height="${jtl.height}">
             <rect width="${jtl.width}" height="${jtl.height}" fill="#ffffff"/>
           </svg>`);
        const patched = await sharp(await cut(b))
          .composite([
            { input: wipeTL, left: jtl.left - b.left, top: jtl.top - b.top },
            {
              input: mark,
              left: jtl.left - b.left + Math.max(0, Math.round((jtl.width - mm.width) / 2)),
              top: jtl.top - b.top + 1,
            },
          ])
          .png().toBuffer();
        place(outCol, patched, dx, dy);
      } else {
        place(outCol, await cut(b), dx, dy);
      }
    }

    // ── the missing ten ──────────────────────────────────────────────────────
    const blank = rect(nine, CLEAR);
    const wipe = Buffer.from(
      `<svg width="${blank.width}" height="${blank.height}">
         <rect width="${blank.width}" height="${blank.height}" fill="#ffffff"/>
       </svg>`);
    const pips = PIP_LAYOUT.map(([fx, fy]) => ({
      input: fy > 0.5 ? pipDown : pipUp,
      left: Math.round(nine.width * fx - pipW / 2),
      top: Math.round(nine.height * fy - pipH / 2),
    }));

    const ten = await sharp(await cut(nine))
      .composite([
        { input: wipe, left: blank.left - nine.left, top: blank.top - nine.top },
        ...pips,
        { input: tl10, left: tlRect.left - nine.left, top: tlRect.top - nine.top },
        { input: br10, left: brRect.left - nine.left, top: brRect.top - nine.top },
      ])
      .png().toBuffer();
    place(NINE + 1, ten, Math.round((cardW - nine.width) / 2), Math.round((cardH - nine.height) / 2));
    void tl9;   // kept for symmetry with br9; the nine's own top-left never changes
  }

  const W = OUT_COLS * cellW, H = SUITS * cellH;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toFile(OUT);
  console.log(`repaired ${path.basename(SRC)} -> ${path.basename(OUT)} ${W}x${H}`);
  console.log(`  ${OUT_COLS} columns x ${SUITS} rows, cell ${cellW}x${cellH}, card up to ${cardW}x${cardH}`);
  console.log('  rebuilt 4 tens, restored 4 nine indices');
})();
