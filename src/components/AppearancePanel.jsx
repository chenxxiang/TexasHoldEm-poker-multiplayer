import Card from './Card';
import { DECKS } from '../data/decks';
import { BACKGROUNDS } from '../data/backgrounds';
import { HEROES } from '../data/heroes';
import { useAppearance } from '../context/AppearanceContext';

// The one place a player changes how the table looks to them. Card skin and background are
// local and take effect immediately; the hero is the exception — it goes to the server and
// everyone sees it, and no two players in a room may hold the same one.
//
// Drop the hero section (`heroes={false}`) where there is already a dedicated hero picker.

const GOLD = '#f0d060';

export default function AppearancePanel({
  onClose,
  heroes = true,
  players = [],
  mySocketId,
  myHeroId,
  onSelectHero,
}) {
  const { deck, background, setDeckId, setBgId } = useAppearance();

  const claimedByOthers = new Set(
    players.filter(p => p.heroId && p.socketId !== mySocketId).map(p => p.heroId)
  );

  return (
    // fixed, not absolute: this panel opens both inside the table's positioned container and
    // straight onto the home page, which has no positioned ancestor to anchor to
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.92)' }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', inset: 0, margin: '24px 16px',
          display: 'flex', flexDirection: 'column',
          background: '#111c30', borderRadius: 22,
          border: `1px solid ${GOLD}38`, overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <h3 style={{ color: GOLD, fontWeight: 700, fontSize: 18, margin: 0 }}>⚙️ 外观</h3>
          <button onClick={onClose} style={{
            color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none',
            fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0,
          }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 20px' }}>
          {heroes && (
            <Section title="英雄" note="别人选过的不能再选，换了所有人都会看到">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
                {HEROES.map(hero => {
                  const taken = claimedByOthers.has(hero.id);
                  const active = hero.id === myHeroId;
                  return (
                    <button
                      key={hero.id}
                      onClick={() => !taken && onSelectHero(hero.id)}
                      disabled={taken}
                      title={taken ? '已被其他玩家选走' : hero.name}
                      style={{
                        ...tileStyle(active),
                        padding: '8px 2px',
                        cursor: taken ? 'not-allowed' : 'pointer',
                        opacity: taken ? 0.3 : 1,
                      }}
                    >
                      <img src={hero.img} alt={hero.name} style={{
                        width: 46, height: 46, borderRadius: '50%', objectFit: 'cover',
                        border: `2px solid ${active ? GOLD : 'transparent'}`,
                      }} />
                      <span style={labelStyle(active)}>{hero.name}</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="卡牌" note="只有你自己看得到">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {DECKS.map(d => {
                const active = d.id === deck.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => !d.unavailable && setDeckId(d.id)}
                    disabled={d.unavailable}
                    style={{
                      ...tileStyle(active),
                      padding: '10px 4px',
                      cursor: d.unavailable ? 'not-allowed' : 'pointer',
                      opacity: d.unavailable ? 0.35 : 1,
                    }}
                  >
                    {/* a real card from that skin, so the preview cannot drift from the deck */}
                    <Card card="As" size="md" deckId={d.id} />
                    <span style={labelStyle(active)}>{d.unavailable ? `${d.name}·待补图` : d.name}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="背景" note="只有你自己看得到">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {BACKGROUNDS.map(b => {
                const active = b.id === background.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setBgId(b.id)}
                    style={{ ...tileStyle(active), padding: '10px 4px' }}
                  >
                    <img src={b.thumb} alt={b.name} style={{
                      width: 50, height: 70, objectFit: 'cover', borderRadius: 6,
                      border: `2px solid ${active ? GOLD : 'rgba(255,255,255,0.12)'}`,
                    }} />
                    <span style={labelStyle(active)}>{b.name}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, note, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>{title}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{note}</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      </div>
      {children}
    </div>
  );
}

function tileStyle(active) {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    background: active ? 'rgba(240,208,96,0.12)' : 'rgba(255,255,255,0.04)',
    border: `1.5px solid ${active ? GOLD : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 14,
    cursor: 'pointer',
  };
}

function labelStyle(active) {
  return {
    color: active ? GOLD : '#cbd5e1',
    fontSize: 11, fontWeight: 600,
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}
