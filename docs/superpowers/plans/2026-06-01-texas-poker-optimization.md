# Texas Hold'em Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6 feature optimizations: persistent rooms with nickname-based reconnection, ready/settlement system with observer mode, total profit stats, avatar SVG circular countdown (configurable), self-only hand type hints, and muck/showdown voluntary card reveal rules.

**Architecture:** Server-side changes to `roomManager.js`, `timerManager.js`, and `socketHandlers.js` handle persistent state and new game phases; client-side `GameRoom.jsx` gains three inline components (`SettlementScreen`, `AvatarTimer`, `HandHint`). `HomePage.jsx` adds one input. No new files.

**Tech Stack:** Node.js + Socket.IO (server), React + Tailwind CSS + pokersolver (client)

---

### Task 1: Parameterize timer duration + add `actionTime` to room settings

**Files:**
- Modify: `server/timerManager.js`
- Modify: `server/game/roomManager.js`
- Modify: `server/sockets/socketHandlers.js`

- [ ] **Step 1: Rewrite TimerManager to accept `duration` parameter**

Replace the entire contents of `server/timerManager.js`:

```js
class TimerManager {
  constructor() {
    this.timers = new Map();
  }

  startTimer(socketId, roomId, duration, onTimeout) {
    this.clearTimer(socketId);
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      this.timers.delete(socketId);
      onTimeout(socketId, roomId);
    }, duration * 1000);
    this.timers.set(socketId, { timeout, startTime, duration, roomId, onTimeout, hasUsedTimeBank: false });
  }

  extendTimer(socketId) {
    const entry = this.timers.get(socketId);
    if (!entry) return { error: 'TIMER_NOT_FOUND' };
    if (entry.hasUsedTimeBank) return { error: 'TIME_BANK_USED' };
    clearTimeout(entry.timeout);
    const { roomId, onTimeout, duration } = entry;
    const newTimeout = setTimeout(() => {
      this.timers.delete(socketId);
      onTimeout(socketId, roomId);
    }, duration * 1000);
    entry.timeout = newTimeout;
    entry.startTime = Date.now();
    entry.hasUsedTimeBank = true;
    return { success: true };
  }

  clearTimer(socketId) {
    const entry = this.timers.get(socketId);
    if (entry) { clearTimeout(entry.timeout); this.timers.delete(socketId); }
  }

  getRemaining(socketId) {
    const entry = this.timers.get(socketId);
    if (!entry) return 0;
    return Math.max(0, entry.duration - (Date.now() - entry.startTime) / 1000);
  }

  clearAll() {
    for (const entry of this.timers.values()) clearTimeout(entry.timeout);
    this.timers.clear();
  }
}

module.exports = TimerManager;
```

- [ ] **Step 2: Add `actionTime` to room settings in `roomManager.createRoom`**

In `server/game/roomManager.js`, in the `createRoom` method, update the `settings` object:

```js
settings: {
  initialChips: settings.initialChips,
  smallBlind: settings.smallBlind,
  maxRebuyAmount: settings.maxRebuyAmount,
  actionTime: settings.actionTime || 20,
},
```

- [ ] **Step 3: Update `startNextPlayerTimer` in socketHandlers to use `actionTime`**

In `server/sockets/socketHandlers.js`, in the `startNextPlayerTimer` function, replace the `timerManager.startTimer` call:

```js
timerManager.startTimer(actor.socketId, room.roomId, room.settings.actionTime || 20, (socketId, roomId) => {
```

And replace the `timerStarted` broadcast:
```js
io.to(room.roomId).emit('timerStarted', {
  socketId: actor.socketId,
  duration: room.settings.actionTime || 20,
  hasTimeBank: !actor.hasUsedTimeBank,
});
```

- [ ] **Step 4: Manual test**

```
cd texas-poker/server && node index.js
# In another terminal:
cd texas-poker && npm start
```
Create a room (default 20s). Join with a 2nd player. Start game. Verify the turn timer fires auto-fold after ~20 seconds, not 60.

- [ ] **Step 5: Commit**

```bash
git add server/timerManager.js server/game/roomManager.js server/sockets/socketHandlers.js
git commit -m "feat: parameterize action timer duration, default 20s"
```

---

### Task 2: Persistent rooms — roomManager reconnect + spectating player support

**Files:**
- Modify: `server/game/roomManager.js`

