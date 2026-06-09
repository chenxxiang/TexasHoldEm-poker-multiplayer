import { useState, useEffect, useRef } from 'react';

// ── Per-hero particle config ──────────────────────────────────────────────────
const CFG = {
  '撸哥':             { C:['#60a5fa','#93c5fd','#fff','#38bdf8','#bfdbfe'],           bg:'radial-gradient(ellipse at 50% 60%,#0c1e4a,#020817)',  flash:'#1d4ed8', glow:'#3b82f6', effect:'lightning', tc:'#93c5fd' },
  '保龙大帝':          { C:['#fbbf24','#f59e0b','#ef4444','#fcd34d','#fff'],           bg:'radial-gradient(ellipse at 50% 60%,#451a03,#1a0800)',  flash:'#d97706', glow:'#f59e0b', effect:'fire',      tc:'#fcd34d' },
  '陈少钧':            { C:['#e0f2fe','#bae6fd','#7dd3fc','#38bdf8','#fff'],           bg:'radial-gradient(ellipse at 50% 50%,#0c2040,#050e1a)',  flash:'#0284c7', glow:'#38bdf8', effect:'stars',     tc:'#7dd3fc' },
  '翔总':              { C:['#c4b5fd','#a78bfa','#ddd6fe','#ede9fe','#fff'],           bg:'radial-gradient(ellipse at 50% 40%,#2e1065,#0a0118)',  flash:'#7c3aed', glow:'#a78bfa', effect:'sword',     tc:'#c4b5fd' },
  '思婷':              { C:['#e0f2fe','#bae6fd','#cffafe','#a5f3fc','#fff'],           bg:'radial-gradient(ellipse at 50% 40%,#0e3156,#020d1a)',  flash:'#0369a1', glow:'#38bdf8', effect:'ice',       tc:'#bae6fd' },
  '标桑':              { C:['#6ee7b7','#34d399','#a7f3d0','#10b981','#d1fae5'],        bg:'radial-gradient(ellipse at 50% 50%,#064e3b,#011a14)',  flash:'#059669', glow:'#10b981', effect:'vortex',    tc:'#6ee7b7' },
  '大胖':              { C:['#fcd34d','#fbbf24','#f59e0b','#fde68a','#fff'],           bg:'radial-gradient(ellipse at 50% 60%,#451a03,#1a0a00)',  flash:'#b45309', glow:'#f59e0b', effect:'fireworks', tc:'#fcd34d' },
  '韬少':              { C:['#cbd5e1','#94a3b8','#e2e8f0','#f1f5f9','#64748b'],        bg:'radial-gradient(ellipse at 50% 50%,#0f172a,#020617)',  flash:'#334155', glow:'#64748b', effect:'ink',       tc:'#94a3b8' },
  '大傻(美少女形态)':  { C:['#f87171','#fb923c','#facc15','#4ade80','#60a5fa','#a78bfa','#f472b6'], bg:'radial-gradient(ellipse at 50% 50%,#1a0a2e,#050010)', flash:'#7c3aed', glow:'#a78bfa', effect:'chaos', tc:'#f472b6' },
};
const DCFG = { C:['#f0d060','#fbbf24','#fff','#fde68a'], bg:'radial-gradient(ellipse at 50% 50%,#1a1a2e,#050514)', flash:'#b45309', glow:'#f0d060', effect:'fireworks', tc:'#f0d060' };

// ── Particle factory ──────────────────────────────────────────────────────────
function mkp(x, y, vx, vy, col, sz, life, type, g, d, rot, rotS) {
  return { x, y, vx, vy, color: col, size: sz, life, maxLife: life, type,
    glow: type !== 'circle' || sz < 4, glowR: Math.min(sz * 2.5, 12),
    g: g ?? 0.08, d: d ?? 0.97, rot: rot ?? 0, rotS: rotS ?? 0 };
}
function rc(C) { return C[Math.floor(Math.random() * C.length)]; }

