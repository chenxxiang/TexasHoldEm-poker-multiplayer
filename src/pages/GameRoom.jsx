import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../context/SocketContext';
import Card from '../components/Card';
import { Hand } from 'pokersolver';

const HAND_NAME_MAP = {
  'Royal Flush':    '皇家同花顺',
  'Straight Flush': '同花顺',
  'Four of a Kind': '四条',
  'Full House':     '葫芦',
  'Flush':          '同花',
  'Straight':       '顺子',
  'Three of a Kind':'三条',
  'Two Pair':       '两对',
  'Pair':           '一对',
  'High Card':      '高牌',
};

function convertCardCode(code) {
  if (!code || code === 'hidden') return null;
  let rank = code.slice(0, code.length - 1);
  const suit = code.slice(-1).toLowerCase();
  if (rank === '10' || rank === '0') rank = 'T';
  return rank.toUpperCase() + suit;
}

const PHASE_LABELS = {
  waiting: '等待中', preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌',
};
const AVATARS = ['🐯','🦁','🐻','🐼','🐨','🦊','🐺','🐸','🐮','🐷'];
const SEAT_POS = [
  { x: 50, y: 88 },
  { x: 80, y: 75 },
  { x: 92, y: 50 },
  { x: 80, y: 22 },
  { x: 62, y: 8  },
  { x: 50, y: 5  },
  { x: 38, y: 8  },
  { x: 20, y: 22 },
  { x: 8,  y: 50 },
  { x: 20, y: 75 },
];

function getPositionLabel(playerIndex, dealerIndex, numPlayers) {
  const dist = (playerIndex - dealerIndex + numPlayers) % numPlayers;
  if (dist === 0) return 'D';
  if (dist === 1) return numPlayers === 2 ? 'BB' : 'SB';
  if (dist === 2 && numPlayers > 2) return 'BB';
  if (dist === 3 && numPlayers >= 4) return 'UTG';
  return null;
}