- [ ] **Step 1: Add new fields to the player template in `createRoom`**

In `createRoom`, add to the initial player object (around line 26):
```js
disconnected: false,
readyStatus: 'pending',
voluntaryReveal: false,
```

- [ ] **Step 2: Replace `joinRoom` to support reconnection**

Replace the entire `joinRoom` method:

```js
joinRoom(roomId, socketId, nickname) {
  const room = this.rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };

  // Reconnect: same nickname already in room
  const existing = room.players.find(p => p.nickname === nickname);
  if (existing) {
    existing.socketId = socketId;
    existing.disconnected = false;
    return { success: true, reconnected: true, room };
  }

  // New player
  if (room.players.length >= 10) return { error: 'ROOM_FULL' };
  if (room.phase !== 'waiting') return { error: 'GAME_IN_PROGRESS' };

  room.players.push({
    socketId,
    nickname,
    chips: room.settings.initialChips,
    seatIndex: room.players.length,
    bet: 0,
    totalBet: 0,
    folded: false,
    hasActed: false,
    hasUsedTimeBank: false,
    holeCards: [],
    status: 'active',
    won: 0,
    raiseCount: 0,
    disconnected: false,
    readyStatus: 'pending',
    voluntaryReveal: false,
  });
  return { success: true, room };
}
```

- [ ] **Step 3: Add `_nextPlayingIndex` helper (skips spectating players)**

Add this method to the class, before `startGame`:

```js
_nextPlayingIndex(room, fromIndex) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    if (room.players[idx]?.status !== 'spectating') return idx;
  }
  return -1;
}
```

- [ ] **Step 4: Replace `startGame` to skip spectating players**

Replace the entire `startGame` method:

```js
startGame(roomId) {
  const room = this.rooms.get(roomId);
  if (!room || room.phase !== 'waiting') return { error: 'GAME_ALREADY_STARTED' };

  const playingPlayers = room.players.filter(p => p.status !== 'spectating');
  if (playingPlayers.length < 2) return { error: 'NOT_ENOUGH_PLAYERS' };

  const n = room.players.length;

  // Advance dealerIndex past any spectating players
  for (let i = 0; i < n; i++) {
    if (room.players[room.dealerIndex % n]?.status !== 'spectating') break;
    room.dealerIndex = (room.dealerIndex + 1) % n;
  }
  const dealerIdx = room.dealerIndex % n;

  // SB/BB/first-to-act use full-array indices, skipping spectating
  const sbIdx = playingPlayers.length === 2
    ? dealerIdx
    : this._nextPlayingIndex(room, dealerIdx);
  const bbIdx = this._nextPlayingIndex(room, sbIdx);
  const firstToActIdx = playingPlayers.length === 2
    ? dealerIdx
    : this._nextPlayingIndex(room, bbIdx);

  const deck = shuffle(createDeck());
  const { hands, remainingDeck } = dealHands(deck, playingPlayers.map(p => p.socketId));

  room.players.forEach(p => {
    if (p.status === 'spectating') {
      p.holeCards = [];
      p.folded = true;
      p.bet = 0;
      p.totalBet = 0;
      p.hasActed = true;
      p.won = 0;
    } else {
      p.holeCards = hands[p.socketId];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = false;
      p.hasActed = false;
      p.hasUsedTimeBank = false;
      p.status = 'active';
      p.won = 0;
      p.raiseCount = 0;
    }
  });

  room.deck = remainingDeck;
  room.communityCards = [];
  room.pot = 0;
  room.loopNum = 0;
  room.actedPlayerIds = new Set();
  room.phase = 'preflop';

  const sbPlayer = room.players[sbIdx];
  const bbPlayer = room.players[bbIdx];
  const sbAmount = Math.min(room.settings.smallBlind, sbPlayer.chips);
  const bbAmount = Math.min(room.settings.smallBlind * 2, bbPlayer.chips);

  sbPlayer.chips -= sbAmount; sbPlayer.bet = sbAmount; sbPlayer.totalBet = sbAmount;
  bbPlayer.chips -= bbAmount; bbPlayer.bet = bbAmount; bbPlayer.totalBet = bbAmount;
  room.pot = sbAmount + bbAmount;
  room.betSize = bbAmount;

  room.currentTurnIndex = firstToActIdx;
  room.lastAggressorIndex = bbIdx;

  return { success: true };
}
```

