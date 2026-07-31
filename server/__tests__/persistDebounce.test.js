const fs = require('fs');
const RoomManager = require('../game/roomManager');

describe('RoomManager 持久化：防抖 + 异步写盘（回归界面卡顿问题）', () => {
  let writeFileSpy;
  let mkdirSpy;
  let writeFileSyncSpy;

  beforeEach(() => {
    writeFileSpy = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue();
    mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
    writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('短时间内多次 saveToDisk 只触发一次真正的写盘（防抖合并）', async () => {
    const rm = new RoomManager({ saveDebounceMs: 20 });
    rm.createRoom('s1', 'A', { initialChips: 100, smallBlind: 1, maxRebuyAmount: 100 });

    rm.saveToDisk();
    rm.saveToDisk();
    rm.saveToDisk();

    await rm.flushPendingSave();

    expect(writeFileSpy).toHaveBeenCalledTimes(1);
  });

  test('从不使用同步 writeFileSync（不再阻塞事件循环）', async () => {
    const rm = new RoomManager({ saveDebounceMs: 20 });
    rm.createRoom('s1', 'A', { initialChips: 100, smallBlind: 1, maxRebuyAmount: 100 });

    rm.saveToDisk();
    await rm.flushPendingSave();

    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalled();
  });

  test('写盘内容格式与之前保持一致', async () => {
    const rm = new RoomManager({ saveDebounceMs: 20 });
    const { roomId } = rm.createRoom('s1', 'A', { initialChips: 100, smallBlind: 1, maxRebuyAmount: 100 });

    rm.saveToDisk();
    await rm.flushPendingSave();

    const [, written] = writeFileSpy.mock.calls[0];
    const data = JSON.parse(written);
    expect(data[roomId].roomId).toBe(roomId);
    expect(data[roomId].players[0].nickname).toBe('A');
    expect(data[roomId].players[0].chips).toBe(100);
    expect(data[roomId].handHistory).toEqual([]);
  });
});
