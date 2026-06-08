const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

const SIZES = {
  xs: { w: 24,  h: 34,  cornerFs: 9,  centerFs: 14 },
  sm: { w: 34,  h: 48,  cornerFs: 12, centerFs: 20 },
  md: { w: 50,  h: 70,  cornerFs: 15, centerFs: 28 },
  my: { w: 54,  h: 76,  cornerFs: 16, centerFs: 32 },
  lg: { w: 62,  h: 88,  cornerFs: 18, centerFs: 38 },
};

export default function Card({ card, size = 'md' }) {
  const { w, h, cornerFs, centerFs } = SIZES[size] || SIZES.md;

  if (!card || card === 'hidden') {
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

  const suit      = card.code.slice(-1);
  const rawValue  = card.value === 'T' ? '10' : card.value;
  const symbol    = SUIT_SYMBOLS[suit] || '?';
  const isRed     = suit === 'h' || suit === 'd';
  const color     = isRed ? '#c0392b' : '#1a1a1a';

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
      {/* Paper texture */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'repeating-linear-gradient(135deg,transparent,transparent 4px,rgba(0,0,0,0.012) 4px,rgba(0,0,0,0.012) 5px)',
      }} />

      {/* Top-left corner — value only */}
      <div style={{ fontSize: cornerFs, fontWeight: 800, lineHeight: 1.1, zIndex: 1 }}>
        {rawValue}
      </div>

      {/* Center suit — larger */}
      <div style={{ fontSize: centerFs, fontWeight: 700, textAlign: 'center', lineHeight: 1, zIndex: 1 }}>
        {symbol}
      </div>

      {/* Bottom-right corner — value only, rotated */}
      <div style={{ fontSize: cornerFs, fontWeight: 800, lineHeight: 1.1, transform: 'rotate(180deg)', alignSelf: 'flex-end', zIndex: 1 }}>
        {rawValue}
      </div>
    </div>
  );
}
