// Pedestrians: people strolling the sidewalks who scatter when trouble starts.
// They walk along road edges, pause at corners, and flee from gunfire, speeding
// cars and police chases. Knocking one down is a crime the police notice.

import { PEDS, ROADS, WORLD } from './config.js';
import { resolveBuildingCollisions } from './city.js';
import { clamp } from './random.js';
import { spawnParticles } from './effects.js';
import { addHeat } from './police.js';

const SHIRTS = ['#e8837a', '#7fb5b5', '#f2c230', '#9db8d2', '#d9a5c0', '#a8c686', '#f4e3c1', '#8d99ae'];
const PANTS = ['#3a3a42', '#4f6d8c', '#7a6a4f', '#5d4a6b', '#2f4f4f'];

let nextId = 1;

function randomSidewalkPoint(world, cx, cy, minR, maxR) {
  const rng = world.rng;
  for (let tries = 0; tries < 20; tries++) {
    const vertical = rng.chance(0.5);
    let x;
    let y;
    if (vertical) {
      const vx = rng.pick(ROADS.vertical);
      x = vx + (rng.chance(0.5) ? 1 : -1) * (ROADS.width / 2 + 12);
      y = rng.range(80, WORLD.beachTop - 80);
    } else {
      const hy = rng.pick(ROADS.horizontal);
      x = rng.range(80, WORLD.width - 80);
      y = hy + (rng.chance(0.5) ? 1 : -1) * (ROADS.width / 2 + 12);
    }
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minR && d <= maxR) return { x, y };
  }
  return { x: cx + 200, y: cy };
}

export function createPed(world, x, y) {
  return {
    id: nextId++,
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 0,
    state: 'walk', // walk | idle | flee | down
    target: null,
    idleTimer: 0,
    downTimer: 0,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    pants: PANTS[Math.floor(Math.random() * PANTS.length)],
    skin: ['#f2c9a0', '#c98d5e', '#8d5a3b', '#f7d7b0'][Math.floor(Math.random() * 4)],
    walkPhase: Math.random() * Math.PI * 2,
  };
}

function pickStrollTarget(world, ped) {
  const p = randomSidewalkPoint(world, ped.x, ped.y, 60, 420);
  ped.target = p;
}

function dangerNear(world, x, y) {
  // Gunfire, a speeding car or a siren nearby makes peds run.
  if (world.lastShotAt && world.time - world.lastShotAt < 2.5) {
    const d = Math.hypot(x - world.lastShotX, y - world.lastShotY);
    if (d < 420) return true;
  }
  for (const car of world.cars) {
    if (car.driver === 'police' && car.siren) {
      if (Math.hypot(x - car.x, y - car.y) < 260) return true;
    }
    if (Math.abs(car.speed) > 380) {
      if (Math.hypot(x - car.x, y - car.y) < 170) return true;
    }
  }
  return false;
}

export function maintainPeds(world) {
  const player = world.player;
  for (let i = world.peds.length - 1; i >= 0; i--) {
    const ped = world.peds[i];
    const d = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (d > PEDS.despawnRadius) world.peds.splice(i, 1);
  }
  while (world.peds.length < PEDS.count) {
    const p = randomSidewalkPoint(world, player.x, player.y, 300, PEDS.spawnRadius);
    const ped = createPed(world, p.x, p.y);
    pickStrollTarget(world, ped);
    world.peds.push(ped);
  }
}

export function updatePeds(world, dt) {
  const player = world.player;
  for (const ped of world.peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.target = null;
      }
      continue;
    }
    const scared = dangerNear(world, ped.x, ped.y);
    if (scared && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.target = null;
    }
    if (ped.state === 'flee') {
      // Run away from the player and the nearest police car.
      let fx = ped.x - player.x;
      let fy = ped.y - player.y;
      let d = Math.hypot(fx, fy) || 1;
      fx /= d;
      fy /= d;
      for (const car of world.cars) {
        if (car.driver === 'police') {
          const cd = Math.hypot(ped.x - car.x, ped.y - car.y);
          if (cd < 300) {
            fx += (ped.x - car.x) / (cd || 1);
            fy += (ped.y - car.y) / (cd || 1);
          }
        }
      }
      const len = Math.hypot(fx, fy) || 1;
      ped.angle = Math.atan2(fy / len, fx / len);
      ped.speed = PEDS.fleeSpeed;
      if (!scared && Math.random() < dt * 0.4) {
        ped.state = 'walk';
        pickStrollTarget(world, ped);
      }
    } else if (ped.state === 'idle') {
      ped.speed = 0;
      ped.idleTimer -= dt;
      if (ped.idleTimer <= 0) {
        ped.state = 'walk';
        pickStrollTarget(world, ped);
      }
    } else {
      // Stroll toward the target; pause at random.
      if (!ped.target) pickStrollTarget(world, ped);
      const dx = ped.target.x - ped.x;
      const dy = ped.target.y - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        if (Math.random() < 0.3) {
          ped.state = 'idle';
          ped.idleTimer = 1 + Math.random() * 3;
        } else {
          pickStrollTarget(world, ped);
        }
      } else {
        ped.angle = Math.atan2(dy, dx);
        ped.speed = PEDS.walkSpeed * (0.8 + Math.random() * 0.4);
      }
    }

    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.x = clamp(ped.x, 20, WORLD.width - 20);
    ped.y = clamp(ped.y, 20, WORLD.waterTop - 16);
    resolveBuildingCollisions(world.city, ped, 12);
    ped.walkPhase += ped.speed * dt * 0.06;

    // Hit by a car? Knocked down, and the driver pays for it.
    if (ped.state !== 'down') {
      for (const car of world.cars) {
        if (car.wrecked) continue;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d < 30 && Math.abs(car.speed) > 60) {
          ped.state = 'down';
          ped.downTimer = 4;
          ped.speed = 0;
          spawnParticles(world.fx, ped.x, ped.y, { count: 8, color: '#ffd23c', speed: 140, life: 0.4, size: 3 });
          if (car.driver === 'player') {
            addHeat(world, 100, 'hit a pedestrian');
            world.stats.pedsHit += 1;
            world.audio.crash();
          }
          break;
        }
      }
    }
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    // Lying on the ground, stars circling.
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.shirt;
    ctx.fillRect(-13, -6, 26, 12);
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle + Math.PI / 2);
  const swing = Math.sin(ped.walkPhase) * (ped.speed > 10 ? 3 : 0);
  // Legs, body, head: a simple top-down figure.
  ctx.fillStyle = ped.pants;
  ctx.fillRect(-6, -2 + swing * 0.4, 5, 12);
  ctx.fillRect(1, -2 - swing * 0.4, 5, 12);
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, -2, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -12, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2b2e';
  ctx.beginPath();
  ctx.arc(0, -13.5, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
