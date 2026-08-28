jest.useFakeTimers();
const TimerManager = require('../timerManager');

// TimerManager 以 roomId 为键（断线重连不会打断回合计时），签名为
// startTimer(roomId, actorNickname, duration, onTimeout)，回调参数顺序为
// (actorNickname, roomId)。
describe('TimerManager', () => {
  let tm;
  let onTimeout;

  beforeEach(() => {
    onTimeout = jest.fn();
    tm = new TimerManager();
  });

  afterEach(() => {
    tm.clearAll();
    jest.clearAllTimers();
  });

  test('计时结束后以 (actorNickname, roomId) 触发 onTimeout', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(60000);
    expect(onTimeout).toHaveBeenCalledWith('Alice', 'room1');
  });

  test('计时结束前 clearTimer 后不触发回调', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(30000);
    tm.clearTimer('room1');
    jest.advanceTimersByTime(30000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('extendTimer 未使用过时返回 success，并重新计满一个周期', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(55000);
    const result = tm.extendTimer('room1');
    expect(result.success).toBe(true);
    // 延长后需再过完整的 60 秒才触发
    jest.advanceTimersByTime(60000);
    expect(onTimeout).toHaveBeenCalledWith('Alice', 'room1');
  });

  test('extendTimer 延长后原计时器不再触发', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(55000);
    tm.extendTimer('room1');
    // 原本再过 5 秒就该触发，延长后不应触发
    jest.advanceTimersByTime(6000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('时间银行只能用一次：第二次 extendTimer 返回 TIME_BANK_USED', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    expect(tm.extendTimer('room1').success).toBe(true);
    expect(tm.extendTimer('room1').error).toBe('TIME_BANK_USED');
  });

  test('extendTimer 在计时器不存在时返回 TIMER_NOT_FOUND', () => {
    expect(tm.extendTimer('nonexistent').error).toBe('TIMER_NOT_FOUND');
  });

  test('getRemaining 返回剩余秒数（约 50）', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(10000);
    expect(tm.getRemaining('room1')).toBeCloseTo(50, 0);
  });

  test('getRemaining 计时器不存在时返回 0', () => {
    expect(tm.getRemaining('nonexistent')).toBe(0);
  });

  test('startTimer 重复调用同一 roomId 会清除旧计时器', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(55000);
    // 重新开始计时器
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    jest.advanceTimersByTime(10000);
    // 旧的再过 5 秒本应触发但已被取消，新的还差 50 秒
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('getActorNickname 返回当前行动者，不存在时返回 null', () => {
    tm.startTimer('room1', 'Alice', 60, onTimeout);
    expect(tm.getActorNickname('room1')).toBe('Alice');
    expect(tm.getActorNickname('nonexistent')).toBeNull();
  });
});
