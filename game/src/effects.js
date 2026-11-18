// Particles, skid marks and screen shake: the juice that makes the city feel alive.
// All drawing is plain canvas shapes, so nothing here needs an asset.

export function createEffects() {
  return { particles: [], skids: [], shake: 0, flashes: [] };
}

export function spawnParticles(fx, x, y, opts = {}) {
  const count = opts.count ?? 10;
  const color = opts.color ?? '#ffffff';
  const speed = opts.speed ?? 160;
  const life = opts.life ?? 0.6;
  const size = opts.size ?? 4;
  const gravity = opts.gravity ?? 0;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.8),
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color,
      gravity,
    });
  }
}

export function spawnSmoke(fx, x, y) {
  fx.particles.push({
    x: x + (Math.random() - 0.5) * 8,
    y: y + (Math.random() - 0.5) * 8,
    vx: (Math.random() - 0.5) * 20,
    vy: -30 - Math.random() * 20,
    life: 0.9,
    maxLife: 0.9,
    size: 8 + Math.random() * 6,
    color: 'rgba(60,60,60,0.5)',
    gravity: -20,
  });
}

export function spawnExplosion(fx, x, y) {
  spawnParticles(fx, x, y, { count: 26, color: '#ff9a3c', speed: 320, life: 0.7, size: 7 });
  spawnParticles(fx, x, y, { count: 18, color: '#ffd23c', speed: 200, life: 0.45, size: 5 });
  spawnParticles(fx, x, y, { count: 12, color: '#555555', speed: 90, life: 1.2, size: 9, gravity: -30 });
  fx.shake = Math.min(14, fx.shake + 9);
}

export function spawnSkid(fx, x, y, angle) {
  const last = fx.skids[fx.skids.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < 14) return;
  fx.skids.push({ x, y, angle, life: 2.2 });
  if (fx.skids.length > 400) fx.skids.splice(0, fx.skids.length - 400);
}

export function spawnMuzzle(fx, x, y, angle) {
  fx.flashes.push({ x, y, angle, life: 0.06 });
}

export function addShake(fx, amount) {
  fx.shake = Math.min(16, fx.shake + amount);
}

export function updateEffects(fx, dt) {
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      fx.particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
  }
  for (let i = fx.skids.length - 1; i >= 0; i--) {
    fx.skids[i].life -= dt;
    if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
  }
  for (let i = fx.flashes.length - 1; i >= 0; i--) {
    fx.flashes[i].life -= dt;
    if (fx.flashes[i].life <= 0) fx.flashes.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - 30 * dt);
}

export function shakeOffset(fx) {
  if (fx.shake <= 0.2) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * fx.shake,
    y: (Math.random() - 0.5) * fx.shake,
  };
}

export function drawSkids(ctx, fx) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,20,24,0.55)';
  for (const s of fx.skids) {
    ctx.globalAlpha = Math.min(0.6, s.life / 2.2);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-7, -2.5, 14, 5);
    ctx.restore();
  }
  ctx.restore();
}

export function drawParticles(ctx, fx) {
  ctx.save();
  for (const p of fx.particles) {
    const t = p.life / p.maxLife;
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const f of fx.flashes) {
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#ffe66d';
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 5);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
