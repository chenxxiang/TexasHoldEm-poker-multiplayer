let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}

function tone(freq, dur, vol = 0.15, type = 'sine') {
  try {
    const c = ctx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination);
    osc.frequency.value = freq; osc.type = type;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.start(c.currentTime); osc.stop(c.currentTime + dur);
  } catch {}
}

export function playActionSound(action) {
  if (action === 'fold')  { tone(180, 0.15, 0.13); return; }
  if (action === 'check') { tone(440, 0.10, 0.12); return; }
  if (action === 'call')  { tone(440, 0.12, 0.15); return; }
  if (action === 'raise') {
    tone(440, 0.10, 0.15);
    setTimeout(() => tone(660, 0.15, 0.18), 80);
    return;
  }
  if (action === 'allin') {
    tone(440, 0.08, 0.15);
    setTimeout(() => tone(660, 0.08, 0.18), 60);
    setTimeout(() => tone(880, 0.20, 0.20), 120);
  }
}
