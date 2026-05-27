const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

export default function Card({ card, size = 'md' }) {
  const w = size === 'sm' ? 34 : 50;
  const h = size === 'sm' ? 48 : 70;
  const cornerFs = size === 'sm' ? 9 : 11;
  const centerFs = size === 'sm' ? 14 : 20;

  if (!card || card === 'hidden') {
    return (
      <div
        style={{
          width: w, height: h,
          background: 'linear-gradient(135deg,#1e3a6e,#2d5a9e)',
          border: '1.5px solid #4a7fc1',
          borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#4a7fc1', fontSize: centerFs, userSelect: 'none', flexShrink: 0,
        }}
      >
        ★
      </div>
    );
  }

  const suit = card.code.slice(-1);
  const rawValue = card.value === 'T' ? '10' : card.value;
  const symbol = SUIT_SYMBOLS[suit] || '?';
  const isRed = suit === 'h' || suit === 'd';
  const color = isRed ? '#dc2626' : '#1a1a1a';

  return (
    <div
      style={{
        width: w, height: h,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 5,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '2px 3px',
        color,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Top-left */}
      <div style={{ fontSize: cornerFs, fontWeight: 700, lineHeight: 1.1 }}>
        <div>{rawValue}</div>
        <div style={{ fontSize: cornerFs - 1 }}>{symbol}</div>
      </div>
      {/* Center suit */}
      <div style={{ fontSize: centerFs, fontWeight: 700, textAlign: 'center', lineHeight: 1 }}>
        {symbol}
      </div>
      {/* Bottom-right rotated */}
      <div style={{ fontSize: cornerFs, fontWeight: 700, lineHeight: 1.1, transform: 'rotate(180deg)', alignSelf: 'flex-end' }}>
        <div>{rawValue}</div>
        <div style={{ fontSize: cornerFs - 1 }}>{symbol}</div>
      </div>
    </div>
  );
}
