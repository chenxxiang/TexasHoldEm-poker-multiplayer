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

  test('startGame 设置 phase 为 preflop', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    const result = rm.startGame(roomId);
    expect(result.success).toBe(true);
    expect(rm.getRoom(roomId).phase).toBe('preflop');
  });

  test('startGame 正确扣除盲注并计算底池', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    rm.startGame(roomId);
    const room = rm.getRoom(roomId);
    expect(room.players[0].chips).toBe(990);  // SB 扣 10
    expect(room.players[1].chips).toBe(980);  // BB 扣 20
    expect(room.pot).toBe(30);               // SB(10) + BB(20) = 30
  });

  test('startGame 给每个玩家发 2 张手牌', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    rm.startGame(roomId);
    const room = rm.getRoom(roomId);
    room.players.forEach(p => {
      expect(p.holeCards).toHaveLength(2);
    });
  });

  test('startGame 在游戏进行中返回 GAME_ALREADY_STARTED', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    rm.startGame(roomId);
    const result = rm.startGame(roomId);
    expect(result.error).toBe('GAME_ALREADY_STARTED');
  });

  test('startGame 玩家不足 2 人返回 NOT_ENOUGH_PLAYERS', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    const result = rm.startGame(roomId);
    expect(result.error).toBe('NOT_ENOUGH_PLAYERS');
  });

  test('leaveRoom 房主离开时转让给下一个玩家', () => {
    const { roomId } = rm.createRoom('s1', '房主', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 500 });
    rm.joinRoom(roomId, 's2', '好友');
    const result = rm.leaveRoom(roomId, 's1');
    expect(result.hostChanged).toBe(true);
    expect(result.newHostSocketId).toBe('s2');
    expect(rm.getRoom(roomId).hostSocketId).toBe('s2');
  });

  describe('mid-game join', () => {
    test('allows joining as spectator when game is in progress', () => {
      const manager = new RoomManager();
      const room = manager.createRoom('s1', 'Alice', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 });
      manager.joinRoom(room.roomId, 's2', 'Bob');
      manager.startGame(room.roomId);

      const result = manager.joinRoom(room.roomId, 's3', 'Charlie');
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);

      const r = manager.getRoom(room.roomId);
      const charlie = r.players.find(p => p.nickname === 'Charlie');
      expect(charlie).toBeDefined();
      expect(charlie.status).toBe('spectating');
      expect(charlie.folded).toBe(true);
      expect(charlie.hasActed).toBe(true);
      expect(charlie.holeCards).toEqual([]);
    });

    test('mid-game join does not disrupt shouldAdvanceStreet', () => {
      const manager = new RoomManager();
      const room = manager.createRoom('s1', 'Alice', { initialChips: 1000, smallBlind: 10, maxRebuyAmount: 1000 });
      manager.joinRoom(room.roomId, 's2', 'Bob');
      manager.startGame(room.roomId);
      manager.joinRoom(room.roomId, 's3', 'Charlie');

      const r = manager.getRoom(room.roomId);
      const active = r.players.filter(p => !p.folded);
      expect(active.some(p => p.nickname === 'Charlie')).toBe(false);
      expect(active.length).toBe(2);
    });
  });
});