- [ ] **Step 5: Update `advanceDealer` to skip spectating players**

Replace `advanceDealer`:

```js
advanceDealer(roomId) {
  const room = this.rooms.get(roomId);
  if (!room) return;
  const n = room.players.length;
  for (let i = 0; i < n; i++) {
    room.dealerIndex = (room.dealerIndex + 1) % n;
    if (room.players[room.dealerIndex]?.status !== 'spectating') break;
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/game/roomManager.js
git commit -m "feat: roomManager reconnect by nickname, spectating players skip deal/blinds"
```

---

### Task 3: Persistent rooms — socket disconnect + reconnect handlers

**Files:**
- Modify: `server/sockets/socketHandlers.js`

- [ ] **Step 1: Replace `disconnect` handler**

In `server/sockets/socketHandlers.js`, replace the entire `socket.on('disconnect', ...)` block:

```js
socket.on('disconnect', () => {
  timerManager.clearTimer(socket.id);
  const room = roomManager.getRoomBySocket(socket.id);
  if (!room) return;
  const roomId = room.roomId;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;

  player.disconnected = true;

  // Delete room only when all players disconnected and no active game
  if (room.players.every(p => p.disconnected) && room.phase === 'waiting') {
    roomManager.rooms.delete(roomId);
    return;
  }

  broadcastToEach(io, room, 'gameStateUpdate');
});
```

- [ ] **Step 2: Replace `joinRoom` handler to support reconnection**

Replace the entire `socket.on('joinRoom', ...)` block:

```js
socket.on('joinRoom', ({ roomId, nickname }) => {
  const result = roomManager.joinRoom(roomId, socket.id, nickname);
  if (result.error) { socket.emit('joinError', { code: result.error }); return; }

  socket.join(roomId);

  if (result.reconnected) {
    socket.emit('gameStateUpdate', { room: sanitizeRoom(result.room, socket.id) });
    io.to(roomId).emit('playerReconnected', { nickname, socketId: socket.id });
    return;
  }

  socket.emit('joinedRoom', { room: sanitizeRoom(result.room, socket.id) });
  for (const player of result.room.players) {
    if (player.socketId !== socket.id) {
      io.to(player.socketId).emit('playerJoined', { room: sanitizeRoom(result.room, player.socketId) });
    }
  }
});
```

- [ ] **Step 3: Manual test for reconnection**

1. Open two browser tabs. Both join the same room (player A + player B). Start game.
2. Close player A's tab.
3. Open a new tab, navigate to the same room URL, enter the **same nickname** as player A.
4. Expected: player A reconnects and sees the current game state (not "GAME_IN_PROGRESS" error).
5. Expected: player B sees a message that player A reconnected.

- [ ] **Step 4: Commit**

```bash
git add server/sockets/socketHandlers.js
git commit -m "feat: persistent disconnect mark, nickname-based reconnection"
```

---

### Task 4: Settlement system — server side

**Files:**
- Modify: `server/sockets/socketHandlers.js`

- [ ] **Step 1: Add `checkAllReadyAndStart` and `startNextHand` helper functions**

Inside `module.exports = (io, socket) => {`, add these two functions after the `sanitizeRoom` function at the bottom:

```js
function checkAllReadyAndStart(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || room.phase !== 'settlement') return;

  const allChosen = room.players.every(p => p.readyStatus !== 'pending');
  if (!allChosen) return;

  const readyCount = room.players.filter(
    p => p.readyStatus === 'ready' || p.readyStatus === 'queued'
  ).length;

  if (readyCount < 2) {
    broadcastToEach(io, room, 'gameStateUpdate');
    return;
  }

  startNextHand(roomId);
}

function startNextHand(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  if (room._settlementTimeout) {
    clearTimeout(room._settlementTimeout);
    room._settlementTimeout = null;
  }

  roomManager.advanceDealer(roomId);

  room.players.forEach(p => {
    if (p.readyStatus === 'spectating') {
      p.status = 'spectating';
    } else {
      p.status = 'active';
      if (p.chips === 0) {
        p.chips = room.settings.initialChips;
        p.rebuyCount = (p.rebuyCount || 0) + 1;
      }
    }
    p.holeCards = [];
    p.won = 0;
    p.bet = 0;
    p.totalBet = 0;
    p.folded = false;
    p.hasActed = false;
    p.hasUsedTimeBank = false;
    p.raiseCount = 0;
    p.readyStatus = 'pending';
    p.voluntaryReveal = false;
  });

  room.communityCards = [];
  room.pot = 0;
  room.deck = [];
  room.betSize = room.settings.smallBlind * 2;
  room.loopNum = 0;
  room.actedPlayerIds = new Set();
  room.currentTurnIndex = -1;
  room.phase = 'waiting';

  const result = roomManager.startGame(roomId);
  if (!result.error) {
    const next = roomManager.getRoom(roomId);
    broadcastToEach(io, next, 'gameStarted');
    startNextPlayerTimer(next);
  } else {
    broadcastToEach(io, room, 'gameStateUpdate');
  }
}
```

