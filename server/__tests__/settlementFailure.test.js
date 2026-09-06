const { Hand } = require('pokersolver');
const RoomManager = require('../game/roomManager');
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

function totalChips(room) {
  return room.players.reduce((sum, player) => sum + player.chips, 0) + room.pot;
}

describe('结算求解失败', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('保留底池和玩家筹码，不指定第一位活跃玩家为赢家', () => {
    const host = createMockSocket('solver-host');
    const guest = createMockSocket('solver-guest');
    const io = createMockIo({
      'solver-host': host,
      'solver-guest': guest,
    });

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Host',
      settings: { initialChips: 1000, smallBlind: 1, maxRebuyAmount: 1000 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;
    guest.handlers.joinRoom({ roomId, nickname: 'Guest' });
    host.handlers.startGame({ roomId });

    host.handlers.playerAction({ roomId, action: 'call', amount: 0 });
    guest.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    guest.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    host.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    guest.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    host.handlers.playerAction({ roomId, action: 'check', amount: 0 });
    guest.handlers.playerAction({ roomId, action: 'check', amount: 0 });

    const beforeFailure = getLastEventPayload(host, 'gameStateUpdate').room;
    const claimSpy = jest.spyOn(RoomManager.prototype, 'claimSettlement');
    jest.spyOn(Hand, 'solve').mockImplementationOnce(() => {
      throw new Error('invalid cards');
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    host.handlers.playerAction({ roomId, action: 'check', amount: 0 });

    expect(getLastEventPayload(host, 'showdown')).toBeUndefined();
    expect(getLastEventPayload(guest, 'showdown')).toBeUndefined();
    expect(getLastEventPayload(host, 'error')).toEqual({ code: 'SETTLEMENT_FAILED' });
    expect(getLastEventPayload(guest, 'error')).toEqual({ code: 'SETTLEMENT_FAILED' });
    expect(claimSpy).not.toHaveBeenCalled();

    host.handlers.getRoomState({ roomId });
    const afterFailure = getLastEventPayload(host, 'gameStateUpdate').room;
    expect(afterFailure.phase).toBe('showdown');
    expect(afterFailure.pot).toBe(beforeFailure.pot);
    expect(afterFailure.players.map(p => p.chips)).toEqual(beforeFailure.players.map(p => p.chips));
    expect(afterFailure.players.every(p => p.won === 0)).toBe(true);
    expect(afterFailure.handHistory).toHaveLength(0);
    expect(totalChips(afterFailure)).toBe(totalChips(beforeFailure));
  });
});
