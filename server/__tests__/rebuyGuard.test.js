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

describe('补码校验：弃牌但未破产的玩家不能补码', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('手牌进行中、玩家已弃牌但筹码未归零时，补码请求被拒绝，筹码不变', () => {
    const socketA = createMockSocket('sockA');
    const socketB = createMockSocket('sockB');
    const socketC = createMockSocket('sockC');
    const io = createMockIo({ sockA: socketA, sockB: socketB, sockC: socketC });
    socketHandlers(io, socketA);
    socketHandlers(io, socketB);
    socketHandlers(io, socketC);

    socketA.handlers.createRoom({ nickname: 'A', settings: { initialChips: 150, smallBlind: 1, maxRebuyAmount: 150 } });
    const roomId = socketA.emit.mock.calls.find(c => c[0] === 'roomCreated')[1].roomId;
    socketB.handlers.joinRoom({ roomId, nickname: 'B' });
    socketC.handlers.joinRoom({ roomId, nickname: 'C' });
    socketA.handlers.startGame({ roomId });

    // 3-handed: dealer (A) acts first preflop with no blind posted, so A still
    // holds a full stack when folding.
    socketA.handlers.playerAction({ roomId, action: 'fold', amount: 0 });

    function getRoomFor(socket) {
      const call = socket.emit.mock.calls.slice().reverse().find(c => c[1] && c[1].room);
      return call[1].room;
    }

    const roomBefore = getRoomFor(socketA);
    const meBefore = roomBefore.players.find(p => p.nickname === 'A');
    expect(meBefore.folded).toBe(true);
    expect(meBefore.chips).toBeGreaterThan(0);
    expect(roomBefore.phase).not.toBe('waiting');

    socketA.handlers.rebuy({ roomId, amount: 150 });

    expect(socketA.emit).toHaveBeenCalledWith('rebuyError', { code: 'CANNOT_REBUY_NOW' });
    const roomAfter = getRoomFor(socketA);
    const meAfter = roomAfter.players.find(p => p.nickname === 'A');
    expect(meAfter.chips).toBe(meBefore.chips);
    expect(meAfter.rebuyCount || 0).toBe(0);
  });
});