- [ ] **Step 2: Add `playerReadyStatus` and `queueForNextHand` socket event handlers**

Add these inside `module.exports`, before the `disconnect` handler:

```js
socket.on('playerReadyStatus', ({ roomId, status }) => {
  const room = roomManager.getRoom(roomId);
  if (!room || room.phase !== 'settlement') return;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;
  player.readyStatus = status; // 'ready' or 'spectating'
  broadcastToEach(io, room, 'gameStateUpdate');
  checkAllReadyAndStart(roomId);
});

socket.on('queueForNextHand', ({ roomId }) => {
  const room = roomManager.getRoom(roomId);
  if (!room) return;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;
  player.readyStatus = 'queued';
  broadcastToEach(io, room, 'gameStateUpdate');
});
```

- [ ] **Step 3: Replace the `setTimeout` auto-start block at the end of `resolveShowdown`**

In `resolveShowdown`, find the `setTimeout(() => { ... }, 5000)` block at the bottom and replace the entire block (from `setTimeout` to its closing `};`) with:

```js
room.phase = 'settlement';
room.players.forEach(p => { p.readyStatus = 'pending'; });

// Build per-hand results with hand names from pokersolver
const { Hand } = require('pokersolver');
const community = room.communityCards.map(c => c.code);
const baseResults = room.players.map(p => {
  let handName = null;
  if (!p.folded && active.length > 1) {
    try {
      handName = Hand.solve([...p.holeCards.map(c => c.code), ...community]).name;
    } catch (e) { /* ignore */ }
  }
  return {
    socketId: p.socketId,
    nickname: p.nickname,
    delta: p.won - (p.totalBet || 0),
    handName,
  };
});

const wasMuckWin = active.length === 1;
const settlementDeadline = Date.now() + 60000;

// Send each player their personalized result view
for (const player of room.players) {
  const playerResults = baseResults.map(r => {
    const p = room.players.find(x => x.socketId === r.socketId);
    const canSeeCards = !wasMuckWin
      || r.socketId === player.socketId
      || (p && p.voluntaryReveal);
    const holeCards = canSeeCards && p && !p.folded
      ? p.holeCards
      : p && p.folded ? [] : ['hidden', 'hidden'];
    return { ...r, holeCards };
  });
  io.to(player.socketId).emit('showdown', {
    room: sanitizeRoom(room, player.socketId),
    results: playerResults,
    wasMuckWin,
    settlementDeadline,
  });
}

// 60-second timeout: auto-spectate pending players
room._settlementTimeout = setTimeout(() => {
  const r = roomManager.getRoom(roomId);
  if (!r || r.phase !== 'settlement') return;
  r.players.forEach(p => {
    if (p.readyStatus === 'pending') p.readyStatus = 'spectating';
  });
  const readyCount = r.players.filter(
    p => p.readyStatus === 'ready' || p.readyStatus === 'queued'
  ).length;
  if (readyCount >= 2) {
    startNextHand(roomId);
  } else {
    broadcastToEach(io, r, 'gameStateUpdate');
  }
}, 60000);
```

- [ ] **Step 4: Manual test**

1. Play a 2-player game to completion (fold or showdown).
2. Expected: game does NOT auto-start a new hand. Server logs should show `phase = 'settlement'`.
3. Both players' `gameStateUpdate` payloads should have `phase: 'settlement'` (check browser DevTools → WS messages).

- [ ] **Step 5: Commit**

```bash
git add server/sockets/socketHandlers.js
git commit -m "feat: settlement phase, ready/spectate system, 60s timeout"
```

---

