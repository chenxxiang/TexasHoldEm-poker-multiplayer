import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../context/SocketContext';

export default function HomePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('join');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [maxRebuy, setMaxRebuy] = useState(1000);
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
    socket.emit('createRoom', {
      nickname: nickname.trim(),
      settings: { initialChips, smallBlind, maxRebuyAmount: maxRebuy },
    });
  };

  const handleJoin = () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    if (!roomCode.trim()) { setError('请输入房间号'); return; }
    setError('');
    setLoading(true);
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
          <h1 className="text-3xl font-bold text-gold">德州扑克</h1>
          <p className="text-gold/50 text-sm mt-1">Texas Hold'em</p>
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-gold/50 text-xs block mb-1">初始筹码</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={initialChips}
                    min={100}
                    onChange={e => setInitialChips(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-gold/50 text-xs block mb-1">小盲注</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={smallBlind}
                    min={1}
                    onChange={e => setSmallBlind(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-gold/50 text-xs block mb-1">最大补码</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={maxRebuy}
                    min={0}
                    onChange={e => setMaxRebuy(Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-gold/40 text-xs text-center">
                大盲注 {smallBlind * 2} | 初始筹码 {initialChips}
              </p>
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
