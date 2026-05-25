const RoomManager = require('../game/roomManager');

describe('RoomManager', () => {
  let rm;
  beforeEach(() => { rm = new RoomManager(); });

  test('createRoom 返回 6 位大写房间码', () => {
    const room = rm.createRoom('socket1', '小明', {
      initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500,
    });
    expect(room.roomId).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.settings.initialChips).toBe(1000);
    expect(room.settings.smallBlind).toBe(10);
  });

  test('joinRoom 成功加入', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 500, smallBlind: 5, maxRebuyAmount: 200 });
    const result = rm.joinRoom(roomId, 's2', '好友');
    expect(result.error).toBeUndefined();
    expect(rm.getRoom(roomId).players).toHaveLength(2);
  });

  test('joinRoom 超过 10 人返回 ROOM_FULL', () => {
    const { roomId } = rm.createRoom('s0', '房主', { initialChips: 300, smallBlind: 2, maxRebuyAmount: 100 });
    for (let i = 1; i < 10; i++) rm.joinRoom(roomId, `s${i}`, `玩家${i}`);
    const result = rm.joinRoom(roomId, 's10', '溢出');
    expect(result.error).toBe('ROOM_FULL');
  });

  test('leaveRoom 玩家离开后从列表移除', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    rm.leaveRoom(roomId, 's2');
    expect(rm.getRoom(roomId).players).toHaveLength(1);
  });

  test('rebuy 成功添加筹码', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 300, smallBlind: 5, maxRebuyAmount: 200 });
    rm.getRoom(roomId).players[0].chips = 0;
    const result = rm.rebuy(roomId, 's1', 150);
    expect(result.success).toBe(true);
    expect(rm.getRoom(roomId).players[0].chips).toBe(150);
  });

  test('rebuy 超过 maxRebuyAmount 返回 EXCEEDS_REBUY_LIMIT', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 300, smallBlind: 5, maxRebuyAmount: 200 });
    const result = rm.rebuy(roomId, 's1', 300);
    expect(result.error).toBe('EXCEEDS_REBUY_LIMIT');
  });

  test('getRoomBySocket 通过 socketId 找到房间', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    const room = rm.getRoomBySocket('s2');
    expect(room.roomId).toBe(roomId);
  });
});