### Task 5: Muck win distinction + voluntary `revealCards`

**Files:**
- Modify: `server/sockets/socketHandlers.js`

- [ ] **Step 1: Add `revealCards` socket event handler**

Add inside `module.exports`, before the `disconnect` handler:

```js
socket.on('revealCards', ({ roomId }) => {
  const room = roomManager.getRoom(roomId);
  if (!room || room.phase !== 'settlement') return;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;
  player.voluntaryReveal = true;
  io.to(roomId).emit('cardRevealed', {
    socketId: socket.id,
    holeCards: player.holeCards,
  });
});
```

- [ ] **Step 2: Manual test — muck win card hiding**

1. Start a 3-player game.
2. Two players fold immediately (uncontested win).
3. In browser DevTools → Network → WS, find the `showdown` event received by a losing player.
4. Expected: the winner's `holeCards` in `results` is `["hidden", "hidden"]`.
5. Winner clicks "亮牌" (to be wired in Task 7).
6. Expected: a `cardRevealed` event fires with the winner's actual hole cards.

- [ ] **Step 3: Commit**

```bash
git add server/sockets/socketHandlers.js
git commit -m "feat: muck win hides winner cards, revealCards for voluntary show"
```

---

### Task 6: HomePage — `actionTime` input

**Files:**
- Modify: `src/pages/HomePage.jsx`

- [ ] **Step 1: Add `actionTime` state**

In `HomePage`, after the existing `useState` declarations, add:
```js
const [actionTime, setActionTime] = useState(20);
```

- [ ] **Step 2: Include `actionTime` in the `createRoom` emit**

In `handleCreate`, update the socket emit:
```js
socket.emit('createRoom', {
  nickname: nickname.trim(),
  settings: { initialChips, smallBlind, maxRebuyAmount: maxRebuy, actionTime },
});
```

- [ ] **Step 3: Replace the 3-column grid with a 2×2 grid that includes `actionTime`**

Replace the `<div className="grid grid-cols-3 gap-3">` block (and its 3 children) with:

```jsx
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
```

Also update the info text below the grid:
```jsx
<p className="text-gold/40 text-xs text-center">
  大盲注 {smallBlind * 2} | 初始筹码 {initialChips} | 时限 {actionTime}s
</p>
```

- [ ] **Step 4: Manual test**

Open homepage → "创建房间" tab. Verify: 4 inputs in a 2×2 grid; "行动时限" defaults to 20.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.jsx
git commit -m "feat: action time input in room creation form"
```

---

### Task 7: GameRoom — settlement events + `SettlementScreen` component

**Files:**
- Modify: `src/pages/GameRoom.jsx`

- [ ] **Step 1: Add `pokersolver` import and module-level constants**

At the top of `GameRoom.jsx`, after the existing imports, add:
```js
import { Hand } from 'pokersolver';
```

After all imports (before the component functions), add these module-level constants:
```js
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
```

- [ ] **Step 2: Add settlement state to `GameRoom` component**

In the `GameRoom` function, after the existing state declarations, add:
```js
const [settlementData, setSettlementData] = useState(null);
const [settlementDeadline, setSettlementDeadline] = useState(null);
const [settlementCountdown, setSettlementCountdown] = useState(0);
const [cardReveals, setCardReveals] = useState({});
const [myReadyStatus, setMyReadyStatus] = useState('pending');
```

- [ ] **Step 3: Add settlement countdown effect**

Add this `useEffect` after the existing effects:
```js
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
```

- [ ] **Step 4: Update socket event handlers**

In the `useEffect` that registers socket events:

Replace the existing `onShowdown` handler:
```js
const onShowdown = ({ room: r, results, wasMuckWin, settlementDeadline: deadline }) => {
  setRoom(r);
  setSettlementData({ results: results || [], wasMuckWin });
  setSettlementDeadline(deadline);
  setCardReveals({});
  setMyReadyStatus('pending');
  const winners = (results || []).filter(x => x.delta > 0).map(x => x.nickname);
  setMessage(winners.length ? `🏆 ${winners.join('、')} 获胜！` : '');
};
```

Update `onStarted` to clear settlement state:
```js
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
```

Add new handlers:
```js
const onCardRevealed = ({ socketId, holeCards }) => {
  setCardReveals(prev => ({ ...prev, [socketId]: holeCards }));
};
const onPlayerReconnected = ({ nickname }) => setMessage(`${nickname} 重新连线了`);
```

Add these to the socket registration:
```js
socket.on('cardRevealed', onCardRevealed);
socket.on('playerReconnected', onPlayerReconnected);
```

Add to cleanup:
```js
socket.off('cardRevealed', onCardRevealed);
socket.off('playerReconnected', onPlayerReconnected);
```

- [ ] **Step 5: Add action handler functions in `GameRoom` component body**

Add before the `return (`:
```js
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
```

- [ ] **Step 6: Update GameRoom render to show settlement screen**

In the main render's content area, update the phase-switching logic. Find the section where `room.phase === 'waiting'` determines content and wrap it:

```jsx
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
    {/* existing game-in-progress JSX: PokerTable + bottom action area */}
  </>
)}
```

Also, remove the old `ShowdownOverlay` component and its usage from inside `PokerTable` since settlement is now a full screen.

- [ ] **Step 7: Add `SettlementScreen` component**

Add this component at the bottom of `GameRoom.jsx`, before `export default`:

```jsx
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
```

- [ ] **Step 8: Manual test**

1. Play a hand to showdown (both players call/check to the end).
2. Expected: settlement screen appears with winner +amount and loser -amount, hand type shown (e.g. "高牌").
3. Winner clicks "亮牌" → cards appear for all.
4. Player A clicks "准备", player B clicks "准备" → new hand starts immediately.
5. Play hand where one player folds → settlement screen shows winner's cards as "?" to the other player.

- [ ] **Step 9: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: settlement screen with ready/spectate/reveal-cards UI"
```

