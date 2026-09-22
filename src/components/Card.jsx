// Card faces come from a single 13x4 sprite sheet in public/cards/. Columns follow VALUES and
// rows follow SUITS — the same order server/game/deck.js builds the deck in — and every cell
// holds one card edge-to-edge, so a background-position offset of one cell lands on one card.
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS  = ['s', 'h', 'd', 'c'];

const SHEET = '/cards/deck-sheet.webp';
const BACK  = '/cards/card-back.webp';

const SIZES = {
  xs: { w: 24, h: 34 },
  sm: { w: 34, h: 48 },
  md: { w: 50, h: 70 },
  my: { w: 54, h: 76 },
  lg: { w: 62, h: 88 },
};

const SHADOW = '0 4px 14px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.25)';

export default function Card({ card, size = 'md' }) {
  const { w, h } = SIZES[size] || SIZES.md;
  // the artwork carries its own gold frame; the radius only clips the sprite's square corners
  const radius = Math.max(3, Math.round(w * 0.09));

  const code = typeof card === 'string' ? card : card?.code;
  const col = code ? VALUES.indexOf(code.slice(0, -1)) : -1;
  const row = code ? SUITS.indexOf(code.slice(-1)) : -1;

  // face down, or anything we can't place on the sheet
  if (col < 0 || row < 0) {
    return (
      <div style={{
        width: w, height: h, flexShrink: 0,
        backgroundImage: `url(${BACK})`,
        backgroundSize: '100% 100%',
        borderRadius: radius,
        boxShadow: SHADOW,
        userSelect: 'none',
      }} />
    );
  }

  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      backgroundImage: `url(${SHEET})`,
      backgroundSize: `${w * VALUES.length}px ${h * SUITS.length}px`,
      backgroundPosition: `${-col * w}px ${-row * h}px`,
      borderRadius: radius,
      boxShadow: SHADOW,
      userSelect: 'none',
    }} />
  );
}
