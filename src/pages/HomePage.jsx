import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../context/SocketContext';

const THEME_OPTIONS = [
  { id: 'macau', name: '澳门风云', icon: '🃏', desc: '经典赌城风格', accent: '#f0d060', previewBg: 'linear-gradient(135deg,#0a1a08 0%,#1a3a14 50%,#2d5a20 100%)' },
  { id: 'xianfeng', name: '仙风道骨', icon: '⛩️', desc: '仙侠江湖风格', accent: '#c4b5fd', previewBg: 'linear-gradient(135deg,#060a1e 0%,#0d1540 50%,#1a1a6e 100%)' },
];

const TITLE_TYPE_STYLE = {
  '尊号': { bg: '#7c3aed', color: '#fff' },
  '仙号': { bg: '#db2877', color: '#fff' },
  '道号': { bg: '#0d9488', color: '#fff' },
};

const HERO_SEASONS = [
  {
    season: 'S1',
    heroes: [
      { id: '保龙大帝',        name: '天龙',  img: '/heroes/保龙大帝.png',        title: '苍穹龙尊', titleType: '尊号', desc: '朝翔九霄，镇压四方，龙威震天地。' },
      { id: '撸哥',           name: '卢震',  img: '/heroes/撸哥.png',            title: '雷渊震尊', titleType: '尊号', desc: '雷法通玄，震慑八荒，一声轰鸣动九渊。' },
      { id: '陈少钧',          name: '陈少钧', img: '/heroes/陈少钧.png',          title: '玉衡天君', titleType: '尊号', desc: '少年持衡，权衡天地，执掌乾坤正道。' },
      { id: '翔总',            name: '陈翔',  img: '/heroes/翔总.png',            title: '御风剑仙', titleType: '仙号', desc: '踏剑御风，凌空而翔，剑气贯日月。' },
      { id: '思婷',            name: '思婷',  img: '/heroes/思婷.png',            title: '霜华仙子', titleType: '仙号', desc: '思若幽兰，姿若霜华，清冷绝尘世间。' },
      { id: '标桑',            name: '阿标',  img: '/heroes/阿标.png',            title: '玄风游客', titleType: '道号', desc: '来去无踪，身似浮云，随风而游四海。' },
      { id: '大胖',            name: '大胖',  img: '/heroes/大胖.png',            title: '圆满道君', titleType: '道号', desc: '体魄浑圆，功德圆满，福泽天下苍生。' },
      { id: '韬少',            name: '文韬',  img: '/heroes/韬少.png',            title: '藏锋散人', titleType: '道号', desc: '韬光养晦，文蕴深藏，一朝出鞘惊天地。' },
      { id: '大傻(美少女形态)', name: '大傻',  img: '/heroes/大傻(美少女形态).png', title: '混沌真人', titleType: '道号', desc: '大智若愚，混沌藏道，傻中自有乾坤。' },
    ],
  },
  {
    season: 'S2',
    heroes: [
      { id: '徐P',   name: '徐P',   img: '/heroes/徐P.png' },
      { id: '牢丁',  name: '牢丁',  img: '/heroes/牢丁.png' },
      { id: '？？',  name: '？？',  img: '/heroes/？？.png' },
      { id: '？？？', name: '？？？', img: '/heroes/？？？.png' },
    ],
  },
];

const SEASON_COLORS = { S1: '#f0d060', S2: '#a78bfa' };

