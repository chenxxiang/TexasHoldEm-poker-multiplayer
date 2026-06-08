// Timer keyed by roomId (not socketId) so reconnects don't break the turn clock
class TimerManager {
  constructor() {
    this.timers = new Map();
  }

  startTimer(roomId, actorNickname, duration, onTimeout) {
    this.clearTimer(roomId);
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      this.timers.delete(roomId);
      onTimeout(actorNickname, roomId);
    }, duration * 1000);
    this.timers.set(roomId, { timeout, startTime, duration, roomId, actorNickname, onTimeout, hasUsedTimeBank: false });
  }

  extendTimer(roomId) {
    const entry = this.timers.get(roomId);
    if (!entry) return { error: 'TIMER_NOT_FOUND' };
    if (entry.hasUsedTimeBank) return { error: 'TIME_BANK_USED' };
    clearTimeout(entry.timeout);
    const { roomId: rid, actorNickname, onTimeout, duration } = entry;
    const newTimeout = setTimeout(() => {
      this.timers.delete(rid);
      onTimeout(actorNickname, rid);
    }, duration * 1000);
    entry.timeout = newTimeout;
    entry.startTime = Date.now();
    entry.hasUsedTimeBank = true;
    return { success: true };
  }

  clearTimer(roomId) {
    const entry = this.timers.get(roomId);
    if (entry) { clearTimeout(entry.timeout); this.timers.delete(roomId); }
  }

  getRemaining(roomId) {
    const entry = this.timers.get(roomId);
    if (!entry) return 0;
    return Math.max(0, entry.duration - (Date.now() - entry.startTime) / 1000);
  }

  getActorNickname(roomId) {
    return this.timers.get(roomId)?.actorNickname ?? null;
  }

  hasUsedTimeBank(roomId) {
    return this.timers.get(roomId)?.hasUsedTimeBank ?? false;
  }

  clearAll() {
    for (const entry of this.timers.values()) clearTimeout(entry.timeout);
    this.timers.clear();
  }
}

module.exports = TimerManager;