// ── Spawn initial burst ───────────────────────────────────────────────────────
function spawnBurst(cfg, cx, cy, w, h) {
  const { C, effect: e } = cfg;
  const ps = [];

  if (e === 'lightning') {
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 15;
      ps.push(mkp(cx + (Math.random() - .5) * 80, cy + (Math.random() - .5) * 80,
        Math.cos(a) * sp, Math.sin(a) * sp, rc(C), 1 + Math.random() * 3.5,
        55 + Math.random() * 80, i % 3 ? 'spark' : 'circle', 0.04, 0.97));
    }
  } else if (e === 'fire') {
    for (let i = 0; i < 360; i++) {
      ps.push(mkp(cx + (Math.random() - .5) * w * .85, h + Math.random() * 50,
        (Math.random() - .5) * 4, -(3 + Math.random() * 13),
        rc(C), 2 + Math.random() * 7, 50 + Math.random() * 80, 'circle', -0.06, 0.96));
    }
  } else if (e === 'ice') {
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 11;
      ps.push(mkp(cx + (Math.random() - .5) * 20, cy + (Math.random() - .5) * 20,
        Math.cos(a) * sp, Math.sin(a) * sp, rc(C), 2 + Math.random() * 6,
        65 + Math.random() * 65, i % 2 ? 'flake' : 'circle',
        0.07, 0.97, Math.random() * Math.PI * 2, (Math.random() - .5) * .16));
    }
  } else if (e === 'sword') {
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 16;
      ps.push(mkp(cx + (Math.random() - .5) * 30, cy + (Math.random() - .5) * 30,
        Math.cos(a) * sp, Math.sin(a) * sp, rc(C), 1 + Math.random() * 2.5,
        48 + Math.random() * 65, 'spark', 0.07, 0.95));
    }
  } else if (e === 'fireworks') {
    const bp = [[0, -.3], [-.35, -.1], [.35, -.1], [-.2, .2], [.2, .2]].map(([dx, dy]) => [cx + dx * w, cy + dy * h]);
    bp.forEach(([bx, by]) => {
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * Math.PI * 2 + Math.random() * .4, sp = 3 + Math.random() * 9;
        ps.push(mkp(bx, by, Math.cos(a) * sp, Math.sin(a) * sp,
          rc(C), 1.5 + Math.random() * 3.5, 55 + Math.random() * 75, 'circle', 0.13, 0.96));
      }
    });
  } else if (e === 'vortex') {
    for (let i = 0; i < 280; i++) {
      const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * Math.min(w, h) * .45;
      const tx = -Math.sin(a), ty = Math.cos(a);
      const nx = -Math.cos(a), ny = -Math.sin(a);
      ps.push(mkp(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist,
        tx * 4.5 + nx * 2, ty * 4.5 + ny * 2, rc(C), 1.5 + Math.random() * 3.5,
        65 + Math.random() * 65, 'circle', 0, 0.98));
    }
  } else if (e === 'ink') {
    for (let i = 0; i < 230; i++) {
      const a = Math.random() * Math.PI * 2, streak = i % 3 === 0;
      const sp = streak ? 7 + Math.random() * 13 : 2 + Math.random() * 8;
      ps.push(mkp(cx + (Math.random() - .5) * 20, cy + (Math.random() - .5) * 20,
        Math.cos(a) * sp, Math.sin(a) * sp,
        streak ? '#e2e8f0' : '#1e293b', streak ? 1 + Math.random() * 2 : 3 + Math.random() * 9,
        55 + Math.random() * 85, streak ? 'spark' : 'circle', 0.1, streak ? 0.94 : 0.92));
    }
  } else if (e === 'chaos') {
    for (let i = 0; i < 360; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 15;
      ps.push(mkp(cx + (Math.random() - .5) * 40, cy + (Math.random() - .5) * 40,
        Math.cos(a) * sp * (.5 + Math.random()), Math.sin(a) * sp * (.5 + Math.random()),
        rc(C), 1 + Math.random() * 5.5, 40 + Math.random() * 90,
        i % 2 ? 'circle' : 'spark', (Math.random() - .5) * .15, 0.94 + Math.random() * .04));
    }
  } else if (e === 'stars') {
    for (let ring = 0; ring < 5; ring++) {
      const n = 28 + ring * 18, sp = 2 + ring * 2.8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ps.push(mkp(cx, cy,
          Math.cos(a) * sp * (.8 + Math.random() * .4), Math.sin(a) * sp * (.8 + Math.random() * .4),
          rc(C), 1.5 + Math.random() * 3, 65 + ring * 10 + Math.random() * 40, 'circle', 0.02, 0.98));
      }
    }
  }
  return ps;
}