// ── 公共牌翻转组件 ──────────────────────────────────────────
function CommunityCards({ cards }) {
  const [revealed, setRevealed] = useState([]);
  const prevLen = useRef(0);

  useEffect(() => {
    const newLen = cards.length;
    if (newLen > prevLen.current) {
      for (let i = prevLen.current; i < newLen; i++) {
        const delay = (i - prevLen.current) * 700;
        setTimeout(() => setRevealed(r => [...r, i]), delay);
      }
    }
    if (newLen < prevLen.current) setRevealed([]); // 新局重置
    prevLen.current = newLen;
  }, [cards.length]);

  return (
    <div className="flex gap-2 justify-center items-center" style={{ minHeight: 70 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const isFlipped = revealed.includes(i);
        const card = cards[i] || null;
        return (
          <div key={i} style={{ position: 'relative', width: 50, height: 70, perspective: 300 }}>
            {/* 背面 */}
            <div style={{
              position: 'absolute', inset: 0,
              transition: 'transform 0.55s ease',
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              backfaceVisibility: 'hidden',
            }}>
              <BackCard w={50} h={70} />
            </div>
            {/* 正面 */}
            <div style={{
              position: 'absolute', inset: 0,
              transition: 'transform 0.55s ease',
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(0deg)' : 'rotateY(-180deg)',
              backfaceVisibility: 'hidden',
            }}>
              {card ? <Card card={card} size="md" /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BackCard({ w = 50, h = 70 }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'linear-gradient(135deg, #1a3a6e 0%, #1e4a8e 50%, #1a3a6e 100%)',
      border: '1.5px solid #4a7fc1',
      borderRadius: 5,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: w - 8, height: h - 8,
        border: '1px solid #4a7fc166',
        borderRadius: 3,
        backgroundImage: 'repeating-linear-gradient(45deg, #2d5a9e22 0px, #2d5a9e22 2px, transparent 2px, transparent 8px)',
      }} />
    </div>
  );
}

// ── 主页面 ──────────────────────────────────────────────────
export default function GameRoom() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [room, setRoom] = useState(location.state?.room || null);
  const [timerInfo, setTimerInfo] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRaise, setShowRaise] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [rebuyError, setRebuyError] = useState('');
  const [settlementData, setSettlementData] = useState(null);
  const [settlementDeadline, setSettlementDeadline] = useState(null);
  const [settlementCountdown, setSettlementCountdown] = useState(0);
  const [cardReveals, setCardReveals] = useState({});
  const [myReadyStatus, setMyReadyStatus] = useState('pending');

  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);

  const [mySocketId, setMySocketId] = useState(socket.id);
  useEffect(() => {
    const onConnect = () => setMySocketId(socket.id);
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, []);

  useEffect(() => {
    if (roomId) socket.emit('getRoomState', { roomId });
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    const bb = (room.settings?.smallBlind || 5) * 2;
    const minR = room.betSize + bb;
    setRaiseAmount(minR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.betSize]);

  useEffect(() => {
    if (!timerInfo) return;
    setCountdown(timerInfo.duration);
    const iv = setInterval(() => setCountdown(c => (c > 1 ? c - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [timerInfo]);

  useEffect(() => {
    if (!settlementDeadline) { setSettlementCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((settlementDeadline - Date.now()) / 1000));
      setSettlementCountdown(remaining);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [settlementDeadline]);

  useEffect(() => {
    const onUpdate = (payload) => {
      const r = payload?.room ?? payload;
      setRoom(r); setError(''); setShowRaise(false);
      // Clear stale timer when no one can act (all-in runout)
      const canAct = r.players.filter(p => !p.folded && p.chips > 0);
      if (canAct.length === 0) { setTimerInfo(null); setCountdown(0); }
    };
    const onStarted = (payload) => {
      const r = payload?.room ?? payload;
      setRoom(r);
      setMessage('新一局开始！');
      setShowRaise(false);
      setSettlementData(null);
      setSettlementDeadline(null);
      setMyReadyStatus('pending');
      setCardReveals({});
    };
    const onPlayerJoined = ({ room: r }) => setRoom(r);
    const onShowdown = ({ room: r, results, wasMuckWin, settlementDeadline: deadline }) => {
      setRoom(r);
      setSettlementData({ results: results || [], wasMuckWin });
      setSettlementDeadline(deadline);
      setCardReveals({});
      setMyReadyStatus('pending');
      const winners = (results || []).filter(x => x.delta > 0).map(x => x.nickname);
      setMessage(winners.length ? `🏆 ${winners.join('、')} 获胜！` : '');
    };
    const onCardRevealed = ({ socketId, holeCards }) => {
      setCardReveals(prev => ({ ...prev, [socketId]: holeCards }));
    };
    const onPlayerReconnected = ({ nickname }) => setMessage(`${nickname} 重新连线了`);
    const onTimerStarted = (info) => { setTimerInfo(info); };
    const onTimerExtended = ({ socketId }) => {
      setTimerInfo(prev => prev?.socketId === socketId ? { ...prev, hasTimeBank: false } : prev);
    };
    const onTimedOut = ({ socketId, autoAction }) => {
      const p = roomRef.current?.players.find(p => p.socketId === socketId);
      setMessage(`${p?.nickname || '玩家'} 超时 → ${autoAction === 'fold' ? '弃牌' : '过牌'}`);
    };
    const onPlayerLeft = ({ nickname }) => setMessage(`${nickname} 离开了房间`);
    const onActionError = ({ code }) => setError(code === 'INVALID_ACTION' ? '无效操作' : '操作失败');
    const onRebuyError = ({ code }) => {
      const msgs = { CANNOT_REBUY_NOW: '游戏中无法补码', EXCEEDS_REBUY_LIMIT: '超过补码上限' };
      setRebuyError(msgs[code] || '补码失败');
    };
    const onError = ({ code }) => setError(code);

    socket.on('gameStateUpdate', onUpdate);
    socket.on('gameStarted', onStarted);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('showdown', onShowdown);
    socket.on('timerStarted', onTimerStarted);
    socket.on('timerExtended', onTimerExtended);
    socket.on('timedOut', onTimedOut);
    socket.on('playerLeft', onPlayerLeft);
    socket.on('actionError', onActionError);
    socket.on('rebuyError', onRebuyError);
    socket.on('error', onError);
    socket.on('cardRevealed', onCardRevealed);
    socket.on('playerReconnected', onPlayerReconnected);

    return () => {
      socket.off('gameStateUpdate', onUpdate);
      socket.off('gameStarted', onStarted);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('showdown', onShowdown);
      socket.off('timerStarted', onTimerStarted);
      socket.off('timedOut', onTimedOut);
      socket.off('playerLeft', onPlayerLeft);
      socket.off('actionError', onActionError);
      socket.off('rebuyError', onRebuyError);
      socket.off('error', onError);
      socket.off('cardRevealed', onCardRevealed);
      socket.off('playerReconnected', onPlayerReconnected);
    };
  }, []);

  if (!room) {
    return (
      <div className="min-h-screen bg-felt-dark flex flex-col items-center justify-center gap-4">
        <p className="text-gold text-xl">未找到房间</p>
        <button onClick={() => navigate('/')} className="bg-gold text-felt-dark font-bold px-6 py-2 rounded-xl">返回大厅</button>
      </div>
    );
  }

  const me = room.players.find(p => p.socketId === mySocketId);
  const isMyTurn = room.players[room.currentTurnIndex]?.socketId === mySocketId;
  const isHost = room.hostSocketId === mySocketId;
  const toCall = me ? Math.max(0, (room.betSize || 0) - (me.bet || 0)) : 0;
  const canCheck = toCall === 0;
  const maxRaise = me ? me.chips + me.bet : 0;
  const bb = (room.settings?.smallBlind || 5) * 2;
  const minRaise = Math.min(room.betSize + bb, maxRaise);
  const canRaise = maxRaise > room.betSize;
  const actualRaise = Math.max(minRaise, Math.min(raiseAmount, maxRaise));
  const raiseCost = me ? actualRaise - me.bet : 0;

  const sendAction = (action, amount = 0) => {
    setError(''); setShowRaise(false);
    socket.emit('playerAction', { roomId, action, amount });
  };

  const sendReady = () => {
    setMyReadyStatus('ready');
    socket.emit('playerReadyStatus', { roomId, status: 'ready' });
  };
  const sendSpectate = () => {
    setMyReadyStatus('spectating');
    socket.emit('playerReadyStatus', { roomId, status: 'spectating' });
  };
  const sendRevealCards = () => socket.emit('revealCards', { roomId });
  const sendQueueNextHand = () => {
    setMyReadyStatus('queued');
    socket.emit('queueForNextHand', { roomId });
  };

  const handleRebuy = () => {
    setRebuyError('');
    socket.emit('rebuy', { roomId, amount: room.settings.initialChips });
  };

  const showActionButtons = isMyTurn && me && !me.folded && me.chips > 0 && room.phase !== 'showdown' && room.phase !== 'waiting';
  const showRebuyButton = me && room.phase !== 'waiting' && (me.folded || me.chips === 0);

  return (
    <div className="min-h-screen bg-felt-dark text-white flex flex-col">
      {/* 顶部栏 */}
      <div className="bg-felt border-b border-gold/20 px-3 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/')} className="text-gold/50 hover:text-gold text-sm">← 大厅</button>
          <span className="text-gold font-mono font-bold tracking-widest">{roomId}</span>
          <span className="bg-gold/20 text-gold text-xs px-2 py-0.5 rounded-full">{PHASE_LABELS[room.phase]}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gold/70 text-sm">底池 <span className="text-gold font-bold">{room.pot}</span></span>
          {message && <span className="text-yellow-300 text-xs max-w-[160px] truncate">{message}</span>}
          <button onClick={() => setShowScoreboard(s => !s)}
            className="text-xs border border-gold/40 text-gold/70 hover:text-gold px-2 py-0.5 rounded-lg">
            📊
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          {room.phase === 'settlement' || settlementData ? (
            <SettlementScreen
              settlementData={settlementData}
              room={room}
              mySocketId={mySocketId}
              settlementCountdown={settlementCountdown}
              cardReveals={cardReveals}
              myReadyStatus={myReadyStatus}
              onReady={sendReady}
              onSpectate={sendSpectate}
              onRevealCards={sendRevealCards}
              onQueueNextHand={sendQueueNextHand}
            />
          ) : room.phase === 'waiting' ? (
            <WaitingRoom room={room} isHost={isHost} mySocketId={mySocketId} roomId={roomId} />
          ) : (
            <>
              {/* 圆桌区 */}
              <div className="flex-1 relative" style={{ minHeight: 400 }}>
                <PokerTable
                  room={room}
                  mySocketId={mySocketId}
                  timerInfo={timerInfo}
                  countdown={countdown}
                  isMyTurn={isMyTurn}
                  onExtendTime={() => socket.emit('extendTime', { roomId })}
                />
              </div>

              {/* 底部行动区 */}
              <div className="flex-shrink-0 px-3 pb-3 space-y-2">
                {/* 轮次提示 */}
                <div className="text-center">
                  {(() => {
                    const curPlayer = room.players[room.currentTurnIndex];
                    const allInRunout = room.players.filter(p => !p.folded && p.chips > 0).length === 0;
                    if (room.phase === 'showdown' || room.phase === 'waiting') return null;
                    if (isMyTurn && me && !me.folded && me.chips > 0) {
                      return <span className="text-gold font-bold animate-pulse">🎯 该你行动了！</span>;
                    }
                    if (allInRunout) {
                      return <span className="text-yellow-400 text-sm animate-pulse">♠ 自动开牌中...</span>;
                    }
                    if (curPlayer && curPlayer.chips > 0) {
                      return <span className="text-white/50 text-sm">等待 {curPlayer.nickname}...</span>;
                    }
                    return null;
                  })()}
                </div>

                {error && <div className="text-red-400 text-sm text-center bg-red-400/10 rounded-lg py-1.5">{error}</div>}
                {rebuyError && <div className="text-orange-400 text-sm text-center bg-orange-400/10 rounded-lg py-1.5">{rebuyError}</div>}

                {/* 行动按钮（3个主按钮） */}
                {showActionButtons && (
                  <div className="max-w-lg mx-auto space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => sendAction('fold')}
                        className="bg-red-800 hover:bg-red-700 font-bold py-3 rounded-xl transition-colors text-sm">
                        弃牌
                      </button>
                      <button
                        onClick={() => canCheck ? sendAction('check') : sendAction('call')}
                        className="bg-green-700 hover:bg-green-600 font-bold py-3 rounded-xl transition-colors text-sm">
                        {canCheck ? '过牌' : me && me.chips < toCall
                          ? `ALL-IN (${me.chips})`
                          : `跟注 ${toCall}`}
                      </button>
                      <button
                        onClick={() => setShowRaise(r => !r)}
                        disabled={!canRaise || me.chips <= toCall}
                        className={`font-bold py-3 rounded-xl transition-colors text-sm ${showRaise ? 'bg-blue-600' : 'bg-blue-800 hover:bg-blue-700'} disabled:opacity-40`}>
                        加注
                      </button>
                    </div>

                    {/* 加注面板 */}
                    {showRaise && canRaise && (
                      <div className="bg-felt rounded-xl border border-gold/20 p-3 space-y-2">
                        <div className="flex justify-between text-xs text-white/50">
                          <span>加注至</span>
                          <span className="text-gold font-bold">
                            {actualRaise}
                            <span className="text-white/40 font-normal"> (花费 {raiseCost})</span>
                          </span>
                        </div>
                        <input type="range" min={minRaise} max={maxRaise} value={actualRaise}
                          onChange={e => setRaiseAmount(Number(e.target.value))}
                          className="w-full accent-yellow-500" />
                        <div className="flex gap-2">
                          {[2, 3, 4].map(m => {
                            const v = room.betSize * m;
                            return (v > room.betSize && v <= maxRaise)
                              ? <button key={m} onClick={() => setRaiseAmount(v)}
                                  className="text-xs border border-gold/40 text-gold/70 hover:text-gold px-2 py-1 rounded-lg transition-colors">
                                  {m}x
                                </button>
                              : null;
                          })}
                          <button onClick={() => setRaiseAmount(maxRaise)}
                            className="text-xs border border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/20 px-2 py-1 rounded-lg transition-colors">
                            全押
                          </button>
                          <button onClick={() => sendAction('raise', actualRaise)} disabled={raiseCost > me.chips}
                            className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 font-bold py-1.5 rounded-xl text-sm transition-colors">
                            确认加注
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 补码按钮 */}
                {showRebuyButton && (
                  <div className="text-center">
                    <button onClick={handleRebuy}
                      className="bg-orange-700 hover:bg-orange-600 text-white font-bold px-6 py-2 rounded-xl transition-colors text-sm">
                      💰 补码 {room.settings.initialChips} 筹码
                      {me?.rebuyCount > 0 && <span className="ml-1 opacity-70">(已补{me.rebuyCount}次)</span>}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {showScoreboard && <Scoreboard room={room} mySocketId={mySocketId} />}
      </div>
    </div>
  );
}

// ── 圆桌 ─────────────────────────────────────────────────────
function PokerTable({ room, mySocketId, timerInfo, countdown, isMyTurn, onExtendTime }) {
  const n = room.players.length;
  const myIdx = room.players.findIndex(p => p.socketId === mySocketId);
  const orderedPlayers = myIdx >= 0
    ? [...room.players.slice(myIdx), ...room.players.slice(0, myIdx)]
    : room.players;

  return (
    <div className="relative w-full h-full" style={{ minHeight: 400 }}>
      {/* 椭圆桌面 */}
      <div className="absolute" style={{
        left: '18%', top: '8%', width: '64%', height: '70%',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, #2a7a4e 60%, #1a5c38 100%)',
        border: '4px solid #92651a',
        boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.3)',
      }}>
        {/* 公共牌 + 底池 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <CommunityCards cards={room.communityCards} />
          {room.pot > 0 && (
            <div className="text-yellow-300 text-sm font-bold bg-black/30 px-3 py-0.5 rounded-full">
              底池: {room.pot}
            </div>
          )}
          {timerInfo && countdown > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-28 h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${countdown > 20 ? 'bg-green-400' : countdown > 10 ? 'bg-yellow-400' : 'bg-red-500'}`}
                  style={{ width: `${(countdown / timerInfo.duration) * 100}%` }}
                />
              </div>
              <span className="text-white/70 text-xs">{countdown}s</span>
              {timerInfo.hasTimeBank && isMyTurn && (
                <button onClick={onExtendTime}
                  className="text-xs text-gold border border-gold/50 rounded px-1.5 hover:bg-gold/20">
                  +时
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 玩家座位 */}
      {orderedPlayers.map((player, seatPos) => {
        const pos = SEAT_POS[seatPos] || { x: 50, y: 50 };
        const origIdx = (myIdx + seatPos) % n;
        return (
          <PlayerSeat
            key={player.socketId}
            player={player}
            seatPos={seatPos}
            posStyle={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
            isCurrentTurn={room.currentTurnIndex === origIdx}
            isMe={player.socketId === mySocketId}
            posLabel={room.phase !== 'waiting' ? getPositionLabel(origIdx, room.dealerIndex ?? 0, n) : null}
            avatarIdx={player.seatIndex % AVATARS.length}
          />
        );
      })}

    </div>
  );
}

// ── 玩家座位 ─────────────────────────────────────────────────
function PlayerSeat({ player, seatPos, posStyle, isCurrentTurn, isMe, posLabel, avatarIdx }) {
  return (
    <div className="absolute" style={posStyle}>
      <div
        className={`flex flex-col items-center gap-0.5 ${isCurrentTurn ? 'filter drop-shadow-[0_0_10px_rgba(212,175,55,0.9)]' : ''}`}
        style={{ minWidth: 76 }}
      >
        {/* 头像 */}
        <div className="relative">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 ${isCurrentTurn ? 'border-gold' : isMe ? 'border-blue-400' : 'border-white/20'} ${player.folded ? 'opacity-40' : ''}`}
            style={{ background: isMe ? '#1e3a6e' : '#2d2d2d' }}
          >
            {AVATARS[avatarIdx]}
          </div>
          {posLabel && (
            <span className={`absolute -top-1 -right-1 font-bold px-1 rounded text-black ${
              posLabel === 'D' ? 'bg-white' : posLabel === 'SB' ? 'bg-blue-300' : posLabel === 'BB' ? 'bg-yellow-400' : 'bg-gray-300'
            }`} style={{ fontSize: 9 }}>
              {posLabel}
            </span>
          )}
        </div>

        {/* 信息 */}
        <div className={`text-center ${player.folded ? 'opacity-40' : ''}`}>
          <div className="text-xs font-medium leading-tight truncate" style={{ maxWidth: 76 }}>
            {player.nickname}{isMe ? ' (我)' : ''}
          </div>
          <div className="text-gold text-xs font-bold">{player.chips}</div>
          {player.bet > 0 && <div className="text-yellow-300 text-xs">注:{player.bet}</div>}
          {player.status === 'allin' && !player.folded && <span className="text-yellow-400 text-xs font-bold">ALL-IN</span>}
          {player.folded && <span className="text-red-400 text-xs">弃牌</span>}
        </div>

        {/* 手牌 */}
        {seatPos === 0 && isMe ? (
          (player.holeCards || []).length > 0 && (
            <div className="flex gap-1 mt-1">
              {player.holeCards.map((card, i) => <Card key={i} card={card} size="md" />)}
            </div>
          )
        ) : (
          (player.holeCards || []).length > 0 && (
            <div className="flex gap-0.5 mt-0.5">
              {player.holeCards.map((card, i) => <Card key={i} card={card} size="sm" />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── 摊牌覆盖层 ───────────────────────────────────────────────
function ShowdownOverlay({ room }) {
  const winners = room.players.filter(p => p.won > 0);
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
      <div className="bg-black/75 rounded-2xl px-6 py-4 text-center border border-yellow-500/50">
        <p className="text-yellow-300 font-bold text-lg mb-2">🎴 摊牌！</p>
        {winners.map(p => (
          <p key={p.socketId} className="text-gold font-bold">🏆 {p.nickname} +{p.won}</p>
        ))}
        <p className="text-white/40 text-xs mt-2">5秒后自动开始下一局...</p>
      </div>
    </div>
  );
}

// ── 记分牌 ───────────────────────────────────────────────────
function Scoreboard({ room, mySocketId }) {
  const sorted = [...room.players].sort((a, b) => b.chips - a.chips);
  return (
    <div className="w-44 bg-felt border-l border-gold/20 flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-gold/20 text-center">
        <p className="text-gold text-sm font-bold">📊 记分牌</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {sorted.map((p, rank) => (
          <div key={p.socketId}
            className={`rounded-lg px-2 py-1.5 flex items-center justify-between text-xs ${p.socketId === mySocketId ? 'bg-blue-900/40 border border-blue-500/30' : 'bg-felt-dark/60'}`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-bold flex-shrink-0 ${rank === 0 ? 'text-gold' : 'text-white/40'}`}>#{rank + 1}</span>
              <span className="truncate">{p.nickname}</span>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-gold font-bold">{p.chips}</div>
              {(p.raiseCount || 0) > 0 && <div className="text-blue-300" style={{fontSize:9}}>↑{p.raiseCount}次</div>}
              {(p.rebuyCount || 0) > 0 && <div className="text-orange-300" style={{fontSize:9}}>补{p.rebuyCount}次</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-gold/20 text-xs text-white/30 text-center">
        大盲 {(room.settings?.smallBlind || 0) * 2} | 局#{(room.dealerIndex ?? 0) + 1}
      </div>
    </div>
  );
}

// ── 结算屏幕 ─────────────────────────────────────────────────
function SettlementScreen({
  settlementData, room, mySocketId, settlementCountdown,
  cardReveals, myReadyStatus, onReady, onSpectate, onRevealCards, onQueueNextHand
}) {
  const { results = [], wasMuckWin } = settlementData || {};
  const hasRevealed = !!cardReveals[mySocketId];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 overflow-y-auto">
      <div className="bg-felt rounded-2xl p-5 border border-gold/20 w-full max-w-md space-y-4">
        <h2 className="text-gold font-bold text-xl text-center">🃏 本局结算</h2>

        {/* 胜负结果 */}
        <div className="space-y-2">
          {results.map(r => {
            const revealedCards = cardReveals[r.socketId] || r.holeCards || [];
            const player = room.players.find(p => p.socketId === r.socketId);
            return (
              <div key={r.socketId}
                className={`rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${r.delta > 0 ? 'bg-green-900/40 border border-green-500/30' : 'bg-felt-dark/60'}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg flex-shrink-0">
                    {AVATARS[(player?.seatIndex || 0) % AVATARS.length]}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.nickname}{r.socketId === mySocketId ? ' (我)' : ''}
                    </div>
                    {r.handName && (
                      <div className="text-xs text-white/40">{HAND_NAME_MAP[r.handName] || r.handName}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="flex gap-0.5">
                    {revealedCards.map((card, i) =>
                      card === 'hidden'
                        ? <div key={i} className="w-7 h-10 bg-blue-900 border border-blue-500/40 rounded flex items-center justify-center text-white/30 text-sm">?</div>
                        : <Card key={i} card={card} size="sm" />
                    )}
                  </div>
                  <span className={`font-bold text-sm w-12 text-right ${r.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 亮牌按钮 */}
        {!hasRevealed ? (
          <button onClick={onRevealCards}
            className="w-full border border-gold/40 text-gold hover:bg-gold/10 font-medium py-2 rounded-xl text-sm transition-colors">
            亮牌 🂠
          </button>
        ) : (
          <div className="text-center text-white/40 text-xs">已亮牌</div>
        )}

        {/* 玩家状态列表 */}
        <div className="space-y-1">
          <p className="text-white/40 text-xs text-center">玩家状态</p>
          {room.players.map(p => {
            const badge = p.readyStatus === 'ready' ? '🟢 准备'
              : p.readyStatus === 'spectating' ? '👁 观战'
              : p.readyStatus === 'queued' ? '🟡 下局参与'
              : '⏳ 待选';
            return (
              <div key={p.socketId} className="flex items-center justify-between text-xs px-2">
                <span className="text-white/70">{p.nickname}{p.socketId === mySocketId ? ' (我)' : ''}</span>
                <span className="text-white/50">{badge}</span>
              </div>
            );
          })}
        </div>

        {/* 60秒倒计时进度条 */}
        {settlementCountdown > 0 && (
          <div className="space-y-1">
            <div className="h-1 bg-black/30 rounded-full overflow-hidden">
              <div className="h-full bg-gold transition-all duration-1000"
                style={{ width: `${(settlementCountdown / 60) * 100}%` }} />
            </div>
            <p className="text-white/30 text-xs text-center">{settlementCountdown}s 后未选视为观战</p>
          </div>
        )}

        {/* 行动按钮 */}
        {myReadyStatus === 'pending' && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onReady}
              className="bg-green-700 hover:bg-green-600 font-bold py-3 rounded-xl transition-colors text-sm">
              ✅ 准备
            </button>
            <button onClick={onSpectate}
              className="bg-gray-700 hover:bg-gray-600 font-bold py-3 rounded-xl transition-colors text-sm">
              👁 观战
            </button>
          </div>
        )}
        {myReadyStatus === 'spectating' && (
          <button onClick={onQueueNextHand}
            className="w-full border border-gold/40 text-gold hover:bg-gold/10 font-bold py-3 rounded-xl transition-colors text-sm">
            下一局参与
          </button>
        )}
        {(myReadyStatus === 'ready' || myReadyStatus === 'queued') && (
          <div className="text-center py-1">
            <span className="text-green-400 font-bold text-sm">
              {myReadyStatus === 'ready' ? '✅ 已准备，等待其他玩家...' : '🟡 下局将参与'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 等待室 ───────────────────────────────────────────────────
function WaitingRoom({ room, isHost, mySocketId, roomId }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-felt rounded-2xl p-6 border border-white/10 w-full max-w-sm">
        <div className="text-center mb-5">
          <p className="text-gold/50 text-sm mb-1">分享房间号给朋友</p>
          <p className="text-4xl font-bold text-gold tracking-[0.2em] font-mono">{room.roomId}</p>
        </div>
        <div className="space-y-1.5 mb-5">
          {room.players.map(p => (
            <div key={p.socketId} className="flex items-center justify-between bg-felt-dark rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span>{AVATARS[p.seatIndex % AVATARS.length]}</span>
                <span className="text-sm">{p.nickname}</span>
                {p.socketId === mySocketId && <span className="text-gold text-xs">(我)</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gold/60 text-xs">{p.chips}</span>
                {p.socketId === room.hostSocketId && <span className="text-xs text-gold bg-gold/20 px-1.5 py-0.5 rounded">房主</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-white/50 text-center bg-felt-dark rounded-xl p-3 mb-4">
          <div>小盲<br /><span className="text-gold font-bold text-sm">{room.settings.smallBlind}</span></div>
          <div>大盲<br /><span className="text-gold font-bold text-sm">{room.settings.smallBlind * 2}</span></div>
          <div>初始筹码<br /><span className="text-gold font-bold text-sm">{room.settings.initialChips}</span></div>
        </div>
        {isHost ? (
          <button onClick={() => socket.emit('startGame', { roomId })}
            disabled={room.players.length < 2}
            className="w-full bg-gold hover:bg-gold-light disabled:opacity-40 text-felt-dark font-bold py-3 rounded-xl transition-colors">
            {room.players.length < 2 ? `等待更多玩家 (${room.players.length}/2)` : '开始游戏'}
          </button>
        ) : (
          <div className="text-center text-white/40 py-2 text-sm">等待房主开始游戏...</div>
        )}
      </div>
    </div>
  );
}
