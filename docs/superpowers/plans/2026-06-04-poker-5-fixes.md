# Poker 5 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 independent issues in the Texas Hold'em game: mobile audio, bubble alignment, mid-game spectator join, hand hint position, and card redesign.

**Architecture:** Each task is self-contained. Tasks 1–4 only touch frontend files. Task 5 also modifies backend `roomManager.js`. No new files are created.

**Tech Stack:** React 19, Socket.IO, Node.js, Jest (server tests only)

---

## File Map

| File | Tasks |
|------|-------|
| `src/components/Card.jsx` | Task 1 |
| `src/pages/GameRoom.jsx` | Task 2, 3, 4 |
| `server/game/roomManager.js` | Task 5 |
| `server/__tests__/roomManager.test.js` | Task 5 |

---

## Task 1: Card UI — bigger numbers, suit-only center

**Files:**
- Modify: `src/components/Card.jsx`

- [ ] **Step 1: Update SIZES and remove suit from corners**

Replace the entire content of `src/components/Card.jsx` with:

```jsx
const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

const SIZES = {
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
```

- [ ] **Step 2: Visual check**

Open the app and confirm:
- Top-left shows only the rank (e.g., "A"), not "A♠"
- Bottom-right shows only the rank (rotated)
- Center suit symbol is noticeably larger than before
- Hidden card (back face) is unchanged

- [ ] **Step 3: Commit**

```bash
cd D:\Claude\texas-poker
git add src/components/Card.jsx
git commit -m "feat: card redesign — larger rank/suit, suit-only center"
```

---

## Task 2: Hand hint — move above table, larger

**Files:**
- Modify: `src/pages/GameRoom.jsx` — two locations

- [ ] **Step 1: Add above-table hint div after CommunityCards block**

In `GameRoom.jsx`, find the `{/* Community cards */}` block (around line 419). After the closing `</div>` of that block, add a new hand hint element:

```jsx
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
```

- [ ] **Step 2: Remove old hint from hole cards div**

Find the existing `myHandHint` block inside the `{/* My hole cards */}` section (around line 450). It looks like:

```jsx
                {myHandHint && (
                  <div style={{
                    background: 'rgba(0,0,0,0.82)', borderRadius: 10,
                    padding: '2px 10px', border: '1px solid rgba(212,175,55,0.4)',
                    color: '#f0d060', fontSize: 11, fontWeight: 700,
                  }}>
                    💡 {myHandHint}
                  </div>
                )}
```

Delete that block entirely (leave the hole cards flex div intact).

- [ ] **Step 3: Visual check**

Start a game, confirm:
- Hint appears centered above the community cards area when you have pocket cards
- Font is clearly larger than before
- Hint disappears on waiting/settlement phases

- [ ] **Step 4: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: move hand hint above table, increase font size"
```

---

## Task 3: Speech bubble — align to avatar circle

**Files:**
- Modify: `src/pages/GameRoom.jsx` — `AvatarTimer` component

- [ ] **Step 1: Move SpeechBubble inside the avatar circle div**

In `AvatarTimer`, find this structure (around line 700–720):

```jsx
  return (
    <div style={posStyle}>
      {/* Speech bubble — floats above avatar */}
      {bubble && <SpeechBubble type={bubble.type} payload={bubble.payload} key={bubble.key} />}

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        ...
      }}>
        ...
        {/* Avatar + ring */}
        <div style={{ position: 'relative', width: sz, height: sz }}>
```

Move the `SpeechBubble` invocation inside the `{position: relative, width: sz, height: sz}` div, as the first child:

```jsx
  return (
    <div style={posStyle}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        opacity: isGrayed ? 0.32 : 1,
        filter: isGrayed ? 'grayscale(1)' : isCurrentTurn ? 'drop-shadow(0 0 10px rgba(212,175,55,0.85))' : 'none',
      }}>
        {/* Avatar + ring */}
        <div style={{ position: 'relative', width: sz, height: sz }}>
          {/* Speech bubble anchored to avatar circle */}
          {bubble && <SpeechBubble type={bubble.type} payload={bubble.payload} key={bubble.key} />}
          {/* ... rest of avatar content unchanged ... */}