---

### Task 8: GameRoom — `AvatarTimer` (circular SVG countdown)

**Files:**
- Modify: `src/pages/GameRoom.jsx`

- [ ] **Step 1: Add `HandHint` stub (full implementation comes in Task 9)**

Add this stub before `AvatarTimer`. Task 9 will replace it with the real implementation:

```jsx
function HandHint() { return null; }
```

- [ ] **Step 2: Replace `PlayerSeat` with `AvatarTimer` component**

Replace the entire `PlayerSeat` function with:

```jsx
function AvatarTimer({ player, seatPos, posStyle, isCurrentTurn, isMe, posLabel, avatarIdx, timerInfo, countdown, communityCards }) {
  const CIRCUMFERENCE = 2 * Math.PI * 20;
  const duration = timerInfo?.duration || 20;
  const progress = isCurrentTurn && countdown > 0 ? countdown / duration : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const ringColor = countdown > duration * 0.5 ? '#4ade80'
    : countdown > duration * 0.25 ? '#facc15'
    : '#ef4444';
  const isLowTime = isCurrentTurn && countdown > 0 && countdown <= duration * 0.25;

  const isGrayed = player.disconnected || player.status === 'spectating';

  return (
    <div className="absolute" style={posStyle}>
      <div
        className={`flex flex-col items-center gap-0.5 ${isCurrentTurn ? 'filter drop-shadow-[0_0_10px_rgba(212,175,55,0.9)]' : ''}`}
        style={{ minWidth: 80, opacity: isGrayed ? 0.35 : 1, filter: isGrayed ? 'grayscale(1)' : 'none' }}
      >
        {/* 头像容器 + SVG 圆环 */}
        <div className="relative" style={{ width: 48, height: 48 }}>
          <div style={{
            transform: isCurrentTurn ? 'scale(1.25)' : 'scale(1)',
            transition: 'transform 0.2s ease',
            width: '100%', height: '100%',
          }}>
            <div
              className={`w-full h-full rounded-full flex items-center justify-center text-xl border-2 ${isCurrentTurn ? 'border-gold' : isMe ? 'border-blue-400' : 'border-white/20'} ${player.folded && player.status !== 'spectating' ? 'opacity-40' : ''}`}
              style={{ background: isMe ? '#1e3a6e' : '#2d2d2d' }}
            >
              {AVATARS[avatarIdx]}
            </div>
          </div>

          {/* SVG 倒计时圆环 */}
          {isCurrentTurn && timerInfo && countdown > 0 && (
            <div className={isLowTime ? 'animate-pulse' : ''} style={{ position: 'absolute', inset: -5, width: 58, height: 58, pointerEvents: 'none' }}>
              <svg viewBox="0 0 48 48" width="58" height="58">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r="20"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="3.5"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 24 24)"
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
                />
              </svg>
            </div>
          )}

          {/* 位置标签 */}
          {posLabel && (
            <span className={`absolute -top-1 -right-1 font-bold px-1 rounded text-black z-10 ${
              posLabel === 'D' ? 'bg-white' : posLabel === 'SB' ? 'bg-blue-300' : posLabel === 'BB' ? 'bg-yellow-400' : 'bg-gray-300'
            }`} style={{ fontSize: 9 }}>
              {posLabel}
            </span>
          )}
        </div>

        {/* 名字 + 筹码信息 */}
        <div className={`text-center ${player.folded && player.status !== 'spectating' ? 'opacity-40' : ''}`}>
          <div className="text-xs font-medium leading-tight truncate" style={{ maxWidth: 80 }}>
            {player.nickname}{isMe ? ' (我)' : ''}
          </div>
          <div className="text-gold text-xs font-bold">{player.chips}</div>
          {player.bet > 0 && <div className="text-yellow-300 text-xs">注:{player.bet}</div>}
          {player.status === 'allin' && !player.folded && <span className="text-yellow-400 text-xs font-bold">ALL-IN</span>}
          {player.folded && player.status !== 'spectating' && <span className="text-red-400 text-xs">弃牌</span>}
          {player.status === 'spectating' && <span className="text-white/40 text-xs">👁 观战</span>}
          {player.disconnected && !player.status === 'spectating' && <span className="text-white/40 text-xs">📡 断线</span>}
        </div>

        {/* 手牌 + 牌型提示（仅自己可见） */}
        {seatPos === 0 && isMe ? (
          <>
            {(player.holeCards || []).length > 0 && (
              <div className="flex gap-1 mt-1">
                {player.holeCards.map((card, i) => <Card key={i} card={card} size="md" />)}
              </div>
            )}
            <HandHint holeCards={player.holeCards || []} communityCards={communityCards || []} />
          </>
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
```