function HeroPicker({ selectedHeroId, onSelect, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(92vw, 420px)', maxHeight: '80vh',
          background: '#111c30', borderRadius: 22,
          border: '1px solid rgba(240,208,96,0.22)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <h3 style={{ color: '#f0d060', fontWeight: 700, fontSize: 18, margin: 0 }}>🦸 选择你的英雄</h3>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Scrollable list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {HERO_SEASONS.map(({ season, heroes }) => (
            <div key={season} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  background: SEASON_COLORS[season], color: '#0a0f1a',
                  fontWeight: 900, fontSize: 11, padding: '2px 10px', borderRadius: 8,
                }}>{season}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>

              {season === 'S1' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heroes.map(hero => {
                    const isSelected = hero.id === selectedHeroId;
                    const ts = TITLE_TYPE_STYLE[hero.titleType] || { bg: '#374151', color: '#fff' };
                    return (
                      <button
                        key={hero.id}
                        onClick={() => onSelect(hero.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          background: isSelected ? 'rgba(240,208,96,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${isSelected ? '#f0d060' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 16, padding: '10px 14px',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                      >
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <img src={hero.img} alt={hero.name} style={{
                            width: 68, height: 68, borderRadius: '50%', objectFit: 'cover',
                            border: `2.5px solid ${isSelected ? '#f0d060' : 'rgba(255,255,255,0.2)'}`,
                          }} />
                          {isSelected && (
                            <div style={{
                              position: 'absolute', bottom: 0, right: 0,
                              width: 20, height: 20, borderRadius: '50%',
                              background: '#f0d060', color: '#000',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 900, border: '2px solid #111c30',
                            }}>✓</div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ color: isSelected ? '#f0d060' : '#fff', fontWeight: 700, fontSize: 15 }}>{hero.name}</span>
                            {hero.title && <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800, fontSize: 14 }}>{hero.title}</span>}
                            {hero.titleType && (
                              <span style={{
                                background: ts.bg, color: ts.color,
                                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, flexShrink: 0,
                              }}>{hero.titleType}</span>
                            )}
                          </div>
                          {hero.desc && (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 1.5 }}>{hero.desc}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {heroes.map(hero => {
                    const isSelected = hero.id === selectedHeroId;
                    return (
                      <button
                        key={hero.id}
                        onClick={() => onSelect(hero.id)}
                        style={{
                          background: isSelected ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.06)',
                          border: `2px solid ${isSelected ? '#a78bfa' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: 14, padding: '10px 4px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        }}
                      >
                        <div style={{ position: 'relative', width: 62, height: 62 }}>
                          <img src={hero.img} alt={hero.name} style={{
                            width: 62, height: 62, borderRadius: '50%', objectFit: 'cover',
                            border: `2.5px solid ${isSelected ? '#a78bfa' : 'transparent'}`,
                          }} />
                          {isSelected && (
                            <div style={{
                              position: 'absolute', bottom: -2, right: -2,
                              width: 18, height: 18, borderRadius: '50%',
                              background: '#a78bfa', color: '#000',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 900,
                            }}>✓</div>
                          )}
                        </div>
                        <span style={{ color: isSelected ? '#a78bfa' : '#e2e8f0', fontSize: 12, fontWeight: 600 }}>{hero.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('join');
  const [selectedHeroId, setSelectedHeroId] = useState(() => localStorage.getItem('poker_hero') || '');
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [maxRebuy, setMaxRebuy] = useState(1000);
  const [actionTime, setActionTime] = useState(20);
  const [theme, setTheme] = useState('macau');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedHero = HERO_SEASONS.flatMap(s => s.heroes).find(h => h.id === selectedHeroId) || null;

  useEffect(() => {
    const onRoomCreated = ({ roomId, room }) => {
      navigate(`/room/${roomId}`, { state: { room } });
    };
    const onJoinedRoom = ({ room }) => {
      navigate(`/room/${room.roomId}`, { state: { room } });
    };
    const onJoinError = ({ code }) => {
      const msgs = {
        ROOM_NOT_FOUND: '房间不存在',
        ROOM_FULL: '房间已满（最多10人）',
        GAME_IN_PROGRESS: '游戏已开始，无法加入',
      };
      setError(msgs[code] || `加入失败: ${code}`);
      setLoading(false);
    };

    socket.on('roomCreated', onRoomCreated);
    socket.on('joinedRoom', onJoinedRoom);
    socket.on('joinError', onJoinError);
    return () => {
      socket.off('roomCreated', onRoomCreated);
      socket.off('joinedRoom', onJoinedRoom);
      socket.off('joinError', onJoinError);
    };
  }, [navigate]);

  const handleSelectHero = (heroId) => {
    setSelectedHeroId(heroId);
    localStorage.setItem('poker_hero', heroId);
    setShowHeroPicker(false);
  };

  const handleCreate = () => {
    const nickname = selectedHero?.name || '';
    if (!nickname) { setError('请先选择一位英雄'); return; }
    if (initialChips < 100) { setError('初始筹码至少100'); return; }
    if (smallBlind < 1) { setError('小盲注至少1'); return; }
    setError('');
    setLoading(true);
    localStorage.setItem('poker_nickname', nickname);
    socket.emit('createRoom', {
      nickname,
      settings: { initialChips, smallBlind, maxRebuyAmount: maxRebuy, actionTime, theme },
    });
  };

  const handleJoin = () => {
    const nickname = selectedHero?.name || '';
    if (!nickname) { setError('请先选择一位英雄'); return; }
    if (!roomCode.trim()) { setError('请输入房间号'); return; }
    setError('');
    setLoading(true);
    localStorage.setItem('poker_nickname', nickname);
    socket.emit('joinRoom', {
      roomId: roomCode.trim().toUpperCase(),
      nickname,
    });
  };

  const inputCls = 'w-full bg-felt-dark border border-gold/30 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-gold transition-colors';

  return (
    <div className="min-h-screen bg-felt-dark flex items-center justify-center p-4">
      <div className="bg-felt rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gold/20">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">♠♥♦♣</div>
          <h1 className="text-3xl font-bold text-gold">CX Game</h1>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-felt-dark rounded-xl p-1 gap-1">
          {['join', 'create'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setLoading(false); }}
              className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                tab === t
                  ? 'bg-gold text-felt-dark shadow-md'
                  : 'text-gold/60 hover:text-gold'
              }`}
            >
              {t === 'join' ? '加入房间' : '创建房间'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {/* Hero select button */}
          <button
            onClick={() => setShowHeroPicker(true)}
            style={{
              width: '100%', padding: '10px 16px', borderRadius: 14, cursor: 'pointer',
              background: selectedHero ? 'rgba(240,208,96,0.1)' : 'rgba(59,130,246,0.14)',
              border: `1.5px solid ${selectedHero ? 'rgba(240,208,96,0.45)' : 'rgba(59,130,246,0.4)'}`,
              color: selectedHero ? '#f0d060' : '#93c5fd',
              fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            {selectedHero ? (
              <>
                <img src={selectedHero.img} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                <span>{selectedHero.name}</span>
                {selectedHero.title && selectedHero.titleType && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: TITLE_TYPE_STYLE[selectedHero.titleType]?.bg,
                    color: TITLE_TYPE_STYLE[selectedHero.titleType]?.color,
                    borderRadius: 5, padding: '1px 6px',
                  }}>{selectedHero.title}</span>
                )}
                <span style={{ fontSize: 12, opacity: 0.6, fontWeight: 400 }}>· 更换英雄</span>
              </>
            ) : '🦸 选择你的英雄'}
          </button>

          {tab === 'join' ? (
            <>
              <input
                className={`${inputCls} uppercase tracking-widest font-mono`}
                placeholder="房间号 (如: ABC123)"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-felt-dark font-bold py-3 rounded-xl transition-colors shadow-lg"
              >
                {loading ? '加入中...' : '加入房间'}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gold/50 text-xs block mb-1">初始筹码</label>
                  <input type="number" className={inputCls} value={initialChips} min={100}
                    onChange={e => setInitialChips(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-gold/50 text-xs block mb-1">小盲注</label>
                  <input type="number" className={inputCls} value={smallBlind} min={1}
                    onChange={e => setSmallBlind(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-gold/50 text-xs block mb-1">最大补码</label>
                  <input type="number" className={inputCls} value={maxRebuy} min={0}
                    onChange={e => setMaxRebuy(Number(e.target.value))} />
                </div>
                <div>
                  <label className="text-gold/50 text-xs block mb-1">行动时限（秒）</label>
                  <input type="number" className={inputCls} value={actionTime} min={5} max={120}
                    onChange={e => setActionTime(Number(e.target.value))} />
                </div>
              </div>
              <p className="text-gold/40 text-xs text-center">
                大盲注 {smallBlind * 2} | 初始筹码 {initialChips} | 时限 {actionTime}s
              </p>

              {/* Theme picker */}
              <div>
                <p style={{ color: 'rgba(240,208,96,0.5)', fontSize: 12, marginBottom: 8 }}>选择主题</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {THEME_OPTIONS.map(t => {
                    const selected = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        style={{
                          background: selected ? `${t.previewBg}` : 'rgba(255,255,255,0.04)',
                          border: `2px solid ${selected ? t.accent : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 14, padding: '14px 8px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                          transition: 'all 0.15s', position: 'relative',
                          boxShadow: selected ? `0 0 14px ${t.accent}40` : 'none',
                        }}
                      >
                        {selected && (
                          <div style={{
                            position: 'absolute', top: 6, right: 8,
                            width: 16, height: 16, borderRadius: '50%',
                            background: t.accent, color: '#000',
                            fontSize: 10, fontWeight: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>✓</div>
                        )}
                        <span style={{ fontSize: 30 }}>{t.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: selected ? t.accent : 'rgba(255,255,255,0.8)' }}>
                          {t.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{t.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-felt-dark font-bold py-3 rounded-xl transition-colors shadow-lg"
              >
                {loading ? '创建中...' : '创建房间'}
              </button>
            </>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-400/10 rounded-lg py-2">{error}</p>
          )}
        </div>
      </div>

      {showHeroPicker && (
        <HeroPicker
          selectedHeroId={selectedHeroId}
          onSelect={handleSelectHero}
          onClose={() => setShowHeroPicker(false)}
        />
      )}
    </div>
  );
}
