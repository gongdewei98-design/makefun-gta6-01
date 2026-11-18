// Combat: bullets, muzzle flashes and the Dockside Kings gang who shoot back.
// A bullet is a fast point with a short life; it stops at the first thing it hits.

import { PLAYER, WANTED } from './config.js';
import { pointInBuilding, resolveBuildingCollisions } from './city.js';
import { spawnMuzzle, spawnParticles } from './effects.js';
import { addHeat, hurtCop } from './police.js';
import { damageCar, hurtPlayer } from './vehicles.js';

export function fireBullet(world, x, y, angle, from) {
  const spread = from === 'player' ? 0.03 : 0.12;
  const a = angle + (Math.random() - 0.5) * spread * 2;
  const speed = PLAYER.bulletSpeed;
  world.bullets.push({
    x: x + Math.cos(a) * 20,
    y: y + Math.sin(a) * 20,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed,
    from,
    damage: from === 'player' ? PLAYER.bulletDamage : 12,
    life: 1.1,
  });
  spawnMuzzle(world.fx, x + Math.cos(a) * 22, y + Math.sin(a) * 22, a);
  world.audio.gunshot();
  world.lastShotAt = world.time;
  world.lastShotX = x;
  world.lastShotY = y;
  if (from === 'player') {
    world.stats.shotsFired += 1;
    addHeat(world, WANTED.shoot, 'Shots fired');
  }
}

function hitBuilding(world, x, y) {
  for (const b of world.city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function updateBullets(world, dt) {
  const player = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && hitBuilding(world, b.x, b.y)) {
      spawnParticles(world.fx, b.x, b.y, { count: 4, color: '#e8e0c8', speed: 120, life: 0.25, size: 2 });
      dead = true;
    }
    if (!dead) {
      // Cars stop bullets too.
      for (const car of world.cars) {
        if (car.wrecked) continue;
        if (Math.abs(b.x - car.x) < 34 && Math.abs(b.y - car.y) < 34) {
          const dx = b.x - car.x;
          const dy = b.y - car.y;
          const localX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
          const localY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
          if (Math.abs(localX) < 32 && Math.abs(localY) < 17) {
            damageCar(world, car, b.damage * 0.6);
            if (car.type === 'police' && b.from === 'player') addHeat(world, WANTED.hitPoliceCar, 'You shot a police car');
            spawnParticles(world.fx, b.x, b.y, { count: 4, color: '#ffd23c', speed: 140, life: 0.25, size: 2 });
            dead = true;
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'player') {
      // Enemies and cops.
      for (const e of world.enemies) {
        if (e.state === 'down') continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < 16) {
          hurtEnemy(world, e, b.damage);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const cop of world.cops) {
          if (cop.state === 'down') continue;
          if (Math.hypot(b.x - cop.x, b.y - cop.y) < 16) {
            hurtCop(world, cop, b.damage);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const ped of world.peds) {
          if (ped.state === 'down') continue;
          if (Math.hypot(b.x - ped.x, ped.y - ped.y) < 15) {
            ped.state = 'down';
            ped.downTimer = 6;
            addHeat(world, WANTED.killPedestrian, 'You shot a bystander');
            spawnParticles(world.fx, ped.x, ped.y, { count: 6, color: '#ff5a5a', speed: 120, life: 0.3, size: 3 });
            dead = true;
            break;
          }
        }
      }
    } else if (!dead && b.from === 'enemy') {
      if (player.onFoot && Math.hypot(b.x - player.x, b.y - player.y) < 15) {
        hurtPlayer(world, b.damage);
        spawnParticles(world.fx, b.x, b.y, { count: 5, color: '#ff5a5a', speed: 120, life: 0.3, size: 3 });
        dead = true;
      } else if (!player.onFoot && player.car && Math.hypot(b.x - player.x, b.y - player.y) < 30) {
        damageCar(world, player.car, b.damage * 0.5);
        dead = true;
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }
}

export function spawnGang(world, x, y, count) {
  for (let i = 0; i < count; i++) {
    // Pick a spot on open ground, never inside a building.
    let gx = x;
    let gy = y;
    for (let tries = 0; tries < 10; tries++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = 60 + Math.random() * 160;
      gx = x + Math.cos(a) * r;
      gy = y + Math.sin(a) * r;
      if (!pointInBuilding(world.city, gx, gy)) break;
    }
    world.enemies.push({
      x: gx,
      y: gy,
      angle: Math.random() * Math.PI * 2,
      health: 60,
      fireCooldown: 1 + Math.random(),
      state: 'guard',
      walkPhase: Math.random() * 6,
      strafeDir: Math.random() < 0.5 ? 1 : -1,
    });
  }
}

export function hurtEnemy(world, enemy, amount) {
  enemy.health -= amount;
  spawnParticles(world.fx, enemy.x, enemy.y, { count: 5, color: '#ff5a5a', speed: 120, life: 0.3, size: 3 });
  if (enemy.health <= 0) {
    enemy.state = 'down';
    world.stats.gangDown += 1;
    spawnParticles(world.fx, enemy.x, enemy.y, { count: 12, color: '#ff5a5a', speed: 160, life: 0.5, size: 4 });
  }
}

export function enemiesAlive(world) {
  let n = 0;
  for (const e of world.enemies) if (e.state !== 'down') n++;
  return n;
}

export function updateEnemies(world, dt) {
  const player = world.player;
  for (const e of world.enemies) {
    if (e.state === 'down') continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy);
    e.fireCooldown -= dt;
    if (d < 520) {
      e.state = 'fight';
      e.angle = Math.atan2(dy, dx);
      // Strafe at mid-range, close in when far, back off when too close.
      let move = 0;
      if (d > 300) move = 120;
      else if (d < 140) move = -80;
      const strafe = e.strafeDir * 60;
      if (Math.random() < dt * 0.5) e.strafeDir *= -1;
      e.x += (Math.cos(e.angle) * move + Math.cos(e.angle + Math.PI / 2) * strafe) * dt;
      e.y += (Math.sin(e.angle) * move + Math.sin(e.angle + Math.PI / 2) * strafe) * dt;
      resolveBuildingCollisions(world.city, e, 12);
      e.walkPhase += 120 * dt * 0.06;
      if (e.fireCooldown <= 0 && d < 480) {
        fireBullet(world, e.x, e.y, e.angle, 'enemy');
        e.fireCooldown = 0.7 + Math.random() * 0.9;
      }
    } else {
      e.state = 'guard';
      e.angle += Math.sin(world.time * 0.5 + e.walkPhase) * dt * 0.5;
    }
  }
}

export function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (e.state === 'down') {
    ctx.rotate(e.angle);
    ctx.fillStyle = '#b03030';
    ctx.fillRect(-13, -6, 26, 12);
    ctx.fillStyle = '#c98d5e';
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(e.angle + Math.PI / 2);
  const swing = Math.sin(e.walkPhase) * 3;
  ctx.fillStyle = '#2b2b2e';
  ctx.fillRect(-6, -2 + swing * 0.4, 5, 12);
  ctx.fillRect(1, -2 - swing * 0.4, 5, 12);
  // Red jacket: the Dockside Kings' colours.
  ctx.fillStyle = '#b03030';
  ctx.beginPath();
  ctx.ellipse(0, -2, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98d5e';
  ctx.beginPath();
  ctx.arc(0, -12, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1c1e';
  ctx.beginPath();
  ctx.arc(0, -13.5, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Their gun.
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 14, 4);
  ctx.restore();
}

export function drawBullets(ctx, bullets) {
  ctx.save();
  ctx.fillStyle = '#ffe66d';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
