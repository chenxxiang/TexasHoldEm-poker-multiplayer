const socketHandlers = require('../sockets/socketHandlers');

function createMockSocket(id) {
  const handlers = {};
  return {
    id,
    handlers,
    on: (event, callback) => { handlers[event] = callback; },
    join: jest.fn(),
    emit: jest.fn(),
  };
}

function createMockIo(socketsById) {
  return {
    to: id => ({
      emit: (...args) => socketsById[id]?.emit(...args),
    }),
  };
}

function getLastEventPayload(socket, eventName) {
  const call = socket.emit.mock.calls.slice().reverse().find(([event]) => event === eventName);
  return call?.[1];
}

describe('blind all-in flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('heads-up small blind all-in automatically runs the board', () => {
    const host = createMockSocket('short-stack');
    const guest = createMockSocket('deep-stack');
    const io = createMockIo({
      'short-stack': host,
      'deep-stack': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Short',
      settings: { initialChips: 10, smallBlind: 10, maxRebuyAmount: 100 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;

    guest.handlers.joinRoom({ roomId, nickname: 'Deep' });
    guest.handlers.rebuy({ roomId, amount: 90 });
    host.handlers.startGame({ roomId });

    const startedRoom = getLastEventPayload(host, 'gameStarted').room;
    const smallBlind = startedRoom.players.find(p => p.socketId === 'short-stack');
    expect(smallBlind.chips).toBe(0);
    expect(smallBlind.status).toBe('allin');

    jest.advanceTimersByTime(6000);

    const showdown = getLastEventPayload(host, 'showdown');
    expect(showdown).toBeDefined();
    expect(showdown.room.phase).toBe('settlement');
    expect(showdown.room.communityCards).toHaveLength(5);
    expect(showdown.room.players.reduce((sum, player) => sum + player.chips, 0)).toBe(110);
  });
});
