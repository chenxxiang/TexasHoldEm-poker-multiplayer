const TimerManager = require('../timerManager');
const socketHandlers = require('../sockets/socketHandlers');

function createMockSocket(id) {
  const handlers = {};
  return {
    id,
    handlers,
    on: (event, cb) => { handlers[event] = cb; },
    join: jest.fn(),
    emit: jest.fn(),
  };
}

function createMockIo(socketsById) {
  return {
    to: (id) => ({
      emit: (...args) => {
        const target = socketsById[id];
        if (target) target.emit(...args);
      },
    }),
  };
}

function totalChips(room) {
  return room.players.reduce((s, p) => s + p.chips, 0) + room.pot;
}

describe('筹码守恒 - 计时器与玩家操作竞态', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('一手牌结算后，之前遗留的计时器仍触发时不应重复结算（回归 handNum 重复/筹码漂移问题）', () => {
    const startTimerSpy = jest.spyOn(TimerManager.prototype, 'startTimer');

    const socketA = createMockSocket('sockA');
    const socketB = createMockSocket('sockB');
    const io = createMockIo({ sockA: socketA, sockB: socketB });
    socketHandlers(io, socketA);
    socketHandlers(io, socketB);

    socketA.handlers.createRoom({ nickname: 'A', settings: { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 } });
    const roomId = socketA.emit.mock.calls.find(c => c[0] === 'roomCreated')[1].roomId;
    socketB.handlers.joinRoom({ roomId, nickname: 'B' });
    socketA.handlers.startGame({ roomId });

    function getRoom() {
      // Read the latest broadcast room snapshot handed to either player.
      const calls = socketA.emit.mock.calls.concat(socketB.emit.mock.calls);
      for (let i = calls.length - 1; i >= 0; i--) {
        if (calls[i][1] && calls[i][1].room) return calls[i][1].room;
      }
      return null;
    }

    // Preflop: A (dealer/SB, acts first heads-up) calls, B checks to close the street.
    socketA.handlers.playerAction({ roomId, action: 'call', amount: 0 });
    socketB.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    // Flop: B acts first postflop.
    socketB.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    socketA.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    // Turn.
    socketB.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    socketA.handlers.playerAction({ roomId, action: 'check', amount: 0 });

    // River: capture the timer registered for B's river turn — this is the one
    // that, in production, can still be in-flight (immune to clearTimer) when the
    // real click for the NEXT action already arrived and resolved the whole hand.
    const staleCall = startTimerSpy.mock.calls[startTimerSpy.mock.calls.length - 1];
    const [staleRoomId, staleNickname, , staleOnTimeout] = staleCall;
    expect(staleNickname).toBe('B');

    socketB.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    socketA.handlers.playerAction({ roomId, action: 'check', amount: 0 }); // closes river -> showdown -> settlement

    const roomAfterShowdown = getRoom();
    expect(roomAfterShowdown.phase).toBe('settlement');
    const potBefore = roomAfterShowdown.pot;
    const handHistoryLenBefore = roomAfterShowdown.handHistory.length;
    const totalBefore = totalChips(roomAfterShowdown);

    // Simulate the stale timer firing AFTER the hand has already been settled.
    // currentTurnIndex now points back at B (post-river turn-order recompute),
    // so the nickname-match guard alone does not stop this.
    staleOnTimeout(staleNickname, staleRoomId);

    const roomAfterStaleTimeout = getRoom();
    expect(roomAfterStaleTimeout.handHistory.length).toBe(handHistoryLenBefore);
    expect(roomAfterStaleTimeout.pot).toBe(potBefore);
    expect(totalChips(roomAfterStaleTimeout)).toBe(totalBefore);

    const currentActor = roomAfterStaleTimeout.players[roomAfterStaleTimeout.currentTurnIndex];
    const actorSocket = currentActor.socketId === 'sockA' ? socketA : socketB;
    actorSocket.handlers.playerAction({ roomId, action: 'allin', amount: 0 });
    expect(actorSocket.emit).toHaveBeenCalledWith('actionError', { code: 'HAND_NOT_ACTIVE' });

    socketA.handlers.getRoomState({ roomId });
    const roomAfterDelayedAction = getRoom();
    expect(roomAfterDelayedAction.handHistory.length).toBe(handHistoryLenBefore);
    expect(roomAfterDelayedAction.pot).toBe(potBefore);
    expect(totalChips(roomAfterDelayedAction)).toBe(totalBefore);
  });

  test('上一局的计时器在下一局同名玩家行动时触发，不应改变新局状态', () => {
    const startTimerSpy = jest.spyOn(TimerManager.prototype, 'startTimer');

    const socketA = createMockSocket('next-hand-a');
    const socketB = createMockSocket('next-hand-b');
    const io = createMockIo({
      'next-hand-a': socketA,
      'next-hand-b': socketB,
    });
    socketHandlers(io, socketA);
    socketHandlers(io, socketB);

    socketA.handlers.createRoom({ nickname: 'A', settings: { initialChips: 150, maxRebuyAmount: 150 } });
    const roomId = socketA.emit.mock.calls.find(c => c[0] === 'roomCreated')[1].roomId;
    socketB.handlers.joinRoom({ roomId, nickname: 'B' });
    socketA.handlers.startGame({ roomId });

    socketA.handlers.playerAction({ roomId, action: 'call', amount: 0 });
    const staleCall = startTimerSpy.mock.calls[startTimerSpy.mock.calls.length - 1];
    const [staleRoomId, staleNickname, , staleOnTimeout] = staleCall;
    expect(staleNickname).toBe('B');

    socketB.handlers.playerAction({ roomId, action: 'fold', amount: 0 });
    const showdownCount = socketA.emit.mock.calls.filter(([event]) => event === 'showdown').length;

    socketA.handlers.playerReadyStatus({ roomId, status: 'ready' });
    socketB.handlers.playerReadyStatus({ roomId, status: 'ready' });
    const secondHand = socketA.emit.mock.calls.filter(([event]) => event === 'gameStarted').at(-1)[1].room;
    expect(secondHand.phase).toBe('preflop');
    expect(secondHand.players[secondHand.currentTurnIndex].nickname).toBe('B');

    staleOnTimeout(staleNickname, staleRoomId);

    expect(socketA.emit.mock.calls.filter(([event]) => event === 'showdown')).toHaveLength(showdownCount);
    expect(socketA.emit.mock.calls.filter(([event]) => event === 'timedOut')).toHaveLength(0);
    socketA.handlers.getRoomState({ roomId });
    const currentRoom = socketA.emit.mock.calls.filter(([event]) => event === 'gameStateUpdate').at(-1)[1].room;
    expect(currentRoom.phase).toBe('preflop');
    expect(currentRoom.players.find(player => player.nickname === 'B').folded).toBe(false);
  });
});
