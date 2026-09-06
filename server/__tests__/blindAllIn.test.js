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
      settings: { initialChips: 1, smallBlind: 10, maxRebuyAmount: 100 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;

    guest.handlers.joinRoom({ roomId, nickname: 'Deep' });
    guest.handlers.rebuy({ roomId, amount: 99 });
    host.handlers.startGame({ roomId });

    const startedRoom = getLastEventPayload(host, 'gameStarted').room;
    const smallBlind = startedRoom.players.find(p => p.socketId === 'short-stack');
    expect(smallBlind.chips).toBe(0);
    expect(smallBlind.status).toBe('allin');

    const autoRunRoom = getLastEventPayload(host, 'gameStateUpdate').room;
    expect(autoRunRoom.autoRunningBoard).toBe(true);

    jest.advanceTimersByTime(499);
    expect(getLastEventPayload(host, 'gameStateUpdate').room.communityCards).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(getLastEventPayload(host, 'gameStateUpdate').room.communityCards).toHaveLength(3);

    // The deep stack has no further betting decision once every opponent is
    // all-in. Actions sent during the runout must not advance or duplicate it.
    guest.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    expect(getLastEventPayload(guest, 'actionError')).toEqual({ code: 'AUTO_RUN_IN_PROGRESS' });
    expect(getLastEventPayload(host, 'gameStateUpdate').room.communityCards).toHaveLength(3);

    jest.advanceTimersByTime(1500);

    const showdown = getLastEventPayload(host, 'showdown');
    expect(showdown).toBeDefined();
    expect(showdown.room.phase).toBe('settlement');
    expect(showdown.room.communityCards).toHaveLength(5);
    expect(showdown.room.players.reduce((sum, player) => sum + player.chips, 0)).toBe(101);
    expect(showdown.room.handHistory).toHaveLength(1);

    jest.advanceTimersByTime(2000);
    expect(host.emit.mock.calls.filter(([event]) => event === 'showdown')).toHaveLength(1);
  });

  test('waits 500ms before dealing when a call leaves only one funded player', () => {
    const host = createMockSocket('short-caller');
    const guest = createMockSocket('deep-caller');
    const io = createMockIo({
      'short-caller': host,
      'deep-caller': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Short',
      settings: { initialChips: 10, smallBlind: 1, maxRebuyAmount: 100 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;

    guest.handlers.joinRoom({ roomId, nickname: 'Deep' });
    guest.handlers.rebuy({ roomId, amount: 90 });
    host.handlers.startGame({ roomId });

    host.handlers.playerAction({ roomId, action: 'allin', amount: 0 });
    guest.handlers.playerAction({ roomId, action: 'call', amount: 0 });

    const autoRunRoom = getLastEventPayload(host, 'gameStateUpdate').room;
    expect(autoRunRoom.autoRunningBoard).toBe(true);
    expect(autoRunRoom.communityCards).toHaveLength(0);

    jest.advanceTimersByTime(499);
    expect(getLastEventPayload(host, 'gameStateUpdate').room.communityCards).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(getLastEventPayload(host, 'gameStateUpdate').room.communityCards).toHaveLength(3);
  });

  test('short big blind all-in does not lower the full blind owed by the small blind', () => {
    const host = createMockSocket('deep-small-blind');
    const guest = createMockSocket('short-big-blind');
    const io = createMockIo({
      'deep-small-blind': host,
      'short-big-blind': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Deep',
      settings: { initialChips: 1, smallBlind: 1, maxRebuyAmount: 100 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;
    guest.handlers.joinRoom({ roomId, nickname: 'Short' });
    host.handlers.rebuy({ roomId, amount: 99 });
    host.handlers.startGame({ roomId });

    const startedRoom = getLastEventPayload(host, 'gameStarted').room;
    expect(startedRoom.betSize).toBe(2);
    expect(startedRoom.pot).toBe(2);
    expect(startedRoom.players.find(p => p.socketId === 'deep-small-blind')).toEqual(
      expect.objectContaining({ bet: 1, chips: 99, status: 'active' })
    );
    expect(startedRoom.players.find(p => p.socketId === 'short-big-blind')).toEqual(
      expect.objectContaining({ bet: 1, chips: 0, status: 'allin' })
    );

    host.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    expect(getLastEventPayload(host, 'actionError')).toEqual({ code: 'INVALID_ACTION' });

    host.handlers.playerAction({ roomId, action: 'call', amount: 0 });
    const autoRunRoom = getLastEventPayload(host, 'gameStateUpdate').room;
    expect(autoRunRoom.pot).toBe(3);
    expect(autoRunRoom.autoRunningBoard).toBe(true);

    jest.advanceTimersByTime(2000);
    const showdown = getLastEventPayload(host, 'showdown');
    expect(showdown.room.phase).toBe('settlement');
    expect(showdown.room.players.reduce((sum, player) => sum + player.chips, 0)).toBe(101);
  });
});
