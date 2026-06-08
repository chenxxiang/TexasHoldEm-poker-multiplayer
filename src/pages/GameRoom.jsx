import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../context/SocketContext';
import Card from '../components/Card';
import { playActionSound } from '../helpers/sounds';
import { Hand } from 'pokersolver';

// ── Speech synthesis: pre-load voices for mobile (Huawei/Android) ──
let _cachedVoice = null;

function _loadVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  _cachedVoice =
    voices.find(v => v.lang === 'zh-CN') ||
    voices.find(v => v.lang.startsWith('zh')) ||
    voices[0] ||
    null;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.addEventListener('voiceschanged', _loadVoice);
  _loadVoice();
}

function speakText(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (synth.paused) synth.resume();
  if (synth.speaking) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.05;
  if (_cachedVoice) u.voice = _cachedVoice;
  synth.speak(u);
}

const TAUNT_EMOJIS = ['🤣','😤','💀','🔥','🤡','👎','😎','🐔','😱','🙄','💩','🫵'];
const TAUNT_VOICES = [
  '哎哟，牌技还不如我奶奶',
  '就这？就这！',
  '你是来学习的吧',
  '让我先教你怎么打牌',
  '菜鸡互啄，我是王者',
  '下次别来了',
  '哈哈哈哈，笑死我了',
  '摊牌了，我确实是高手',
];

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

const TITLE_TYPE_STYLE = {
  '尊号': { bg: '#7c3aed', color: '#fff' },
  '仙号': { bg: '#db2777', color: '#fff' },
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

const HEROES = HERO_SEASONS.flatMap(s => s.heroes);

function getPlayerHero(player) {
  if (player.heroId) {
    const found = HEROES.find(h => h.id === player.heroId);
    if (found) return found;
  }
  return HEROES[player.seatIndex % HEROES.length];
}

// Dynamic seat positions based on player count (i=0 = me at bottom center, others clockwise)
function getSeatPositions(n) {
  const cx = 50, cy = 42, rx = 42, ry = 24;
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.PI / 2 + (2 * Math.PI * i / n);
    return {
      x: Math.max(8, Math.min(92, Math.round(cx + rx * Math.cos(angle)))),
      y: Math.max(16, Math.min(68, Math.round(cy + ry * Math.sin(angle)))),
    };
  });
}

function getPositionLabel(playerIndex, dealerIndex, numPlayers) {
  const dist = (playerIndex - dealerIndex + numPlayers) % numPlayers;
  if (dist === 0) return 'D';
  if (dist === 1) return numPlayers === 2 ? 'BB' : 'SB';
  if (dist === 2 && numPlayers > 2) return 'BB';
  if (dist === 3 && numPlayers >= 4) return 'UTG';
  return null;
}

