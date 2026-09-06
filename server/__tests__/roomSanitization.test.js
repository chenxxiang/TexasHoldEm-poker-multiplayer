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

  test('an early fold sends a stable five-card display board without changing the played board', () => {
    const host = createMockSocket('early-host');
    const guest = createMockSocket('early-guest');
    const io = createMockIo({
      'early-host': host,
      'early-guest': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Host',
      settings: { initialChips: 150, smallBlind: 1, maxRebuyAmount: 150 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;
    guest.handlers.joinRoom({ roomId, nickname: 'Guest' });
    host.handlers.startGame({ roomId });

    host.handlers.playerAction({ roomId, action: 'fold', amount: 0 });

    const hostShowdown = getLastEventPayload(host, 'showdown');
    const guestShowdown = getLastEventPayload(guest, 'showdown');
    expect(hostShowdown.wasMuckWin).toBe(true);
    expect(hostShowdown.room.communityCards).toEqual([]);
    expect(hostShowdown.room.handHistory[0].communityCards).toEqual([]);
    expect(hostShowdown.room.handHistory[0].players).toEqual(expect.arrayContaining([
      expect.objectContaining({ nickname: 'Host', delta: -1, totalProfit: -1 }),
      expect.objectContaining({ nickname: 'Guest', delta: 1, totalProfit: 1 }),
    ]));
    expect(hostShowdown.displayCommunityCards).toHaveLength(5);
    expect(guestShowdown.displayCommunityCards).toEqual(hostShowdown.displayCommunityCards);
    expect(hostShowdown.room).not.toHaveProperty('deck');
    expect(Object.keys(hostShowdown.room).some(key => key.startsWith('_'))).toBe(false);

    guest.handlers.getRoomState({ roomId });
    const reconnectShowdown = getLastEventPayload(guest, 'showdown');
    expect(reconnectShowdown.displayCommunityCards).toEqual(hostShowdown.displayCommunityCards);
  });
});