// ── Continuous spawn (keep canvas alive) ─────────────────────────────────────
function spawnCont(cfg, cx, cy, w, h) {
  const { C, effect: e } = cfg;
  const ps = [];
  if (e === 'lightning') {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      ps.push(mkp(cx + (Math.random() - .5) * 130, cy + (Math.random() - .5) * 110,
        Math.cos(a) * (1 + Math.random() * 5), Math.sin(a) * (1 + Math.random() * 5),
        rc(C), .5 + Math.random() * 2, 12 + Math.random() * 22, 'spark', 0, .99));
    }
  } else if (e === 'fire') {
    for (let i = 0; i < 16; i++) {
      ps.push(mkp(cx + (Math.random() - .5) * w * .7, h + 10,
        (Math.random() - .5) * 3, -(2 + Math.random() * 9),
        rc(C), 1 + Math.random() * 4.5, 30 + Math.random() * 50, 'circle', -0.05, .97));
    }
  } else if (e === 'fireworks') {
    if (Math.random() < .35) {
      const bx = cx + (Math.random() - .5) * w * .5, by = cy + (Math.random() - .5) * h * .4;
      for (let i = 0; i < 38; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7;
        ps.push(mkp(bx, by, Math.cos(a) * sp, Math.sin(a) * sp,
          rc(C), 1 + Math.random() * 3, 40 + Math.random() * 55, 'circle', 0.13, .96));
      }
    }
  } else if (e === 'chaos') {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 9;
      ps.push(mkp(cx + (Math.random() - .5) * 70, cy + (Math.random() - .5) * 70,
        Math.cos(a) * sp, Math.sin(a) * sp, rc(C), 1 + Math.random() * 4.5,
        20 + Math.random() * 45, i % 2 ? 'circle' : 'spark', (Math.random() - .5) * .1, .95));
    }
  } else if (e === 'vortex') {
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, dist = 30 + Math.random() * Math.min(w, h) * .35;
      const tx = -Math.sin(a), ty = Math.cos(a);
      ps.push(mkp(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist,
        tx * 3.5 - Math.cos(a) * 1.5, ty * 3.5 - Math.sin(a) * 1.5,
        rc(C), 1 + Math.random() * 2.5, 30 + Math.random() * 40, 'circle', 0, .98));
    }
  } else if (e === 'ice') {
    for (let i = 0; i < 8; i++) {
      ps.push(mkp(cx + (Math.random() - .5) * w * .4, cy - h * .1,
        (Math.random() - .5) * 2, 1 + Math.random() * 3,
        rc(C), 1 + Math.random() * 3, 30 + Math.random() * 40,
        'flake', 0.08, .97, Math.random() * Math.PI * 2, (Math.random() - .5) * .12));
    }
  }
  return ps;
}

// ── Physics + draw ────────────────────────────────────────────────────────────
function updateP(p) {
  p.x += p.vx; p.y += p.vy;
  p.vy += p.g; p.vx *= p.d; p.vy *= p.d;
  p.rot += p.rotS; p.life--;
}

function drawP(ctx, p) {
  const al = p.life / p.maxLife;
  if (al <= 0) return;
  ctx.save();
  ctx.globalAlpha = al;
  if (p.glow) { ctx.shadowBlur = p.glowR; ctx.shadowColor = p.color; }
  if (p.type === 'circle') {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  } else if (p.type === 'spark') {
    ctx.beginPath();
    ctx.moveTo(p.x - p.vx * 3.5, p.y - p.vy * 3.5);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.stroke();
  } else if (p.type === 'flake') {
    ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.strokeStyle = p.color; ctx.lineWidth = p.size * .35; ctx.lineCap = 'round';
    const r = p.size * 2;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
    }
  }
  ctx.restore();
}

// ── Special effects (lightning bolts, sword slashes, etc.) ───────────────────
function genBolt(x1, y1, x2, y2, d) {
  if (d === 0 || Math.hypot(x2 - x1, y2 - y1) < 8) return [[x2, y2]];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const mx = (x1 + x2) / 2 + (Math.random() - .5) * len * .5;
  const my = (y1 + y2) / 2 + (Math.random() - .5) * len * .5;
  return [...genBolt(x1, y1, mx, my, d - 1), ...genBolt(mx, my, x2, y2, d - 1)];
}