- [ ] **Step 3: Update `PokerTable` to use `AvatarTimer` and remove center timer bar**

In `PokerTable`, replace the `PlayerSeat` call with `AvatarTimer`:

```jsx
{orderedPlayers.map((player, seatPos) => {
  const pos = SEAT_POS[seatPos] || { x: 50, y: 50 };
  const origIdx = (myIdx + seatPos) % n;
  const isThisPlayersTurn = room.currentTurnIndex === origIdx;
  return (
    <AvatarTimer
      key={player.socketId}
      player={player}
      seatPos={seatPos}
      posStyle={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
      isCurrentTurn={isThisPlayersTurn}
      isMe={player.socketId === mySocketId}
      posLabel={room.phase !== 'waiting' ? getPositionLabel(origIdx, room.dealerIndex ?? 0, n) : null}
      avatarIdx={player.seatIndex % AVATARS.length}
      timerInfo={timerInfo}
      countdown={isThisPlayersTurn ? countdown : 0}
      communityCards={room.communityCards}
    />
  );
})}
```

Inside the ellipse table div, remove the `{timerInfo && countdown > 0 && (...)}` block (the old timer bar). Keep only the community cards and pot display.

- [ ] **Step 4: Update turn status text in bottom bar to include countdown seconds**

In the bottom action area, update the "waiting for player" text:

```jsx
if (curPlayer && curPlayer.chips > 0) {
  return (
    <span className="text-white/50 text-sm">
      等待 {curPlayer.nickname}... {timerInfo && countdown > 0 ? `${countdown}s` : ''}
    </span>
  );
}
```

- [ ] **Step 5: Manual test**

1. Start a game. When a player's turn starts:
   - Their avatar enlarges slightly (scale 1.25).
   - A green arc appears around the avatar and shrinks clockwise.
2. When ~25% time remains, ring turns red and pulses.
3. At 0 seconds, auto-action fires and next player's ring starts.
4. Disconnected player: avatar shows greyed-out with "📡 断线".
5. Spectating player: avatar greyed-out with "👁 观战".

