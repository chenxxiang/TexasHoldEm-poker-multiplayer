class TimerManager {
  constructor() {
    this.timers = new Map();
  }

  startTimer(socketId, roomId, duration, onTimeout) {
    this.clearTimer(socketId);
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      this.timers.delete(socketId);
      onTimeout(socketId, roomId);
    }, duration * 1000);
    this.timers.set(socketId, { timeout, startTime, duration, roomId, onTimeout, hasUsedTimeBank: false });
  }

  extendTimer(socketId) {
    const entry = this.timers.get(socketId);
    if (!entry) return { error: 'TIMER_NOT_FOUND' };
    if (entry.hasUsedTimeBank) return { error: 'TIME_BANK_USED' };
    clearTimeout(entry.timeout);
    const { roomId, onTimeout, duration } = entry;
    const newTimeout = setTimeout(() => {
      this.timers.delete(socketId);
      onTimeout(socketId, roomId);
    }, duration * 1000);
    entry.timeout = newTimeout;
    entry.startTime = Date.now();
    entry.hasUsedTimeBank = true;
    return { success: true };
  }

  clearTimer(socketId) {
    const entry = this.timers.get(socketId);
    if (entry) { clearTimeout(entry.timeout); this.timers.delete(socketId); }
  }

  getRemaining(socketId) {
    const entry = this.timers.get(socketId);
    if (!entry) return 0;
    return Math.max(0, entry.duration - (Date.now() - entry.startTime) / 1000);
  }

  clearAll() {
    for (const entry of this.timers.values()) clearTimeout(entry.timeout);
    this.timers.clear();
  }
}

module.exports = TimerManager;
