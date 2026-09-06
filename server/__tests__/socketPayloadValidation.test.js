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

function createMockIo() {
  return {
    to: () => ({ emit: jest.fn() }),
  };
}

describe('Socket 事件参数保护', () => {
  test.each([undefined, null, 'invalid', [], 42])(
    '带参数事件接收 %p 时不抛出异常',
    invalidPayload => {
      const socket = createMockSocket(`payload-${String(invalidPayload)}`);
      socketHandlers(createMockIo(), socket);

      const payloadEvents = Object.entries(socket.handlers)
        .filter(([event]) => event !== 'disconnect');

      expect(payloadEvents).not.toHaveLength(0);
      for (const [, handler] of payloadEvents) {
        expect(() => handler(invalidPayload)).not.toThrow();
      }
    },
  );

  test('创建房间缺少参数时返回 INVALID_PARAMS', () => {
    const socket = createMockSocket('missing-create-room-payload');
    socketHandlers(createMockIo(), socket);

    socket.handlers.createRoom();

    expect(socket.emit).toHaveBeenCalledWith('error', { code: 'INVALID_PARAMS' });
  });
});