- [ ] **Step 6: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: AvatarTimer with circular SVG countdown, greyed avatars for disconnected/spectating"
```

---

### Task 9: GameRoom — `HandHint` component (self-only)

**Files:**
- Modify: `src/pages/GameRoom.jsx`

`HandHint` stub was added in Task 8. This task replaces it with the real implementation.

- [ ] **Step 1: Replace the `HandHint` stub with the real implementation**

Replace `function HandHint() { return null; }` with:

```jsx
function HandHint({ holeCards, communityCards }) {
  const hint = useMemo(() => {
    if (!holeCards || holeCards.length < 2) return null;
    try {
      const allRaw = [...holeCards, ...communityCards];
      const all = allRaw
        .map(c => convertCardCode(typeof c === 'string' ? c : c?.code))
        .filter(Boolean);
      if (all.length < 2) return null;
      const hand = Hand.solve(all);
      return HAND_NAME_MAP[hand.name] || hand.name;
    } catch (e) { return null; }
  }, [holeCards, communityCards]);

  if (!hint) return null;

  return (
    <div className="mt-0.5 px-2 py-0.5 bg-black/60 rounded text-xs text-yellow-300 border border-yellow-500/20 text-center max-w-[80px]">
      💡 {hint}
    </div>
  );
}
```

Note: `Hand` and `HAND_NAME_MAP` are already available at module scope (added in Task 7 Step 1). `convertCardCode` is also module-scope (Task 7 Step 1). `useMemo` must be imported from React — verify the import at the top of the file includes it:
```js
import { useState, useEffect, useRef, useMemo } from 'react';
```

- [ ] **Step 2: Manual test**

1. Start a game. In your own seat (bottom center):
   - Pre-flop: hint shows "高牌" or "一对" (depending on hole cards).
   - After flop: hint updates to reflect best 5-card combination.
   - "两对", "同花", "顺子" etc. all show correct Chinese names.
2. Verify: hint does NOT appear on other players' seats.
3. Verify: hint disappears in settlement/waiting phases (hole cards cleared).

- [ ] **Step 3: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: self-only hand type hint with Chinese names"
```

---

### Task 10: GameRoom — Scoreboard total profit

**Files:**
- Modify: `src/pages/GameRoom.jsx`

(Avatar greying is already done in Task 8's `AvatarTimer`. This task only updates the scoreboard.)

- [ ] **Step 1: Replace `Scoreboard` component with total profit display**

Replace the entire `Scoreboard` function:

```jsx
function Scoreboard({ room, mySocketId }) {
  const sorted = [...room.players].sort((a, b) => b.chips - a.chips);
  return (
    <div className="w-44 bg-felt border-l border-gold/20 flex flex-col flex-shrink-0">
      <div className="px-3 py-2 border-b border-gold/20 text-center">
        <p className="text-gold text-sm font-bold">📊 记分牌</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {sorted.map((p, rank) => {
          const totalProfit = p.chips
            - room.settings.initialChips
            - (p.rebuyCount || 0) * room.settings.initialChips;
          return (
            <div key={p.socketId}
              className={`rounded-lg px-2 py-1.5 flex items-center justify-between text-xs ${p.socketId === mySocketId ? 'bg-blue-900/40 border border-blue-500/30' : 'bg-felt-dark/60'}`}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`font-bold flex-shrink-0 ${rank === 0 ? 'text-gold' : 'text-white/40'}`}>#{rank + 1}</span>
                <span className="truncate">{p.nickname}</span>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-gold font-bold">{p.chips}</div>
                {totalProfit !== 0 && (
                  <div className={totalProfit > 0 ? 'text-green-400' : 'text-red-400'} style={{ fontSize: 9 }}>
                    {totalProfit > 0 ? `+${totalProfit}` : totalProfit}
                  </div>
                )}
                {(p.rebuyCount || 0) > 0 && (
                  <div className="text-orange-300" style={{ fontSize: 9 }}>补{p.rebuyCount}次</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-gold/20 text-xs text-white/30 text-center">
        大盲 {(room.settings?.smallBlind || 0) * 2} | 局#{(room.dealerIndex ?? 0) + 1}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual test**

1. Open scoreboard (📊 button). Player starts with 1000 chips (initial).
2. After winning a hand: chips = 1300, 0 rebuys → profit = 1300 - 1000 - 0 = +300 → shows green `+300`.
3. Player rebuys once, chips = 800 → profit = 800 - 1000 - 1000 = -1200 → shows red `-1200`.
4. Player with 0 net change shows no profit line.

- [ ] **Step 3: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: scoreboard shows total profit (chips - initial - rebuys)"
```
