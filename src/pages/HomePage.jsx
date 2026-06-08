import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../context/SocketContext';

const THEME_OPTIONS = [
  { id: 'macau', name: '澳门风云', icon: '🃏', desc: '经典赌城风格', accent: '#f0d060', previewBg: 'linear-gradient(135deg,#0a1a08 0%,#1a3a14 50%,#2d5a20 100%)' },
  { id: 'xianfeng', name: '仙风道骨', icon: '⛩️', desc: '仙侠江湖风格', accent: '#c4b5fd', previewBg: 'linear-gradient(135deg,#060a1e 0%,#0d1540 50%,#1a1a6e 100%)' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('join');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [maxRebuy, setMaxRebuy] = useState(1000);
  const [actionTime, setActionTime] = useState(20);
  const [theme, setTheme] = useState('macau');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleCreate = () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    if (initialChips < 100) { setError('初始筹码至少100'); return; }
    if (smallBlind < 1) { setError('小盲注至少1'); return; }
    setError('');
    setLoading(true);
    localStorage.setItem('poker_nickname', nickname.trim());
    socket.emit('createRoom', {
      nickname: nickname.trim(),
      settings: { initialChips, smallBlind, maxRebuyAmount: maxRebuy, actionTime, theme },
    });
  };

  const handleJoin = () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    if (!roomCode.trim()) { setError('请输入房间号'); return; }
    setError('');
    setLoading(true);
    localStorage.setItem('poker_nickname', nickname.trim());
    socket.emit('joinRoom', {
      roomId: roomCode.trim().toUpperCase(),
      nickname: nickname.trim(),
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
          <input
            className={inputCls}
            placeholder="你的昵称"
            value={nickname}
            maxLength={16}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (tab === 'join' ? handleJoin() : handleCreate())}
          />

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
    </div>
  );
}
