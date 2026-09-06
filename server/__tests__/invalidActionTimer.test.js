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

function createMockIo(socketsById, roomEvents) {
  return {
    to: id => ({
      emit: (event, payload) => {
        roomEvents.push({ id, event, payload });
        socketsById[id]?.emit(event, payload);
      },
    }),
  };
}

function getLastEventPayload(socket, eventName) {
  const call = socket.emit.mock.calls.slice().reverse().find(([event]) => event === eventName);
  return call?.[1];
}

describe('非法行动的计时器处理', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('非法过牌不会清除当前计时器', () => {
    const host = createMockSocket('host-invalid-action');
    const guest = createMockSocket('guest-invalid-action');
    const roomEvents = [];
    const io = createMockIo({
      'host-invalid-action': host,
      'guest-invalid-action': guest,
    }, roomEvents);

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Host',
      settings: { initialChips: 150, smallBlind: 1, maxRebuyAmount: 150, actionTime: 5 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;
    guest.handlers.joinRoom({ roomId, nickname: 'Guest' });
    host.handlers.startGame({ roomId });

    // Heads-up preflop: the host is the small blind and still owes one chip,
    // so checking is invalid. The original turn timer must keep running.
    host.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    expect(getLastEventPayload(host, 'actionError')).toEqual({ code: 'INVALID_ACTION' });

    jest.advanceTimersByTime(5000);

    const timeoutEvent = roomEvents.find(({ id, event }) => id === roomId && event === 'timedOut');
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent.payload).toEqual({ socketId: host.id, autoAction: 'fold' });
  });
});
