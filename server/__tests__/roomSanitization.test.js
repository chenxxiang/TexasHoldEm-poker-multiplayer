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

describe('room state sanitization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('game state never exposes the deck or another player hand', () => {
    const host = createMockSocket('host-socket');
    const guest = createMockSocket('guest-socket');
    const io = createMockIo({
      'host-socket': host,
      'guest-socket': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Host',
      settings: { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;

    guest.handlers.joinRoom({ roomId, nickname: 'Guest' });
    host.handlers.startGame({ roomId });

    const hostRoom = getLastEventPayload(host, 'gameStarted').room;
    const guestRoom = getLastEventPayload(guest, 'gameStarted').room;

    expect(hostRoom).not.toHaveProperty('deck');
    expect(guestRoom).not.toHaveProperty('deck');
    expect(Object.keys(hostRoom).some(key => key.startsWith('_'))).toBe(false);

    expect(hostRoom.players.find(p => p.socketId === 'host-socket').holeCards).toHaveLength(2);
    expect(hostRoom.players.find(p => p.socketId === 'guest-socket').holeCards).toEqual(['hidden', 'hidden']);
    expect(guestRoom.players.find(p => p.socketId === 'guest-socket').holeCards).toHaveLength(2);
    expect(guestRoom.players.find(p => p.socketId === 'host-socket').holeCards).toEqual(['hidden', 'hidden']);
  });
});