```

The `SpeechBubble`'s existing CSS (`position: absolute, bottom: calc(100% + 10px), left: 50%, transform: translateX(-50%)`) is now relative to the avatar circle div (width/height = sz). The bubble tail arrow will point precisely to the avatar center.

- [ ] **Step 2: Visual check**

Send an emoji taunt and confirm:
- The bubble appears directly above the avatar circle (not offset to the side)
- The tail arrow points down to the avatar

- [ ] **Step 3: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "fix: anchor speech bubble to avatar circle for correct alignment"
```

---

## Task 4: Mobile audio — voice cache + pending queue

**Files:**
- Modify: `src/pages/GameRoom.jsx` — module level + two handlers

- [ ] **Step 1: Add module-level voice cache and speakText utility**

At the very top of `GameRoom.jsx`, after all `import` lines and before any `const` declarations, add:

```javascript
// ── Speech synthesis: pre-load voices and handle mobile (Huawei/Android) ──
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
  _loadVoice(); // attempt synchronous load (desktop browsers)
}

function speakText(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (synth.speaking) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.05;
  if (_cachedVoice) u.voice = _cachedVoice;
  synth.speak(u);
}
```

- [ ] **Step 2: Update `sendTaunt` to use `speakText`**

Find the `sendTaunt` function inside `GameRoom` (around line 334). Replace the try/catch speech block:

```javascript
  const sendTaunt = (type, payload) => {
    setShowTauntPicker(false);
    if (type === 'voice') {
      speakText(payload); // uses cached voice; called within user gesture context
    }
    socket.emit('playerTaunt', { roomId, type, payload });
  };
```

- [ ] **Step 3: Add `pendingSpeech` ref and update `onPlayerTaunt`**

Inside `GameRoom`, add a ref after the existing refs (after `roomRef`):

```javascript
  const pendingSpeechRef = useRef(null);
```

Then find the `onPlayerTaunt` handler inside the `useEffect` (around line 247). Replace it:

```javascript
    const onPlayerTaunt = ({ socketId, type, payload }) => {
      if (type === 'voice' && socketId !== socket.id) {
        // Mobile: audio blocked outside user gesture — queue and play on next touch/click
        const playOrQueue = () => {
          speakText(payload);
        };
        try {
          // Try direct play first (works on desktop)
          speakText(payload);
        } catch {}
        // Also register a one-shot touch listener as fallback for mobile autoplay block
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
```

- [ ] **Step 4: Test on desktop and mobile**

