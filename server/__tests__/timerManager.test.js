jest.useFakeTimers();
const TimerManager = require('../timerManager');

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

  test('60秒后触发 onTimeout 回调', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(60000);
    expect(onTimeout).toHaveBeenCalledWith('socket1', 'room1');
  });

  test('60秒内 clearTimer 后不触发回调', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(30000);
    tm.clearTimer('socket1');
    jest.advanceTimersByTime(30000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('extendTimer 未使用过时延长 60 秒，返回 success', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(55000);
    const result = tm.extendTimer('socket1');
    expect(result.success).toBe(true);
    // 延长后再过 60 秒才触发
    jest.advanceTimersByTime(60000);
    expect(onTimeout).toHaveBeenCalledWith('socket1', 'room1');
  });

  test('extendTimer 延长后原计时器不再触发', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(55000);
    tm.extendTimer('socket1');
    // 原本 5 秒后就该触发，现在不应触发
    jest.advanceTimersByTime(6000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test('extendTimer 已使用过时返回 TIME_BANK_USED', () => {
    tm.startTimer('socket1', 'room1', true, onTimeout);
    const result = tm.extendTimer('socket1');
    expect(result.error).toBe('TIME_BANK_USED');
  });

  test('getRemaining 返回剩余秒数（约 50）', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(10000);
    const remaining = tm.getRemaining('socket1');
    expect(remaining).toBeCloseTo(50, 0);
  });

  test('getRemaining 计时器不存在时返回 0', () => {
    expect(tm.getRemaining('nonexistent')).toBe(0);
  });

  test('startTimer 重复调用同一 socketId 会清除旧计时器', () => {
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(55000);
    // 重新开始计时器
    tm.startTimer('socket1', 'room1', false, onTimeout);
    jest.advanceTimersByTime(10000);
    // 旧的 5 秒后应触发但被取消，新的 10 秒后不应触发
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
