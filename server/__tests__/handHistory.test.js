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

describe('手牌历史局号', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('历史记录裁剪为五条后局号仍持续增长', () => {
    const host = createMockSocket('history-host');
    const guest = createMockSocket('history-guest');
    const sockets = {
      'history-host': host,
      'history-guest': guest,
    };
    const io = createMockIo(sockets);

    socketHandlers(io, host);
    socketHandlers(io, guest);

    host.handlers.createRoom({
      nickname: 'Host',
      settings: { initialChips: 150, smallBlind: 1, maxRebuyAmount: 150 },
    });
    const roomId = getLastEventPayload(host, 'roomCreated').roomId;
    guest.handlers.joinRoom({ roomId, nickname: 'Guest' });
    host.handlers.startGame({ roomId });

    for (let expectedHandNum = 1; expectedHandNum <= 7; expectedHandNum += 1) {
      const currentRoom = getLastEventPayload(host, 'gameStarted').room;
      const actor = currentRoom.players[currentRoom.currentTurnIndex];
      sockets[actor.socketId].handlers.playerAction({ roomId, action: 'fold', amount: 0 });

      const settledRoom = getLastEventPayload(host, 'showdown').room;
      expect(settledRoom.handHistory.at(-1).handNum).toBe(expectedHandNum);

      if (expectedHandNum < 7) {
        host.handlers.playerReadyStatus({ roomId, status: 'ready' });
        guest.handlers.playerReadyStatus({ roomId, status: 'ready' });
      }
    }

    const finalHistory = getLastEventPayload(host, 'showdown').room.handHistory;
    expect(finalHistory.map(hand => hand.handNum)).toEqual([3, 4, 5, 6, 7]);
  });
});
