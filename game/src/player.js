// Mara Vega, the player: running the streets on foot, jacking cars, and
// shooting back. On foot she aims at the mouse; in a car the car is the body.

import { CAR, MONEY, PLAYER, WORLD } from './config.js';
import { inWater, resolveBuildingCollisions } from './city.js';
import { clamp } from './random.js';
import { damageCar, driveCar, ejectPlayer, nearestStealableCar } from './vehicles.js';
import { addHeat } from './police.js';
import { fireBullet } from './combat.js';
import { spawnParticles } from './effects.js';
import { PRESS_ENTER_CAR } from './input.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    vx: 0, vy: 0,
    health: PLAYER.maxHealth,
    money: MONEY.start,
    onFoot: true,
    car: null,
    aimAngle: -Math.PI / 2,
    fireCooldown: 0,
    lastDamageAt: -99,
    walkPhase: 0,
    moving: false,
    dead: false,
  };
}

function tryEnterCar(world) {
  const player = world.player;
  const car = nearestStealableCar(world, player.x, player.y);
  if (!car) return;
  const wasParked = car.driver === 'parked';
  car.driver = 'player';
  car.siren = false;
  player.car = car;
  player.onFoot = false;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  world.audio.doorSlam();
  world.stats.carsStolen += 1;
  if (!wasParked) {
    // Jacking a moving car in front of everyone is a crime; a parked one is quieter.
    addHeat(world, 100, 'You stole a car');
  } else {
    addHeat(world, 40, 'You stole a car');
  }
  world.notify('CAR JACKED', `${car.type === 'sports' ? 'A fast one.' : 'It runs. That counts.'}`, 1.6);
}

function exitCar(world) {
  const player = world.player;
  const car = player.car;
  if (!car) return;
  car.driver = 'parked';
  car.vx *= 0.3;
  car.vy *= 0.3;
  ejectPlayer(world, car, 0);
}

function collectPickups(world) {
  const player = world.player;
  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    const reach = player.onFoot ? 30 : 44;
    if (d < reach) {
      if (p.kind === 'cash') {
        player.money += p.amount;
        world.notify(`+$${p.amount}`, 'Found cash', 1.4);
      } else if (p.kind === 'health') {
        player.health = Math.min(PLAYER.maxHealth, player.health + 50);
        world.notify('+50 HEALTH', 'Patched up', 1.4);
      }
      world.audio.pickup();
      spawnParticles(world.fx, p.x, p.y, { count: 10, color: '#7dff8a', speed: 120, life: 0.5, size: 4 });
      world.pickups.splice(i, 1);
      // The spot refills after a while.
      world.pickupRespawns.push({ kind: p.kind, x: p.x, y: p.y, amount: p.amount, at: world.time + 60 });
    }
  }
  for (let i = world.pickupRespawns.length - 1; i >= 0; i--) {
    const r = world.pickupRespawns[i];
    if (world.time >= r.at) {
      world.pickups.push({ kind: r.kind, x: r.x, y: r.y, amount: r.amount });
      world.pickupRespawns.splice(i, 1);
    }
  }
}

export function updatePlayer(world, input, dt) {
  const player = world.player;
  if (player.dead) return;

  // Health comes back after a quiet stretch.
  if (world.time - player.lastDamageAt > PLAYER.regenDelay && player.health < PLAYER.maxHealth) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenRate * dt);
  }
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);

  if (player.onFoot) {
    const ax = input.axisX();
    const ay = input.axisY();
    const moving = ax !== 0 || ay !== 0;
    player.moving = moving;
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    let mx = 0;
    let my = 0;
    if (moving) {
      const len = Math.hypot(ax, ay);
      mx = (ax / len) * speed;
      my = (ay / len) * speed;
      player.angle = Math.atan2(my, mx);
    }
    player.vx = mx;
    player.vy = my;
    player.x += mx * dt;
    player.y += my * dt;
    player.x = clamp(player.x, 16, WORLD.width - 16);
    player.y = clamp(player.y, 16, WORLD.waterTop - 14);
    resolveBuildingCollisions(world.city, player, PLAYER.radius);
    player.walkPhase += Math.hypot(mx, my) * dt * 0.05;

    // Aim at the mouse; click or hold to shoot.
    const mouse = input.mouse;
    const worldMouse = world.screenToWorld(mouse.x, mouse.y);
    player.aimAngle = Math.atan2(worldMouse.y - player.y, worldMouse.x - player.x);
    if ((mouse.down || input.isDown('Space')) && player.fireCooldown <= 0) {
      fireBullet(world, player.x, player.y, player.aimAngle, 'player');
      player.fireCooldown = PLAYER.fireCooldown;
    }
  } else if (player.car) {
    const car = player.car;
    const throttle = -input.axisY();
    const steer = input.axisX();
    driveCar(world, car, { throttle, steer, handbrake: input.handbrake }, dt);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.vx = car.vx;
    player.vy = car.vy;
    // Bumping the horn.
    if (world.hornPressed) {
      world.audio.horn();
      world.hornPressed = false;
    }
  }

  collectPickups(world);
}

export function handlePlayerPresses(world, presses) {
  const player = world.player;
  if (player.dead) return;
  if (presses & PRESS_ENTER_CAR) { // E: get in or out of a car
    if (player.onFoot) tryEnterCar(world);
    else exitCar(world);
  }
}

export function drawPlayer(ctx, player, time) {
  if (!player.onFoot || player.dead) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle + Math.PI / 2);
  const swing = Math.sin(player.walkPhase) * (player.moving ? 3.5 : 0);
  // Legs.
  ctx.fillStyle = '#2f3a4d';
  ctx.fillRect(-7, -2 + swing * 0.4, 6, 13);
  ctx.fillRect(1, -2 - swing * 0.4, 6, 13);
  // Jacket (teal) and head.
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.ellipse(0, -2, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(0, -13, 7, 0, Math.PI * 2);
  ctx.fill();
  // Dark ponytail.
  ctx.fillStyle = '#3a2417';
  ctx.beginPath();
  ctx.arc(0, -15, 7, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();
  ctx.fillRect(-3, -22, 6, 8);
  ctx.restore();
  // Aim line and gun when on foot.
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.aimAngle);
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -2, 14, 4);
  ctx.restore();
}