// ── Community cards with flip animation ────────────────────────
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
    if (newLen < prevLen.current) setRevealed([]);
    prevLen.current = newLen;
  }, [cards.length]);

  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const isFlipped = revealed.includes(i);
        const card = cards[i] || null;
        return (
          <div key={i} style={{ position: 'relative', width: 50, height: 70, perspective: 300, flexShrink: 0 }}>
            <div style={{
              position: 'absolute', inset: 0,
              transition: 'transform 0.55s ease',
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              backfaceVisibility: 'hidden',
            }}>
              <Card card="hidden" size="md" />
            </div>
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

// ── Main component ─────────────────────────────────────────────
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
  const [raiseInputValue, setRaiseInputValue] = useState('');
  const [raiseError, setRaiseError] = useState('');
  const [showRaise, setShowRaise] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [handHistory, setHandHistory] = useState([]);
  const [rebuyError, setRebuyError] = useState('');
  const [settlementData, setSettlementData] = useState(null);
  const [winAnimating, setWinAnimating] = useState(false);
  const [settlementDeadline, setSettlementDeadline] = useState(null);
  const [settlementCountdown, setSettlementCountdown] = useState(0);
  const [cardReveals, setCardReveals] = useState({});
  const [tauntBubbles, setTauntBubbles] = useState({});
  const [actionBadges, setActionBadges] = useState({});
  const [raisePopups, setRaisePopups] = useState({});
  const [showTauntPicker, setShowTauntPicker] = useState(false);
  const [tauntTab, setTauntTab] = useState('emoji');

  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);
  const pendingSpeechRef = useRef(null);

  // Auto-clear floating messages after 3 s
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const [mySocketId, setMySocketId] = useState(socket.id);
  const myNicknameRef = useRef(localStorage.getItem('poker_nickname') || '');

  // me must be defined before any useEffect that references it
  const me = room?.players?.find(p => p.socketId === mySocketId);

  // Keep nickname ref + localStorage in sync
  useEffect(() => {
    if (me?.nickname && myNicknameRef.current !== me.nickname) {
      myNicknameRef.current = me.nickname;
      localStorage.setItem('poker_nickname', me.nickname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.nickname]);

  useEffect(() => {
    const onConnect = () => {
      setMySocketId(socket.id);
      // Re-join room after socket reconnect so server knows our new socketId
      const nick = myNicknameRef.current;
      if (nick && roomId) socket.emit('joinRoom', { roomId, nickname: nick });
    };
    socket.on('connect', onConnect);
    return () => socket.off('connect', onConnect);
  }, [roomId]);

  // Hand hint — must be before any conditional return
  const myHandHint = useMemo(() => {
    if (!me?.holeCards || me.holeCards.length < 2) return null;
    try {
      const allRaw = [...me.holeCards, ...(room?.communityCards || [])];
      const all = allRaw
        .map(c => convertCardCode(typeof c === 'string' ? c : c?.code))
        .filter(Boolean);
      if (all.length < 2) return null;
      const hand = Hand.solve(all);
      return HAND_NAME_MAP[hand.name] || hand.name;
    } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.holeCards, room?.communityCards]);

  useEffect(() => {
    if (roomId) socket.emit('getRoomState', { roomId });
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    const bb = (room.settings?.smallBlind || 5) * 2;
    setRaiseAmount(room.betSize + bb);
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
    const tick = () => setSettlementCountdown(Math.max(0, Math.ceil((settlementDeadline - Date.now()) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [settlementDeadline]);

  useEffect(() => {
    const onUpdate = (payload) => {
      const r = payload?.room ?? payload;
      setRoom(r); setError(''); setShowRaise(false);
      const canAct = r.players.filter(p => !p.folded && p.chips > 0);
      if (canAct.length === 0) { setTimerInfo(null); setCountdown(0); }
      if (payload.lastAction) {
        const { socketId, action, amount } = payload.lastAction;
        if (socketId !== socket.id) playActionSound(action);
        const key = Date.now();
        setActionBadges(prev => ({ ...prev, [socketId]: { action, amount, key } }));
        setTimeout(() => {
          setActionBadges(prev => {
            const next = { ...prev };
            if (next[socketId]?.key === key) delete next[socketId];
            return next;
          });
        }, 1500);
        if (action === 'raise' || action === 'allin') {
          setRaisePopups(prev => ({ ...prev, [socketId]: { amount, action, key } }));
          setTimeout(() => {
            setRaisePopups(prev => {
              const next = { ...prev };
              if (next[socketId]?.key === key) delete next[socketId];
              return next;
            });
          }, 1300);
        }
      }
    };
    const onStarted = (payload) => {
      const r = payload?.room ?? payload;
      setRoom(r);
      setMessage('新一局开始！');
      setShowRaise(false);
      setSettlementData(null);
      setSettlementDeadline(null);
      setCardReveals({});
      setRaisePopups({});
    };
    const onPlayerJoined = ({ room: r }) => setRoom(r);
    const onHandHistory = ({ history }) => setHandHistory(history || []);
    const onShowdown = ({ room: r, results, wasMuckWin, settlementDeadline: deadline, potBreakdown, isReconnect, actionLog }) => {
      setRoom(r);
      setSettlementData({ results: results || [], wasMuckWin, actionLog: actionLog || [], potBreakdown: potBreakdown || [] });
      setSettlementDeadline(deadline);
      setCardReveals({});
      setMessage('');
      if (!isReconnect) {
        setWinAnimating(true);
        setTimeout(() => setWinAnimating(false), 1000);
      }
    };
    const onJoinedRoom = ({ room: r }) => {
      // Reconnect path: server will follow up with showdown event if in settlement
      setRoom(r);
    };
    const onCardRevealed = ({ socketId, holeCards }) =>
      setCardReveals(prev => ({ ...prev, [socketId]: holeCards }));
    const onPlayerReconnected = ({ nickname }) => setMessage(`${nickname} 重新连线了`);
    const onTimerStarted = (info) => setTimerInfo(info);
    const onTimerExtended = ({ socketId }) =>
      setTimerInfo(prev => prev?.socketId === socketId ? { ...prev, hasTimeBank: false } : prev);
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

    const onPlayerTaunt = ({ socketId, type, payload }) => {
      if (type === 'voice' && socketId !== socket.id) {
        if (navigator.maxTouchPoints > 0) {
          // Mobile: speech blocked outside user gesture — queue for next touch
          pendingSpeechRef.current = payload;
          const release = () => {
            if (pendingSpeechRef.current) {
              speakText(pendingSpeechRef.current);
              pendingSpeechRef.current = null;
            }
            document.removeEventListener('touchstart', release);
            document.removeEventListener('click', release);
          };
          document.addEventListener('touchstart', release, { once: true, passive: true });
          document.addEventListener('click', release, { once: true });
        } else {
          // Desktop: direct play allowed (user gesture policy not enforced for speech)
          try { speakText(payload); } catch {}
        }
      }
      const key = Date.now() + Math.random();
      setTauntBubbles(prev => ({ ...prev, [socketId]: { type, payload, key } }));
      setTimeout(() => {
        setTauntBubbles(prev => {
          const next = { ...prev };
          if (next[socketId]?.key === key) delete next[socketId];
          return next;
        });
      }, 3500);
    };

    socket.on('gameStateUpdate', onUpdate);
    socket.on('gameStarted', onStarted);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('joinedRoom', onJoinedRoom);
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
    socket.on('playerTaunt', onPlayerTaunt);
    socket.on('handHistory', onHandHistory);

    return () => {
      socket.off('gameStateUpdate', onUpdate);
      socket.off('gameStarted', onStarted);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('joinedRoom', onJoinedRoom);
      socket.off('showdown', onShowdown);
      socket.off('timerStarted', onTimerStarted);
      socket.off('timerExtended', onTimerExtended);
      socket.off('timedOut', onTimedOut);
      socket.off('playerLeft', onPlayerLeft);
      socket.off('actionError', onActionError);
      socket.off('rebuyError', onRebuyError);
      socket.off('error', onError);
      socket.off('cardRevealed', onCardRevealed);
      socket.off('playerReconnected', onPlayerReconnected);
      socket.off('playerTaunt', onPlayerTaunt);
      socket.off('handHistory', onHandHistory);
    };
  }, []);

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', background: '#060d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: '#f0d060', fontSize: 20 }}>未找到房间</p>
        <button onClick={() => navigate('/')} style={{ background: '#f0d060', color: '#060d1a', fontWeight: 700, padding: '10px 28px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 15 }}>
          返回大厅
        </button>
      </div>
    );
  }

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
  const halfPot = Math.floor(room.pot / 2);

  const sendAction = (action, amount = 0) => {
    if (navigator.vibrate) navigator.vibrate(15);
    setError(''); setShowRaise(false); setRaiseError('');
    playActionSound(action);
    socket.emit('playerAction', { roomId, action, amount });
  };

  const confirmRaise = () => {
    const v = Number(raiseInputValue);
    if (isNaN(v) || v < minRaise) {
      setRaiseError(`加注金额不能低于最小加注 ${minRaise}`);
      return;
    }
    if (v > maxRaise) {
      setRaiseError(`超过最大筹码 ${maxRaise}，已改为全下`);
      setRaiseAmount(maxRaise);
      setRaiseInputValue(String(maxRaise));
      return;
    }
    setRaiseError('');
    sendAction('raise', v);
  };

  const setRaise = (v) => {
    setRaiseAmount(v);
    setRaiseInputValue(String(v));
    setRaiseError('');
  };

  const sendTaunt = (type, payload) => {
    setShowTauntPicker(false);
    if (type === 'voice') {
      speakText(payload);
    }
    socket.emit('playerTaunt', { roomId, type, payload });
  };
  const sendRevealCards = () => socket.emit('revealCards', { roomId });
  const sendQueueNextHand = () => { socket.emit('queueForNextHand', { roomId }); };
  const sendReadyForNextHand = () => socket.emit('playerReadyStatus', { roomId, status: 'ready' });
  const sendSpectateNextHand = () => socket.emit('playerReadyStatus', { roomId, status: 'spectating' });
  const handleRebuy = () => { setRebuyError(''); socket.emit('rebuy', { roomId, amount: room.settings.initialChips }); };

  const showActionButtons = isMyTurn && me && !me.folded && me.chips > 0 && room.phase !== 'showdown' && room.phase !== 'waiting';
  const showRebuyButton = me && room.phase !== 'waiting' && (me.folded || me.chips === 0);
  const hasMyCards = (me?.holeCards?.length ?? 0) > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, height: '100%', overflow: 'hidden', color: '#fff', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

        {/* ── Background image (full screen) ── */}
        <img src="/poker-table-bg.jpg" alt="" style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'top center',
          zIndex: 0,
        }} />
        {/* Dark gradient at bottom so action buttons remain readable */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%',
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.82))',
          zIndex: 1, pointerEvents: 'none',
        }} />

        {/* ── Top bar ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.72), transparent)',
        }}>
          <button onClick={() => navigate('/')} style={{ color: 'rgba(240,208,96,0.85)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← 大厅
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: '#f0d060', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 3, fontSize: 14 }}>{roomId}</span>
            <span style={{ background: 'rgba(240,208,96,0.18)', color: '#f0d060', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
              {PHASE_LABELS[room.phase]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setShowHistory(true); socket.emit('getHandHistory', { roomId }); }} style={{ color: 'rgba(240,208,96,0.8)', fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              📜
            </button>
            <button onClick={() => setShowScoreboard(s => !s)} style={{ color: 'rgba(240,208,96,0.8)', fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              📊
            </button>
          </div>
        </div>

        {/* ── Table elements (hidden during waiting) ── */}
        {room.phase !== 'waiting' && (
          <>
            {/* Pot */}
            {room.pot > 0 && (
              <div style={{
                position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
                zIndex: 5, display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,0,0,0.68)', borderRadius: 20, padding: '5px 14px',
                border: '1px solid rgba(212,175,55,0.45)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
              }}>
                <span style={{ width: 13, height: 13, borderRadius: '50%', background: 'linear-gradient(135deg,#f0d060,#c8950a)', display: 'inline-block', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.5)' }} />
                <span style={{ color: '#f0d060', fontWeight: 700, fontSize: 14 }}>底池 {room.pot}</span>
              </div>
            )}

            {/* Community cards */}
            <div style={{
              position: 'absolute', top: '49%', left: '50%', transform: 'translate(-50%, -50%)',
              zIndex: 5,
            }}>
              <CommunityCards cards={room.communityCards} />
            </div>

            {/* Hand hint — above community cards */}
            {myHandHint && room.phase !== 'waiting' && room.phase !== 'settlement' && (
              <div style={{
                position: 'absolute', top: '37%', left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 6, pointerEvents: 'none',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.82)', borderRadius: 12,
                  padding: '5px 18px',
                  border: '1.5px solid rgba(212,175,55,0.6)',
                  color: '#f0d060', fontSize: 17, fontWeight: 800,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                }}>
                  💡 {myHandHint}
                </div>
              </div>
            )}

            {/* Player avatars — zIndex 20 so SpeechBubbles (z:50) render above hole cards */}
            <PokerTable
              room={room}
              mySocketId={mySocketId}
              timerInfo={timerInfo}
              countdown={countdown}
              isMyTurn={isMyTurn}
              onExtendTime={() => socket.emit('extendTime', { roomId })}
              tauntBubbles={tauntBubbles}
              onMyAvatarClick={() => setShowTauntPicker(true)}
              actionBadges={actionBadges}
              raisePopups={raisePopups}
            />

            {/* My hole cards */}
            {hasMyCards && (
              <div style={{
                position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                pointerEvents: 'none',
              }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {me.holeCards.map((card, i) => (
                    <Card key={i} card={card} size="md" />
                  ))}
                </div>
              </div>
            )}

            {/* Floating message */}
            {message && (
              <div style={{
                position: 'absolute',
                bottom: hasMyCards ? 180 : 96,
                left: '50%', transform: 'translateX(-50%)',
                zIndex: 20, whiteSpace: 'nowrap',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.78)', borderRadius: 16, padding: '5px 16px',
                  color: '#fde68a', fontSize: 13, fontWeight: 600,
                  border: '1px solid rgba(253,230,138,0.25)',
                }}>
                  {message}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Raise panel (above action buttons) ── */}
        {showRaise && showActionButtons && canRaise && (
          <div style={{
            position: 'absolute', bottom: 82, left: 0, right: 0, zIndex: 25,
            background: 'rgba(6,10,22,0.97)', borderTop: '1px solid rgba(255,255,255,0.09)',
            padding: '10px 14px 12px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>加注至</span>
              <span style={{ color: '#f0d060', fontWeight: 700, fontSize: 16 }}>
                {actualRaise}
                <span style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 400, fontSize: 12 }}> (花费 {raiseCost})</span>
              </span>
              <button onClick={() => { setShowRaise(false); setRaiseError(''); }} style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontSize: 11,
                padding: '3px 10px', cursor: 'pointer',
              }}>取消</button>
            </div>

            {/* Vertical slider + right controls */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
              {/* Vertical slider column */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{maxRaise}</span>
                <input
                  type="range"
                  min={minRaise} max={maxRaise} value={actualRaise}
                  onChange={e => setRaise(Number(e.target.value))}
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                    WebkitAppearance: 'slider-vertical',
                    height: 110, width: 28,
                    accentColor: '#eab308',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>{minRaise}</span>
              </div>

              {/* Right: presets + input + error */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Preset buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setRaise(Math.min(halfPot || minRaise, maxRaise))} style={presetBtn}>½POT</button>
                  <button onClick={() => setRaise(Math.min(room.pot || minRaise, maxRaise))} style={presetBtn}>POT</button>
                  <button onClick={() => setRaise(maxRaise)} style={{ ...presetBtn, borderColor: 'rgba(234,179,8,0.55)', color: '#eab308' }}>全下</button>
                </div>

                {/* Free-type number input */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={raiseInputValue}
                    onChange={e => {
                      const raw = e.target.value;
                      setRaiseInputValue(raw);
                      setRaiseError('');
                      const v = Number(raw);
                      if (!isNaN(v) && v >= minRaise && v <= maxRaise) setRaiseAmount(v);
                    }}
                    placeholder={`${minRaise} ~ ${maxRaise}`}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.08)',
                      border: `1px solid ${raiseError ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: 8, color: '#f0d060', fontWeight: 700,
                      fontSize: 14, padding: '6px 10px', textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Error message */}
                {raiseError && (
                  <div style={{ color: '#f87171', fontSize: 11, background: 'rgba(239,68,68,0.1)', borderRadius: 6, padding: '4px 8px' }}>
                    ⚠ {raiseError}
                  </div>
                )}

                {/* Min/max hint */}
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                  最小加注 {minRaise} · 全下 {maxRaise}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Action area (always at bottom, 82px) ── */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 82, zIndex: 30,
          background: 'rgba(4,7,18,0.78)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10,
        }}>
          {showActionButtons ? (
            <>
              <button className="action-btn" onClick={() => sendAction('fold')} style={{
                ...actionBtn,
                background: 'linear-gradient(135deg,#7f1d1d,#991b1b)',
                boxShadow: showRaise ? '0 4px 14px rgba(127,29,29,0.3)' : '0 6px 0 #5a0f0f, 0 8px 16px rgba(127,29,29,0.5)',
                opacity: showRaise ? 0.35 : 1,
                pointerEvents: showRaise ? 'none' : 'auto',
              }}>弃牌</button>

              <button className="action-btn" onClick={() => canCheck ? sendAction('check') : sendAction('call')} style={{
                ...actionBtn, flex: 1.3,
                background: 'linear-gradient(135deg,#14532d,#166534)',
                boxShadow: showRaise ? '0 4px 14px rgba(20,83,45,0.3)' : '0 6px 0 #0a3018, 0 8px 16px rgba(20,83,45,0.5)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                opacity: showRaise ? 0.35 : 1,
                pointerEvents: showRaise ? 'none' : 'auto',
              }}>
                <span>{canCheck ? '过牌' : (me && me.chips < toCall ? 'ALL-IN' : '跟注')}</span>
                {!canCheck && <span style={{ fontSize: 12, opacity: 0.7 }}>{me && me.chips < toCall ? me.chips : toCall}</span>}
              </button>

              <button className="action-btn"
                onClick={() => {
                  if (showRaise) {
                    confirmRaise();
                  } else {
                    setRaise(actualRaise);
                    setShowRaise(true);
                  }
                }}
                disabled={!canRaise || (me?.chips ?? 0) <= toCall}
                style={{
                  ...actionBtn,
                  background: showRaise
                    ? 'linear-gradient(135deg,#1e40af,#2563eb)'
                    : 'linear-gradient(135deg,#1e3a8a,#1e40af)',
                  boxShadow: showRaise ? '0 6px 0 #0f1e50, 0 8px 16px rgba(37,99,235,0.7)' : '0 6px 0 #0a1a5e, 0 8px 16px rgba(30,58,138,0.45)',
                  opacity: (!canRaise || (me?.chips ?? 0) <= toCall) ? 0.38 : 1,
                }}
              >
                {showRaise ? '确认' : '加注'}
              </button>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {/* Spectator indicator for mid-game joiners */}
              {me?.status === 'spectating' && room.phase !== 'settlement' && (
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center' }}>
                  👁 观战中 · 等待本局结束后可参与下一局
                </div>
              )}

              {/* 弃牌后可随时站起观战 */}
              {me?.folded && me?.status !== 'spectating' &&
               ['preflop','flop','turn','river'].includes(room.phase) && (
                <button
                  onClick={() => socket.emit('foldToSpectate', { roomId })}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 600,
                    fontSize: 13, padding: '8px 22px', cursor: 'pointer',
                  }}
                >👁 站起观战</button>
              )}

              {/* 观战中可随时坐下（下局参与） */}
              {me?.status === 'spectating' &&
               ['preflop','flop','turn','river'].includes(room.phase) &&
               me?.readyStatus !== 'queued' && (
                <button
                  onClick={sendQueueNextHand}
                  style={{
                    background: 'rgba(240,208,96,0.12)', border: '1px solid rgba(240,208,96,0.35)',
                    borderRadius: 12, color: '#f0d060', fontWeight: 600,
                    fontSize: 13, padding: '8px 22px', cursor: 'pointer',
                  }}
                >🪑 坐下（下局参与）</button>
              )}
              {me?.status === 'spectating' && me?.readyStatus === 'queued' &&
               ['preflop','flop','turn','river'].includes(room.phase) && (
                <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>🟡 下局将参与</div>
              )}

              {/* My chip/bet info + pot odds */}
              {me && room.phase !== 'waiting' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <span style={{ color: '#f0d060', fontWeight: 700 }}>筹码 {me.chips}</span>
                    {me.bet > 0 && <span style={{ color: '#fde68a' }}>下注 {me.bet}</span>}
                    {toCall > 0 && <span style={{ color: '#93c5fd' }}>跟注 {toCall}</span>}
                  </div>
                  {isMyTurn && toCall > 0 && room.pot > 0 && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                      底池赔率 {room.pot}:{toCall} · 需胜率 {Math.round(toCall / (room.pot + toCall) * 100)}%
                    </div>
                  )}
                </div>
              )}
              {/* Turn indicator */}
              {room.phase !== 'showdown' && room.phase !== 'waiting' && (() => {
                const cur = room.players[room.currentTurnIndex];
                const allInRunout = room.players.filter(p => !p.folded && p.chips > 0).length === 0;
                if (allInRunout) return <span style={{ color: '#fbbf24', fontSize: 13 }}>♠ 自动开牌中...</span>;
                if (cur) return <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>等待 {cur.nickname}{timerInfo && countdown > 0 ? ` · ${countdown}s` : ''}</span>;
                return null;
              })()}

              {error && <div style={{ color: '#f87171', fontSize: 12, background: 'rgba(248,113,113,0.1)', borderRadius: 8, padding: '3px 12px' }}>{error}</div>}
              {rebuyError && <div style={{ color: '#fb923c', fontSize: 12, background: 'rgba(251,146,60,0.1)', borderRadius: 8, padding: '3px 12px' }}>{rebuyError}</div>}

              {showRebuyButton && (
                <button onClick={handleRebuy} style={{
                  background: 'linear-gradient(135deg,#92400e,#b45309)',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                  padding: '8px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
                }}>
                  💰 补码 {room.settings.initialChips}
                  {(me?.rebuyCount ?? 0) > 0 && <span style={{ opacity: 0.65, fontSize: 11 }}> (已补{me.rebuyCount}次)</span>}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Overlays ── */}
        <style>{`
          @keyframes taunt-pop {
            from { opacity:0; transform:translateX(-50%) scale(0.3); }
            60%  { transform:translateX(-50%) scale(1.12); }
            to   { opacity:1; transform:translateX(-50%) scale(1); }
          }
          @keyframes taunt-fade {
            0%   { opacity:1; }
            70%  { opacity:1; }
            100% { opacity:0; }
          }
          .action-btn {
            transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.1s ease !important;
          }
          .action-btn:active {
            transform: translateY(5px) scale(0.94) !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;
            filter: brightness(0.70) saturate(1.3) !important;
          }
          @keyframes win-fade-in {
            from { opacity:0; transform:scale(0.85); }
            to   { opacity:1; transform:scale(1); }
          }
          @keyframes crown-bounce {
            from { transform:translateY(0) scale(1); }
            to   { transform:translateY(-10px) scale(1.12); }
          }
          @keyframes raise-float-up {
            0%   { opacity:0; transform:translateX(-50%) translateY(4px) scale(0.5); }
            18%  { opacity:1; transform:translateX(-50%) translateY(-12px) scale(1.25); }
            55%  { opacity:1; transform:translateX(-50%) translateY(-28px) scale(1.05); }
            100% { opacity:0; transform:translateX(-50%) translateY(-52px) scale(0.85); }
          }
          @keyframes allin-wobble {
            0%   { transform:translateX(calc(-50% - 4px)) rotate(-5deg) scale(1); }
            50%  { transform:translateX(calc(-50% + 4px)) rotate(5deg) scale(1.06); }
            100% { transform:translateX(calc(-50% - 4px)) rotate(-5deg) scale(1); }
          }
          @keyframes pulse {
            from { opacity:1; }
            to   { opacity:0.4; }
          }
        `}</style>

        {showTauntPicker && (
          <TauntPicker
            tab={tauntTab}
            onTabChange={setTauntTab}
            onSend={sendTaunt}
            onClose={() => setShowTauntPicker(false)}
          />
        )}

        {room.phase === 'waiting' && (
          <WaitingRoom room={room} isHost={isHost} mySocketId={mySocketId} roomId={roomId} />
        )}

        {showScoreboard && (
          <Scoreboard room={room} mySocketId={mySocketId} onClose={() => setShowScoreboard(false)} />
        )}

        {showHistory && (
          <HandHistoryPanel history={handHistory} onClose={() => setShowHistory(false)} />
        )}

        {winAnimating && settlementData && (
          <WinAnimation results={settlementData.results} />
        )}

        {(room.phase === 'settlement' || settlementData) && !winAnimating && (
          <SettlementScreen
            settlementData={settlementData}
            room={room}
            mySocketId={mySocketId}
            settlementCountdown={settlementCountdown}
            cardReveals={cardReveals}
            onRevealCards={sendRevealCards}
            onReady={sendReadyForNextHand}
            onSpectate={sendSpectateNextHand}
            onJoinNextHand={sendQueueNextHand}
          />
        )}
      </div>
    </div>
  );
}

// Shared styles
const actionBtn = {
  flex: 1, height: 56, borderRadius: 14, border: 'none', cursor: 'pointer',
  color: '#fff', fontWeight: 700, fontSize: 16,
  transition: 'opacity 0.15s, transform 0.08s, filter 0.08s',
};

const presetBtn = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: '#e2e8f0', fontSize: 11,
  padding: '5px 8px', cursor: 'pointer', whiteSpace: 'nowrap',
};

// ── Poker table: only player avatars, no CSS oval ──────────────
function PokerTable({ room, mySocketId, timerInfo, countdown, isMyTurn, onExtendTime, tauntBubbles, onMyAvatarClick, actionBadges, raisePopups }) {
  const n = room.players.length;
  const myIdx = room.players.findIndex(p => p.socketId === mySocketId);
  const orderedPlayers = myIdx >= 0
    ? [...room.players.slice(myIdx), ...room.players.slice(0, myIdx)]
    : room.players;
  const seats = getSeatPositions(orderedPlayers.length);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {orderedPlayers.map((player, seatPos) => {
        const pos = seats[seatPos] || { x: 50, y: 50 };
        const origIdx = myIdx >= 0 ? (myIdx + seatPos) % n : seatPos;
        const isThisPlayersTurn = room.currentTurnIndex === origIdx;
        const isMe = player.socketId === mySocketId;
        return (
          <AvatarTimer
            key={player.socketId}
            player={player}
            isMe={isMe}
            posStyle={{
              position: 'absolute',
              left: `${pos.x}%`, top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            isCurrentTurn={isThisPlayersTurn}
            posLabel={room.phase !== 'waiting' ? getPositionLabel(origIdx, room.dealerIndex ?? 0, n) : null}
            avatarIdx={player.seatIndex % AVATARS.length}
            timerInfo={timerInfo}
            countdown={isThisPlayersTurn ? countdown : 0}
            isMyTurn={isMyTurn}
            onExtendTime={onExtendTime}
            bubble={tauntBubbles?.[player.socketId]}
            onAvatarClick={isMe ? onMyAvatarClick : null}
            actionBadge={actionBadges?.[player.socketId]}
            raisePopup={raisePopups?.[player.socketId]}
          />
        );
      })}
    </div>
  );
}

// ── Avatar with timer ring ─────────────────────────────────────
function AvatarTimer({ player, isMe, posStyle, isCurrentTurn, posLabel, avatarIdx, timerInfo, countdown, isMyTurn, onExtendTime, bubble, onAvatarClick, actionBadge, raisePopup }) {
  const CIRCUMFERENCE = 2 * Math.PI * 20;
  const duration = timerInfo?.duration || 20;
  const dashOffset = CIRCUMFERENCE * (1 - (isCurrentTurn && countdown > 0 ? countdown / duration : 0));
  const ringColor = countdown > duration * 0.5 ? '#4ade80' : countdown > duration * 0.25 ? '#facc15' : '#ef4444';
  const isLowTime = isCurrentTurn && countdown > 0 && countdown <= duration * 0.25;
  const isGrayed = player.disconnected || player.status === 'spectating';
  const isFolded = player.folded && player.status !== 'spectating';
  const isAllin = player.status === 'allin' && !isFolded;
  const sz = isMe ? 52 : 46;
  const hero = getPlayerHero(player);

  const [avatarScale, setAvatarScale] = useState(1);
  const prevRaiseKeyRef = useRef(null);
  useEffect(() => {
    if (!raisePopup || raisePopup.key === prevRaiseKeyRef.current) return;
    prevRaiseKeyRef.current = raisePopup.key;
    setAvatarScale(1.55);
    setTimeout(() => setAvatarScale(1.25), 180);
    setTimeout(() => setAvatarScale(1), 520);
  }, [raisePopup]);

  const baseScale = isCurrentTurn ? 1.18 : 1;
  const effectiveScale = avatarScale > 1 ? avatarScale : baseScale;

  return (
    <div style={posStyle}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        opacity: isGrayed ? 0.32 : 1,
        filter: isGrayed ? 'grayscale(1)' : isCurrentTurn ? 'drop-shadow(0 0 10px rgba(212,175,55,0.85))' : 'none',
      }}>
        {/* Avatar + ring */}
        <div style={{ position: 'relative', width: sz, height: sz }}>
          {/* Floating popups above avatar */}
          {bubble && <SpeechBubble type={bubble.type} payload={bubble.payload} key={bubble.key} />}
          {raisePopup && <RaisePopup popup={raisePopup} key={raisePopup.key} />}
          {!bubble && !raisePopup && actionBadge && <ActionBadge badge={actionBadge} />}
          {isAllin && !actionBadge && !bubble && !raisePopup && <AllInBadge />}

          <div
            onClick={onAvatarClick}
            style={{
              width: sz, height: sz, borderRadius: '50%', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: isMe ? 22 : 18,
              background: isMe ? '#1e3a6e' : '#252525',
              border: `2.5px solid ${isCurrentTurn ? '#f0d060' : isMe ? '#3b82f6' : 'rgba(255,255,255,0.22)'}`,
              transform: `scale(${effectiveScale})`,
              transition: avatarScale > 1 ? 'transform 0.16s cubic-bezier(0.34,1.56,0.64,1)' : 'transform 0.2s ease',
              opacity: isFolded ? 0.38 : 1,
              cursor: onAvatarClick ? 'pointer' : 'default',
              boxShadow: onAvatarClick ? '0 0 0 2px rgba(240,208,96,0.35)' : 'none',
            }}
          >
            <img
              src={hero.img}
              alt={hero.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none' }}
            />
          </div>

          {isCurrentTurn && timerInfo && countdown > 0 && (
            <div style={{
              position: 'absolute', inset: -6, width: sz + 12, height: sz + 12,
              pointerEvents: 'none',
              animation: isLowTime ? 'pulse 0.5s infinite alternate' : 'none',
            }}>
              <svg viewBox="0 0 48 48" width={sz + 12} height={sz + 12}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke={ringColor} strokeWidth="3.5"
                  strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset}
                  strokeLinecap="round" transform="rotate(-90 24 24)"
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                />
              </svg>
            </div>
          )}

          {posLabel && (
            <span style={{
              position: 'absolute', top: -2, right: -3,
              fontWeight: 700, fontSize: 9, padding: '1px 4px', borderRadius: 4,
              color: '#000', zIndex: 2,
              background: posLabel === 'D' ? '#fff' : posLabel === 'SB' ? '#93c5fd' : posLabel === 'BB' ? '#fbbf24' : '#d1d5db',
            }}>{posLabel}</span>
          )}
        </div>

        {/* Name / chip info */}
        <div style={{ textAlign: 'center', maxWidth: isMe ? 84 : 72 }}>
          <div style={{
            fontSize: isMe ? 11 : 10, fontWeight: 600,
            color: isFolded ? 'rgba(255,255,255,0.28)' : '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: '0 1px 4px rgba(0,0,0,0.95)',
          }}>{player.nickname}</div>
          <div style={{ fontSize: isMe ? 11 : 10, color: '#f0d060', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
            {player.chips}
          </div>
          {player.bet > 0 && (
            <div style={{ fontSize: 9, color: '#fde68a', textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>注:{player.bet}</div>
          )}
          {isFolded && <div style={{ fontSize: 9, color: '#f87171' }}>弃牌</div>}
          {player.status === 'spectating' && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)' }}>👁</div>}
          {player.disconnected && player.status !== 'spectating' && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)' }}>断线</div>}
        </div>

        {isMe && isMyTurn && isCurrentTurn && timerInfo?.hasTimeBank && countdown > 0 && (
          <button onClick={onExtendTime} style={{
            fontSize: 10, color: '#f0d060', border: '1px solid rgba(240,208,96,0.4)',
            background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '2px 7px', cursor: 'pointer',
          }}>+时</button>
        )}
      </div>
    </div>
  );
}

// ── 行动徽章（弃牌/跟注/过牌/加注/all-in）──────────────────
const BADGE_STYLES = {
  fold:  { bg: 'rgba(239,68,68,0.92)',   label: '弃牌' },
  call:  { bg: 'rgba(34,197,94,0.92)',   label: (a) => `跟注 ${a.amount}` },
  check: { bg: 'rgba(107,114,128,0.92)', label: '过牌' },
  raise: { bg: 'rgba(59,130,246,0.92)',  label: (a) => `加注 ${a.amount}` },
  allin: { bg: 'rgba(240,208,96,0.95)',  label: 'ALL IN', color: '#000' },
};

function ActionBadge({ badge }) {
  const s = BADGE_STYLES[badge.action];
  if (!s) return null;
  const label = typeof s.label === 'function' ? s.label(badge) : s.label;
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
      transform: 'translateX(-50%)',
      background: s.bg, borderRadius: 10, padding: '3px 8px',
      fontSize: 11, fontWeight: 800, color: s.color || '#fff',
      whiteSpace: 'nowrap', zIndex: 55, pointerEvents: 'none',
      animation: 'taunt-pop 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards, taunt-fade 1.5s linear forwards',
    }}>{label}</div>
  );
}

function RaisePopup({ popup }) {
  const isAllin = popup.action === 'allin';
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
      zIndex: 57, pointerEvents: 'none',
      animation: 'raise-float-up 1.3s ease forwards',
    }}>
      <div style={{
        color: isAllin ? '#ffd700' : '#4ade80',
        fontWeight: 900,
        fontSize: isAllin ? 20 : 28,
        textShadow: isAllin
          ? '0 0 18px rgba(255,215,0,0.9), 0 0 6px rgba(255,100,0,0.7), 0 2px 4px rgba(0,0,0,1)'
          : '0 0 18px rgba(74,222,128,0.9), 0 2px 4px rgba(0,0,0,1)',
        whiteSpace: 'nowrap',
        letterSpacing: isAllin ? 2 : 0,
        transform: 'translateX(-50%)',
        display: 'block',
      }}>
        {isAllin ? '💥 ALL-IN!' : `+${popup.amount}`}
      </div>
    </div>
  );
}

function AllInBadge() {
  return (
    <div style={{
      position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
      zIndex: 56, pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 900,
        color: '#fff',
        background: 'linear-gradient(90deg, #ff4444 0%, #ff9900 33%, #ff44ff 66%, #ff4444 100%)',
        backgroundSize: '200% 100%',
        padding: '2px 7px',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 0 8px rgba(255,100,0,0.6)',
        whiteSpace: 'nowrap',
        letterSpacing: 1,
        transform: 'translateX(-50%)',
        display: 'block',
        animation: 'allin-wobble 0.65s ease-in-out infinite',
      }}>✦ ALL-IN ✦</div>
    </div>
  );
}

// ── Scoreboard overlay ─────────────────────────────────────────
function Scoreboard({ room, mySocketId, onClose }) {
  const sorted = [...room.players].sort((a, b) => b.chips - a.chips);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.86)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#1a2f4a', borderRadius: 20, padding: 20,
        border: '1px solid rgba(240,208,96,0.28)', width: '100%', maxWidth: 340,
        maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ color: '#f0d060', fontWeight: 700, fontSize: 18, margin: 0 }}>📊 记分牌</h3>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {sorted.map((p, rank) => {
            const totalProfit = p.chips - room.settings.initialChips - (p.rebuyCount || 0) * room.settings.initialChips;
            return (
              <div key={p.socketId} style={{
                borderRadius: 13, padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: p.socketId === mySocketId ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${p.socketId === mySocketId ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.12)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: rank === 0 ? '#f0d060' : 'rgba(255,255,255,0.35)', fontSize: 14, flexShrink: 0 }}>#{rank + 1}</span>
                  <img src={getPlayerHero(p).img} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nickname}</div>
                    {p.stats?.handsPlayed > 0 && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>
                        {p.stats.wins}胜/{p.stats.handsPlayed}局 · 胜率{Math.round(p.stats.wins / p.stats.handsPlayed * 100)}%
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: '#f0d060', fontWeight: 700, fontSize: 15 }}>{p.chips}</div>
                  {totalProfit !== 0 && <div style={{ fontSize: 11, color: totalProfit > 0 ? '#4ade80' : '#f87171' }}>{totalProfit > 0 ? `+${totalProfit}` : totalProfit}</div>}
                  {(p.rebuyCount || 0) > 0 && <div style={{ fontSize: 10, color: '#fb923c' }}>补{p.rebuyCount}次</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.22)', fontSize: 11, textAlign: 'center' }}>
          大盲 {(room.settings?.smallBlind || 0) * 2} | 局#{(room.dealerIndex ?? 0) + 1}
        </div>
      </div>
    </div>
  );
}

// ── Settlement overlay ─────────────────────────────────────────
const SETTLEMENT_DURATION = 10;

const READY_STATUS_ICON = { ready: '✅', queued: '🪑', spectating: '👁', pending: '⏳' };

const ACTION_LOG_LABELS = { fold: '弃牌', call: '跟注', check: '过牌', raise: '加注', allin: '全下' };
const PHASE_ORDER = ['preflop', 'flop', 'turn', 'river'];

function formatLogEntry(entry) {
  const label = ACTION_LOG_LABELS[entry.action] || entry.action;
  if (entry.action === 'fold' || entry.action === 'check') return `${entry.nickname} ${label}`;
  return `${entry.nickname} ${label} ${entry.amount}`;
}

function SettlementScreen({
  settlementData, room, mySocketId, settlementCountdown,
  cardReveals, onRevealCards, onReady, onSpectate, onJoinNextHand,
}) {
  const { results = [], actionLog = [], potBreakdown = [] } = settlementData || {};
  const me = room?.players?.find(p => p.socketId === mySocketId);
  const myReadyStatus = me?.readyStatus || 'pending';
  const hasRevealed = !!cardReveals[mySocketId];
  const myHoleCards = me?.holeCards ?? [];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '52px 14px 14px',
    }}>
      <div style={{
        background: '#1a2f4a', borderRadius: 20, padding: 16,
        border: '1px solid rgba(240,208,96,0.28)', width: '100%',
        maxHeight: '100%', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>

        {/* Title + live countdown */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ color: '#f0d060', fontWeight: 700, fontSize: 19, margin: 0 }}>🃏 本局结算</h2>
          {settlementCountdown > 0 && (
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13 }}>⏱ {settlementCountdown}s</span>
          )}
        </div>

        {/* Community cards */}
        {room.communityCards?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
            {room.communityCards.map((card, i) => (
              <Card key={i} card={card} size="sm" />
            ))}
          </div>
        )}

        {/* Results list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {results.map(r => {
            const player = room.players.find(p => p.socketId === r.socketId);
            const revealedCards = cardReveals[r.socketId] || r.holeCards || [];
            // Only display cards if ALL are real (no 'hidden' placeholder)
            const cardsVisible = revealedCards.length > 0 && revealedCards.every(c => c !== 'hidden');
            const isWinner = r.delta > 0;
            const readyStatus = player?.readyStatus || 'pending';
            const isDisconnected = player?.disconnected;

            return (
              <div key={r.socketId} style={{
                borderRadius: 14, padding: '9px 11px',
                background: isWinner ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${isWinner ? 'rgba(34,197,94,0.36)' : 'rgba(255,255,255,0.12)'}`,
              }}>
                {/* Row 1: avatar, name, delta, readyStatus */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <img src={(player ? getPlayerHero(player) : HEROES[0]).img} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    {isWinner && <span style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 14 }}>👑</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.nickname}{r.socketId === mySocketId ? ' (我)' : ''}
                      {isDisconnected && <span style={{ color: '#f87171', fontSize: 10, marginLeft: 5 }}>断线</span>}
                    </div>
                    {cardsVisible && r.handName && (
                      <div style={{ fontSize: 11, color: '#f0d060', fontWeight: 600 }}>
                        {HAND_NAME_MAP[r.handName] || r.handName}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: isWinner ? '#4ade80' : '#f87171' }}>
                      {r.delta > 0 ? `+${r.delta}` : r.delta}
                    </span>
                    <span style={{ fontSize: 14 }} title={readyStatus}>
                      {READY_STATUS_ICON[readyStatus] || '⏳'}
                    </span>
                  </div>
                </div>

                {/* Row 2: hole cards (only when visible) */}
                {cardsVisible && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 7, paddingLeft: 27 }}>
                    {revealedCards.map((card, i) => (
                      <Card key={i} card={card} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pot breakdown (main pot + side pots) */}
        {potBreakdown.length > 1 && (
          <div style={{
            background: 'rgba(0,0,0,0.22)', borderRadius: 10, padding: '7px 12px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            {potBreakdown.map((pot, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{i === 0 ? '主池' : `边池${i}`}</span>
                <span style={{ color: '#f0d060', fontWeight: 600 }}>
                  {pot.amount} → {pot.winners.join(' & ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 亮牌 button: only show if I have cards and haven't revealed yet */}
        {myHoleCards.length > 0 && !hasRevealed && (
          <button
            onClick={onRevealCards}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 13,
              border: '1px solid rgba(240,208,96,0.35)', background: 'none',
              color: '#f0d060', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >亮牌 🂠</button>
        )}
        {myHoleCards.length > 0 && hasRevealed && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.32)', fontSize: 12 }}>已亮牌</div>
        )}

        {/* Action buttons based on myReadyStatus */}
        <div style={{ display: 'flex', gap: 8 }}>
          {myReadyStatus === 'pending' && (
            <>
              <button
                onClick={onReady}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg,#14532d,#166534)', color: '#fff',
                  fontWeight: 700, fontSize: 15,
                }}
              >✅ 准备下一局</button>
              <button
                onClick={onSpectate}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)',
                  color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 15,
                }}
              >👁 本局观战</button>
            </>
          )}
          {myReadyStatus === 'ready' && (
            <div style={{
              flex: 1, padding: '12px 0', borderRadius: 14, textAlign: 'center',
              background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
              color: '#4ade80', fontWeight: 600, fontSize: 14,
            }}>✅ 已准备，等待其他玩家...</div>
          )}
          {myReadyStatus === 'spectating' && (
            <button
              onClick={onJoinNextHand}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(240,208,96,0.14)', border: '1px solid rgba(240,208,96,0.35)',
                color: '#f0d060', fontWeight: 700, fontSize: 15,
              }}
            >🪑 下局参与</button>
          )}
          {myReadyStatus === 'queued' && (
            <div style={{
              flex: 1, padding: '12px 0', borderRadius: 14, textAlign: 'center',
              background: 'rgba(240,208,96,0.1)', border: '1px solid rgba(240,208,96,0.25)',
              color: '#fbbf24', fontWeight: 600, fontSize: 14,
            }}>🪑 下局将参与</div>
          )}
        </div>

        {/* Action log grouped by street */}
        {actionLog.length > 0 && (() => {
          const grouped = {};
          for (const entry of actionLog) {
            if (!grouped[entry.phase]) grouped[entry.phase] = [];
            grouped[entry.phase].push(entry);
          }
          const phasesWithActions = PHASE_ORDER.filter(p => grouped[p]?.length > 0);
          if (phasesWithActions.length === 0) return null;
          return (
            <div style={{
              background: 'rgba(0,0,0,0.28)', borderRadius: 12, padding: '9px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginBottom: 2 }}>📋 本局行动</div>
              {phasesWithActions.map(phase => (
                <div key={phase} style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    [{PHASE_LABELS[phase]}]
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 1.5 }}>
                    {grouped[phase].map(formatLogEntry).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Countdown progress bar */}
        {settlementCountdown > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ height: 3, background: 'rgba(0,0,0,0.3)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: '#f0d060', transition: 'width 1s linear',
                width: `${(settlementCountdown / SETTLEMENT_DURATION) * 100}%`,
              }} />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11, textAlign: 'center', margin: 0 }}>
              {settlementCountdown}s 后未操作自动进入观战
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Waiting room overlay ───────────────────────────────────────
function WaitingRoom({ room, isHost, mySocketId, roomId }) {
  const [showHeroPicker, setShowHeroPicker] = useState(false);
  const me = room.players.find(p => p.socketId === mySocketId);
  const myHero = me?.heroId ? HEROES.find(h => h.id === me.heroId) : null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ background: '#1a2f4a', borderRadius: 22, padding: 24, border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p style={{ color: 'rgba(240,208,96,0.5)', fontSize: 13, margin: '0 0 6px' }}>分享房间号给朋友</p>
          <p style={{ color: '#f0d060', fontSize: 40, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.2em', margin: 0 }}>{room.roomId}</p>
        </div>

        {/* Hero selection button */}
        <button
          onClick={() => setShowHeroPicker(true)}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 12, cursor: 'pointer',
            background: myHero ? 'rgba(240,208,96,0.15)' : 'rgba(59,130,246,0.18)',
            border: `1.5px solid ${myHero ? 'rgba(240,208,96,0.5)' : 'rgba(59,130,246,0.45)'}`,
            color: myHero ? '#f0d060' : '#93c5fd',
            fontWeight: 700, fontSize: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {myHero ? (
            <>
              <img src={myHero.img} style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              {myHero.name} · 更换英雄
            </>
          ) : '🦸 选择你的英雄'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {room.players.map(p => {
            const hero = getPlayerHero(p);
            return (
              <div key={p.socketId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '10px 14px',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={hero.img} alt={hero.name} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14 }}>
                      {p.nickname}
                      {p.socketId === mySocketId && <span style={{ color: '#f0d060', fontSize: 11 }}> (我)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: p.heroId ? '#f0d060' : 'rgba(255,255,255,0.28)' }}>
                      {hero.name}{!p.heroId && ' (随机)'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'rgba(240,208,96,0.55)', fontSize: 12 }}>{p.chips}</span>
                  {p.socketId === room.hostSocketId && <span style={{ fontSize: 11, color: '#f0d060', background: 'rgba(240,208,96,0.14)', padding: '2px 8px', borderRadius: 8 }}>房主</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, marginBottom: 16,
          textAlign: 'center',
        }}>
          {[['小盲', room.settings.smallBlind], ['大盲', room.settings.smallBlind * 2], ['初始筹码', room.settings.initialChips]].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginBottom: 2 }}>{label}</div>
              <div style={{ color: '#f0d060', fontWeight: 700, fontSize: 16 }}>{val}</div>
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            onClick={() => socket.emit('startGame', { roomId })}
            disabled={room.players.length < 2}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: room.players.length < 2 ? 'rgba(240,208,96,0.25)' : 'linear-gradient(135deg,#c8950a,#f0d060)',
              color: '#0a0f1a', fontWeight: 700, fontSize: 16,
              opacity: room.players.length < 2 ? 0.55 : 1,
            }}
          >
            {room.players.length < 2 ? `等待更多玩家 (${room.players.length}/2)` : '开始游戏'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.38)', fontSize: 14, padding: '10px 0' }}>
            等待房主开始游戏...
          </div>
        )}
      </div>

      {showHeroPicker && (
        <HeroPicker
          players={room.players}
          mySocketId={mySocketId}
          myHeroId={me?.heroId}
          onSelect={(heroId) => {
            socket.emit('selectHero', { roomId, heroId });
            setShowHeroPicker(false);
          }}
          onClose={() => setShowHeroPicker(false)}
        />
      )}
    </div>
  );
}

// ── 英雄选择器 ────────────────────────────────────────────────
function HeroPicker({ players, mySocketId, myHeroId, onSelect, onClose }) {
  const claimedByOthers = new Set(
    players.filter(p => p.heroId && p.socketId !== mySocketId).map(p => p.heroId)
  );
  const SEASON_COLORS = { S1: '#f0d060', S2: '#a78bfa' };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)' }} onClick={onClose}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        margin: '24px 16px',
        background: '#111c30', borderRadius: 22,
        border: '1px solid rgba(240,208,96,0.22)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* 固定标题栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 12px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <h3 style={{ color: '#f0d060', fontWeight: 700, fontSize: 18, margin: 0 }}>🦸 选择你的英雄</h3>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* 可滚动内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {HERO_SEASONS.map(({ season, heroes }) => (
            <div key={season} style={{ marginBottom: 18 }}>
              {/* 赛季标题 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  background: SEASON_COLORS[season] || '#f0d060',
                  color: '#0a0f1a', fontWeight: 900, fontSize: 11,
                  padding: '2px 10px', borderRadius: 8,
                }}>{season}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>

              {/* S1: 每行一张大卡片 */}
              {season === 'S1' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {heroes.map(hero => {
                    const isTaken = claimedByOthers.has(hero.id);
                    const isSelected = hero.id === myHeroId;
                    const ts = TITLE_TYPE_STYLE[hero.titleType] || { bg: '#374151', color: '#fff' };
                    return (
                      <button
                        key={hero.id}
                        onClick={() => !isTaken && onSelect(hero.id)}
                        disabled={isTaken}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          background: isSelected ? 'rgba(240,208,96,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1.5px solid ${isSelected ? '#f0d060' : isTaken ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 16, padding: '10px 14px',
                          cursor: isTaken ? 'not-allowed' : 'pointer',
                          opacity: isTaken ? 0.35 : 1,
                          textAlign: 'left', width: '100%',
                        }}
                      >
                        {/* 大头像 */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <img src={hero.img} alt={hero.name} style={{
                            width: 68, height: 68, borderRadius: '50%', objectFit: 'cover',
                            border: `2.5px solid ${isSelected ? '#f0d060' : isTaken ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)'}`,
                          }} />
                          {isTaken && (
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.6)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, color: '#f87171', fontWeight: 700,
                            }}>已选</div>
                          )}
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

                        {/* 文字信息 */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ color: isSelected ? '#f0d060' : '#fff', fontWeight: 700, fontSize: 15 }}>{hero.name}</span>
                            {hero.title && <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 800, fontSize: 14 }}>{hero.title}</span>}
                            {hero.titleType && (
                              <span style={{
                                background: ts.bg, color: ts.color,
                                fontSize: 10, fontWeight: 700,
                                padding: '1px 6px', borderRadius: 6, flexShrink: 0,
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
                /* S2: 3列小格子 */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {heroes.map(hero => {
                    const isTaken = claimedByOthers.has(hero.id);
                    const isSelected = hero.id === myHeroId;
                    return (
                      <button
                        key={hero.id}
                        onClick={() => !isTaken && onSelect(hero.id)}
                        disabled={isTaken}
                        style={{
                          background: isSelected ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.06)',
                          border: `2px solid ${isSelected ? '#a78bfa' : isTaken ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: 14, padding: '10px 4px',
                          cursor: isTaken ? 'not-allowed' : 'pointer',
                          opacity: isTaken ? 0.32 : 1,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        }}
                      >
                        <div style={{ position: 'relative', width: 62, height: 62 }}>
                          <img src={hero.img} alt={hero.name} style={{
                            width: 62, height: 62, borderRadius: '50%', objectFit: 'cover',
                            border: `2.5px solid ${isSelected ? '#a78bfa' : 'transparent'}`,
                          }} />
                          {isTaken && (
                            <div style={{
                              position: 'absolute', inset: 0, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.55)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, color: '#f87171', fontWeight: 700,
                            }}>已选</div>
                          )}
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

          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center', margin: '4px 0 0' }}>
            未选择则随机分配 · 进入游戏后名字以房间昵称为准
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 嘲讽气泡（浮在头像上方）──────────────────────────────────
function SpeechBubble({ type, payload }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 10px)',
      left: '50%',
      zIndex: 50,
      pointerEvents: 'none',
      animation: 'taunt-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards, taunt-fade 3.5s linear forwards',
      transformOrigin: 'bottom center',
    }}>
      <div style={{
        position: 'relative',
        background: type === 'emoji' ? 'rgba(8,12,28,0.88)' : 'rgba(8,12,28,0.92)',
        border: '2px solid rgba(240,208,96,0.6)',
        borderRadius: 18,
        padding: type === 'emoji' ? '8px 12px' : '10px 14px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(240,208,96,0.15)',
        width: type === 'emoji' ? 'auto' : 200,
        maxWidth: type === 'emoji' ? 120 : 220,
        textAlign: 'center',
        transform: 'translateX(-50%)',
      }}>
        {type === 'emoji'
          ? <span style={{ fontSize: 80, lineHeight: 1.05, display: 'block', userSelect: 'none' }}>{payload}</span>
          : <span style={{ color: '#fde68a', fontSize: 14, fontWeight: 700, lineHeight: 1.6, display: 'block', wordBreak: 'break-all', whiteSpace: 'normal', textAlign: 'left' }}>{payload}</span>
        }
        {/* 气泡尾巴 - 外边框 */}
        <div style={{
          position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '12px solid rgba(240,208,96,0.6)',
        }} />
        {/* 气泡尾巴 - 填充 */}
        <div style={{
          position: 'absolute', bottom: -9, left: '50%', transform: 'translateX(-50%)',
          width: 0, height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '10px solid rgba(8,12,28,0.92)',
        }} />
      </div>
    </div>
  );
}

// ── 嘲讽选择器 ────────────────────────────────────────────────
function TauntPicker({ tab, onTabChange, onSend, onClose }) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 60 }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute', bottom: 82, left: 0, right: 0,
          background: 'rgba(8,12,28,0.97)',
          borderTop: '1px solid rgba(240,208,96,0.25)',
          borderRadius: '22px 22px 0 0',
          padding: '14px 14px 20px',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标签栏 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, justifyContent: 'center' }}>
          {[['emoji', '😤 表情包'], ['voice', '🎤 嘲讽语音']].map(([key, label]) => (
            <button key={key} onClick={() => onTabChange(key)} style={{
              background: tab === key ? 'rgba(240,208,96,0.18)' : 'rgba(255,255,255,0.06)',
              border: `1.5px solid ${tab === key ? 'rgba(240,208,96,0.55)' : 'rgba(255,255,255,0.1)'}`,
              color: tab === key ? '#f0d060' : 'rgba(255,255,255,0.55)',
              fontWeight: 700, fontSize: 14, padding: '7px 22px',
              borderRadius: 20, cursor: 'pointer',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {tab === 'emoji' ? (
          /* 表情格子 */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
            {TAUNT_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => onSend('emoji', e)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, padding: '10px 4px',
                  cursor: 'pointer', fontSize: 38, lineHeight: 1.1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'transform 0.1s, background 0.1s',
                }}
                onTouchStart={e => e.currentTarget.style.transform = 'scale(1.25)'}
                onTouchEnd={e => e.currentTarget.style.transform = 'scale(1)'}
              >{e}</button>
            ))}
          </div>
        ) : (
          /* 嘲讽列表 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 280, overflowY: 'auto' }}>
            {TAUNT_VOICES.map((text, i) => (
              <button
                key={i}
                onClick={() => onSend('voice', text)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 14, padding: '12px 16px',
                  cursor: 'pointer', textAlign: 'left',
                  color: '#e2e8f0', fontSize: 15, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>🎤</span>
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 胜者动画覆盖层（1s）──────────────────────────────────────
function WinAnimation({ results }) {
  const winners = (results || []).filter(r => r.delta > 0);
  if (winners.length === 0) return null;
  const text = winners.length === 1
    ? `🏆 ${winners[0].nickname} 赢了！`
    : `🏆 ${winners.map(w => w.nickname).join(' & ')} 平分！`;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 45,
      background: 'rgba(0,0,0,0.78)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'win-fade-in 0.25s ease forwards',
    }}>
      <div style={{
        fontSize: 72, lineHeight: 1,
        animation: 'crown-bounce 0.4s ease-in-out infinite alternate',
      }}>👑</div>
      <div style={{
        color: '#f0d060', fontSize: 26, fontWeight: 800, marginTop: 14,
        textShadow: '0 2px 24px rgba(240,208,96,0.9)',
        textAlign: 'center', padding: '0 24px',
      }}>{text}</div>
    </div>
  );
}

// ── 手牌历史面板 ──────────────────────────────────────────────
function HandHistoryPanel({ history, onClose }) {
  const HAND_NAME_MAP_LOCAL = {
    'Royal Flush': '皇家同花顺', 'Straight Flush': '同花顺', 'Four of a Kind': '四条',
    'Full House': '葫芦', 'Flush': '同花', 'Straight': '顺子',
    'Three of a Kind': '三条', 'Two Pair': '两对', 'Pair': '一对', 'High Card': '高牌',
  };
  const items = [...(history || [])].reverse();

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.86)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: '#1a2f4a', borderRadius: 20, padding: 20,
        border: '1px solid rgba(240,208,96,0.28)', width: '100%', maxWidth: 360,
        maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ color: '#f0d060', fontWeight: 700, fontSize: 18, margin: 0 }}>📜 近期手牌</h3>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {items.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '20px 0', fontSize: 14 }}>暂无历史记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((hand, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#f0d060', fontSize: 12, fontWeight: 600 }}>第 {hand.handNum} 局</span>
                  <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11 }}>
                    {new Date(hand.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {/* Community cards */}
                {hand.communityCards?.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
                    {hand.communityCards.map((c, ci) => (
                      <Card key={ci} card={c} size="xs" />
                    ))}
                  </div>
                )}
                {/* Players */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {hand.players.filter(p => p.delta !== 0 || hand.players.length <= 3).map((p, pi) => (
                    <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: p.delta > 0 ? '#4ade80' : 'rgba(255,255,255,0.55)' }}>
                        {p.delta > 0 ? '👑 ' : ''}{p.nickname}
                        {p.handName && <span style={{ color: '#f0d060', marginLeft: 4 }}>({HAND_NAME_MAP_LOCAL[p.handName] || p.handName})</span>}
                      </span>
                      <span style={{ color: p.delta > 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {p.delta > 0 ? `+${p.delta}` : p.delta}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
