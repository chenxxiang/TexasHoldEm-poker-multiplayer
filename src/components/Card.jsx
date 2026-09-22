import { useAppearance } from '../context/AppearanceContext';
import { getDeck } from '../data/decks';

// Which card skin is drawn comes from AppearanceContext, so none of the callers pass it.
// Pass `deckId` only to force a specific skin regardless of the player's choice — the
// appearance panel does that to preview each skin side by side.

const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS  = ['s', 'h', 'd', 'c'];
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

const SIZES = {
  xs: { w: 24, h: 34, cornerFs: 9,  centerFs: 14 },
  sm: { w: 34, h: 48, cornerFs: 12, centerFs: 20 },
  md: { w: 50, h: 70, cornerFs: 15, centerFs: 28 },
  my: { w: 54, h: 76, cornerFs: 16, centerFs: 32 },
  lg: { w: 62, h: 88, cornerFs: 18, centerFs: 38 },
};

const SHADOW = '0 4px 14px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.25)';

export default function Card({ card, size = 'md', deckId }) {
  const appearance = useAppearance();
  const deck = deckId ? getDeck(deckId) : appearance.deck;
  const dims = SIZES[size] || SIZES.md;

  const code = typeof card === 'string' ? card : card?.code;
  const col = code ? VALUES.indexOf(code.slice(0, -1)) : -1;
  const row = code ? SUITS.indexOf(code.slice(-1)) : -1;
  const faceDown = col < 0 || row < 0;   // face down, or a code we cannot place

  if (deck.renderer === 'css') {
    return faceDown ? <LegacyBack {...dims} /> : <LegacyFace {...dims} code={code} />;
  }
  return faceDown
    ? <SpriteBack {...dims} dir={deck.dir} />
    : <SpriteFace {...dims} dir={deck.dir} col={col} row={row} />;
}

// ── sprite skins ─────────────────────────────────────────────────────────────
// One 13x4 sheet holds every card edge-to-edge, so a background-position offset of exactly
// one cell lands on exactly one card. The radius clips the sprite's square corners.

function SpriteFace({ w, h, dir, col, row }) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      backgroundImage: `url(${dir}/deck-sheet.webp)`,
      backgroundSize: `${w * VALUES.length}px ${h * SUITS.length}px`,
      backgroundPosition: `${-col * w}px ${-row * h}px`,
      borderRadius: radius(w),
      boxShadow: SHADOW,
      userSelect: 'none',
    }} />
  );
}

function SpriteBack({ w, h, dir }) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      backgroundImage: `url(${dir}/card-back.webp)`,
      backgroundSize: '100% 100%',
      borderRadius: radius(w),
      boxShadow: SHADOW,
      userSelect: 'none',
    }} />
  );
}

function radius(w) {
  return Math.max(3, Math.round(w * 0.09));
}

// ── legacy skin ──────────────────────────────────────────────────────────────
// Drawn in CSS rather than from a sheet: it is the default, so a new player downloads no card
// art, and it stays crisp at every size.

function LegacyBack({ w, h }) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      background: 'linear-gradient(135deg,#162b5e 0%,#1e3d8a 50%,#162b5e 100%)',
      border: '1.5px solid #3a6ac1', borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        width: w - 10, height: h - 10,
        border: '1px solid rgba(74,122,193,0.45)', borderRadius: 3,
        background: 'repeating-linear-gradient(45deg,rgba(45,90,158,0.3) 0px,rgba(45,90,158,0.3) 2px,transparent 2px,transparent 7px)',
      }} />
    </div>
  );
}

function LegacyFace({ w, h, cornerFs, centerFs, code }) {
  const suit     = code.slice(-1);
  const rawValue = code.slice(0, -1) === 'T' ? '10' : code.slice(0, -1);
  const symbol   = SUIT_SYMBOLS[suit] || '?';
  const isRed    = suit === 'h' || suit === 'd';
  const color    = isRed ? '#c0392b' : '#1a1a1a';

  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      background: 'linear-gradient(160deg,#ffffff 60%,#f4f4f4 100%)',
      border: '1px solid #ddd', borderRadius: 6,
      boxShadow: '0 4px 14px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.06)',
      position: 'relative', color,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '3px 4px', userSelect: 'none', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(135deg,transparent,transparent 4px,rgba(0,0,0,0.012) 4px,rgba(0,0,0,0.012) 5px)',
      }} />
      <div style={{ fontSize: cornerFs, fontWeight: 800, lineHeight: 1.1, zIndex: 1 }}>
        {rawValue}
      </div>
      <div style={{ fontSize: centerFs, fontWeight: 700, textAlign: 'center', lineHeight: 1, zIndex: 1 }}>
        {symbol}
      </div>
      <div style={{ fontSize: cornerFs, fontWeight: 800, lineHeight: 1.1, transform: 'rotate(180deg)', alignSelf: 'flex-end', zIndex: 1 }}>
        {rawValue}
      </div>
    </div>
  );
}