function drawSpecial(ctx, cfg, w, h, cx, cy, frame, boltsRef) {
  const { effect: e, glow, flash } = cfg;

  // Flash overlay (first 14 frames)
  if (frame < 14) {
    ctx.save();
    ctx.globalAlpha = (1 - frame / 14) * 0.88;
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Lightning bolts (regenerate every 7 frames, visible for 4 of those 7)
  if (e === 'lightning' && frame < 70 && frame % 7 < 4) {
    if (frame % 7 === 0) {
      boltsRef.current = Array.from({ length: 3 }, () => {
        const sx = cx + (Math.random() - .5) * w * .6;
        const ex = cx + (Math.random() - .5) * w * .3;
        return { sx, pts: genBolt(sx, 0, ex, h, 5) };
      });
    }
    ctx.save();
    boltsRef.current.forEach(b => {
      ctx.strokeStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = 24; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(b.sx, 0); b.pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.shadowBlur = 8; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(b.sx, 0); b.pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.stroke();
    });
    ctx.restore();
  }

  // Sword slashes (fade out over 30 frames)
  if (e === 'sword' && frame < 30) {
    const al = 1 - frame / 30;
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const y = h * (.22 + i * .19);
      const sk = (i % 2 ? 1 : -1) * h * .055 * (1 - frame / 30);
      ctx.strokeStyle = `rgba(196,181,253,${al * (.5 + i * .08)})`;
      ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 20 - i * 2; ctx.lineWidth = 2.3 - i * .4;
      ctx.beginPath(); ctx.moveTo(-20, y + sk); ctx.lineTo(w + 20, y - sk); ctx.stroke();
    }
    ctx.restore();
  }

  // Ink expanding rings
  if (e === 'ink' && frame < 25) {
    const al = 1 - frame / 25;
    ctx.save();
    for (let r = 0; r < 3; r++) {
      const radius = frame * (8 + r * 5) + r * 15;
      ctx.strokeStyle = `rgba(30,41,59,${al * .8})`; ctx.shadowColor = '#1e293b'; ctx.shadowBlur = 10;
      ctx.lineWidth = 3.5 + r * 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

// ── WinAnimation component ────────────────────────────────────────────────────
const TYPE_COLORS = { '尊号': '#a78bfa', '仙号': '#f472b6', '道号': '#34d399' };

export default function WinAnimation({ hero, onDone }) {
  const canvasRef = useRef(null);
  const boltsRef = useRef([]);
  const [showHero, setShowHero] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showVictory, setShowVictory] = useState(false);

  const cfg = CFG[hero?.id] || DCFG;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h * 0.44;

    let particles = spawnBurst(cfg, cx, cy, w, h);
    let frame = 0;
    let raf;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      // Continuous spawning — cap at 900 to stay performant
      if (frame % 2 === 0 && particles.length < 900) {
        particles.push(...spawnCont(cfg, cx, cy, w, h));
      }

      // Update + draw particles
      particles = particles.filter(p => p.life > 0);
      for (const p of particles) { updateP(p); drawP(ctx, p); }

      // Special overlays (flash, bolts, slashes, rings)
      drawSpecial(ctx, cfg, w, h, cx, cy, frame, boltsRef);

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);

    const t1 = setTimeout(() => setShowHero(true), 650);
    const t2 = setTimeout(() => setShowTitle(true), 1050);
    const t3 = setTimeout(() => setShowVictory(true), 1550);
    const t4 = setTimeout(onDone, 3300);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 99,
      background: cfg.bg,
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Hero card (scales in) */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        transition: 'all 0.55s cubic-bezier(0.34,1.56,0.64,1)',
        transform: showHero ? 'scale(1) translateY(0)' : 'scale(0.25) translateY(40px)',
        opacity: showHero ? 1 : 0,
      }}>
        {/* Avatar with glow ring */}
        <div style={{
          width: 134, height: 134, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          border: `4px solid ${cfg.glow}`,
          boxShadow: `0 0 28px ${cfg.glow}, 0 0 65px ${cfg.glow}80, 0 0 120px ${cfg.glow}40`,
        }}>
          <img src={hero.img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={hero.name} />
        </div>

        {/* Title section */}
        <div style={{
          textAlign: 'center',
          opacity: showTitle ? 1 : 0,
          transition: 'opacity 0.45s ease',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        }}>
          {hero.titleType && (
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.18em',
              color: TYPE_COLORS[hero.titleType] || cfg.tc,
              textShadow: `0 0 10px ${cfg.glow}`,
            }}>
              {hero.titleType}
            </div>
          )}
          <div style={{
            fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1,
            letterSpacing: '0.08em',
            textShadow: `0 0 18px ${cfg.glow}, 0 0 42px ${cfg.glow}90, 0 2px 8px rgba(0,0,0,0.85)`,
          }}>
            {hero.title || hero.name}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.1em',
          }}>
            {hero.name}
          </div>
        </div>

        {/* Victory text */}
        <div style={{
          opacity: showVictory ? 1 : 0,
          transform: showVictory ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.85)',
          transition: 'all 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          fontSize: 22, fontWeight: 900,
          color: 'rgba(255,255,255,0.95)',
          letterSpacing: '0.32em',
          textShadow: `0 0 14px ${cfg.glow}, 0 2px 10px rgba(0,0,0,0.8)`,
          marginTop: 4,
        }}>
          获 得 胜 利
        </div>
      </div>

      {/* Skip button */}
      <button
        onClick={onDone}
        style={{
          position: 'absolute', top: 14, right: 14, zIndex: 20,
          color: 'rgba(255,255,255,0.35)',
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 8, padding: '5px 14px',
          fontSize: 12, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        跳过
      </button>
    </div>
  );
}