Desktop: send a voice taunt — should hear audio immediately.  
Mobile (Huawei): send a voice taunt — audio plays. Receive a taunt from another player — after next tap anywhere on the screen, audio plays.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GameRoom.jsx
git commit -m "fix: mobile audio — cache TTS voice on voiceschanged, queue received taunts for next user gesture"
```

---

## Task 5: Mid-game spectator join

**Files:**
- Modify: `server/game/roomManager.js` — `joinRoom()`
- Modify: `server/__tests__/roomManager.test.js` — add test
- Modify: `src/pages/GameRoom.jsx` — action area + `myReadyStatus` init

### 5a: Backend — allow mid-game join as spectator

- [ ] **Step 1: Write failing test first**

Open `server/__tests__/roomManager.test.js`. Add this test at the end of the test suite:

```javascript
describe('mid-game join', () => {
  test('allows joining as spectator when game is in progress', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('s1', 'Alice', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 });
    manager.joinRoom(room.roomId, 's2', 'Bob');
    manager.startGame(room.roomId);

    const result = manager.joinRoom(room.roomId, 's3', 'Charlie');
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const r = manager.getRoom(room.roomId);
    const charlie = r.players.find(p => p.nickname === 'Charlie');
    expect(charlie).toBeDefined();
    expect(charlie.status).toBe('spectating');
    expect(charlie.folded).toBe(true);
    expect(charlie.hasActed).toBe(true);
    expect(charlie.holeCards).toEqual([]);
  });

  test('mid-game join does not disrupt shouldAdvanceStreet', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('s1', 'Alice', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 });
    manager.joinRoom(room.roomId, 's2', 'Bob');
    manager.startGame(room.roomId);
    manager.joinRoom(room.roomId, 's3', 'Charlie');

    // Charlie is folded=true, so active players are only Alice+Bob
    const r = manager.getRoom(room.roomId);
    const active = r.players.filter(p => !p.folded);
    expect(active.some(p => p.nickname === 'Charlie')).toBe(false);
    expect(active.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd D:\Claude\texas-poker\server
npx jest __tests__/roomManager.test.js --testNamePattern="mid-game join" 2>&1
```

Expected: FAIL — `result.error` is `'GAME_IN_PROGRESS'`

- [ ] **Step 3: Update `roomManager.joinRoom()` to allow mid-game joins**

In `server/game/roomManager.js`, find the `joinRoom` method. Replace the "new player" block:

**Before:**
```javascript
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
```

**After:**
```javascript
    // New player
    if (room.players.length >= 10) return { error: 'ROOM_FULL' };

    const midGame = room.phase !== 'waiting';
    room.players.push({
      socketId,
      nickname,
      chips: room.settings.initialChips,
      seatIndex: room.players.length,
      bet: 0,
      totalBet: 0,
      folded: midGame,       // folded=true keeps them out of current hand's active set
      hasActed: midGame,     // hasActed=true prevents shouldAdvanceStreet from waiting on them
      hasUsedTimeBank: false,
      holeCards: [],
      status: midGame ? 'spectating' : 'active',
      won: 0,
      raiseCount: 0,
      disconnected: false,
      readyStatus: midGame ? 'pending' : 'pending',  // settlement will set to 'spectating'
      voluntaryReveal: false,
    });
    return { success: true, room };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd D:\Claude\texas-poker\server
npx jest __tests__/roomManager.test.js 2>&1
```

Expected: All tests pass including the two new ones.

- [ ] **Step 5: Commit backend change**

```bash
cd D:\Claude\texas-poker
git add server/game/roomManager.js server/__tests__/roomManager.test.js
git commit -m "feat: allow mid-game join as spectator (folded=true, status=spectating)"
```

### 5b: Frontend — spectator indicator + myReadyStatus init

- [ ] **Step 6: Add spectator indicator in action area**

In `GameRoom.jsx`, find the action area `else` branch (around line 549). It has the chip info, turn indicator, error, and rebuy button. Add the spectator message as the first element inside the `else` flex div:

```jsx
          {/* Spectator indicator for mid-game joiners */}
          {me?.status === 'spectating' && room.phase !== 'settlement' && (
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textAlign: 'center' }}>
              👁 观战中 · 等待本局结束后可参与下一局
            </div>
          )}
```

Place it right after the opening `<div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>` line, before the chip info div.

- [ ] **Step 7: Initialize myReadyStatus from room data for mid-game joiners**

Find the `useState` for `myReadyStatus` (around line 136):

```javascript
  const [myReadyStatus, setMyReadyStatus] = useState('pending');
```

Replace with:

```javascript
  const [myReadyStatus, setMyReadyStatus] = useState(() => {
    const initRoom = location.state?.room;
    if (initRoom) {
      const initMe = initRoom.players.find(p => p.socketId === socket.id);
      return initMe?.readyStatus || 'pending';
    }
    return 'pending';
  });
```

This ensures mid-game joiners start with the correct readyStatus from the room snapshot they received on join.

- [ ] **Step 8: Manual test mid-game join flow**

1. Open two browser tabs. Player A creates room, Player B joins, A starts game.
2. Open a third tab. Player C navigates to `/#/` and tries to join the same room ID.
3. Verify: C joins successfully, sees the game in progress with "👁 观战中" message.
4. Wait for the round to end (showdown/settlement). Verify: C sees the settlement screen with "下一局参与" button.
5. C clicks "下一局参与". After all active players click ready, the next hand starts. Verify: C receives hole cards and can act.

- [ ] **Step 9: Commit frontend changes**

```bash
git add src/pages/GameRoom.jsx
git commit -m "feat: mid-game spectator join UI — spectator indicator and readyStatus init"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 spec items have a task. Card redesign (Task 1), hand hint (Task 2), bubble alignment (Task 3), mobile audio (Task 4), mid-game join (Task 5).
- [x] **Placeholder scan:** All code blocks are complete. No TBDs.
- [x] **Type consistency:** `speakText` defined in Task 4 Step 1, used in Steps 2 and 3. `pendingSpeechRef` defined in Step 3, used in same step. `midGame` boolean in `roomManager.js` controls all spectator fields consistently.
- [x] **shouldAdvanceStreet safety:** Mid-game joiners have `folded: true` → excluded from `active` filter → won't block street advancement.
- [x] **startNextHand promotion:** Existing `startNextHand` already promotes `readyStatus !== 'spectating'` → `status = 'active'`. No backend changes needed for the next-hand promotion logic.
