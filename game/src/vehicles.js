// Cars: arcade driving physics, traffic that follows the road grid, parked
// cars waiting to be stolen, and the damage model. One physics step serves
// the player, traffic and the police; only the input source differs.

import { CAR, ROADS, TRAFFIC, WORLD } from './config.js';
import { inWater, isOnRoad, nearestRoadPoint, randomRoadPoint, resolveBuildingCollisions } from './city.js';
import { angleDiff, clamp, lerp } from './random.js';
import { addShake, spawnExplosion, spawnParticles, spawnSkid, spawnSmoke } from './effects.js';

const CAR_COLORS = [
  '#d94f3d', '#3d7dd9', '#e8c33c', '#e8e8e8', '#2f2f33', '#7fb069',
  '#c86dd7', '#4ecdc4', '#f4a259', '#8d99ae', '#a3b18a', '#e07a5f',
];

let nextId = 1;

export function createCar(x, y, angle, type, driver) {
  const colors = type === 'police'
    ? { body: '#1c2733', cabin: '#dfe6ea' }
    : type === 'taxi'
      ? { body: '#f2c230', cabin: '#ffe9a8' }
      : { body: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], cabin: '#cfe3ee' };
  return {
    id: nextId++,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    type,
    driver, // 'player' | 'traffic' | 'police' | 'parked' | 'none'
    color: colors.body,
    cabin: colors.cabin,
    health: CAR.maxHealth,
    wrecked: false,
    wreckTimer: 0,
    brakeLights: false,
    siren: type === 'police',
    // Traffic route: which road the car follows and which way.
    roadVertical: true,
    roadLine: x,
    roadDir: 1,
    lane: 1,
    turnAt: null, // intersection centre to aim for while turning
    stuckTimer: 0,
    reverseTimer: 0,
    smokeTimer: 0,
    target: null, // police chase target {x, y}
  };
}

function topSpeedOf(car) {
  return CAR.topSpeed[car.type] ?? CAR.topSpeed.sedan;
}

/** Arcade car physics. input: { throttle -1..1, steer -1..1, handbrake }. */
export function driveCar(world, car, input, dt) {
  if (car.wrecked) {
    car.vx *= 1 - 3 * dt;
    car.vy *= 1 - 3 * dt;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    return;
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const forwardSpeed = car.vx * fx + car.vy * fy;
  // Steering bites harder the faster the car goes, and flips in reverse.
  const speedFactor = clamp(Math.abs(forwardSpeed) / 260, 0, 1);
  car.angle += input.steer * CAR.turnRate * speedFactor * Math.sign(forwardSpeed || 1) * dt;

  let accel = 0;
  if (input.throttle > 0) accel = CAR.accel * input.throttle;
  else if (input.throttle < 0) {
    accel = forwardSpeed > 30 ? -CAR.brake : CAR.accel * 0.7 * input.throttle;
  }
  car.brakeLights = input.throttle < 0 && forwardSpeed > 30;
  const top = topSpeedOf(car);
  let nextForward = forwardSpeed + accel * dt;
  nextForward = clamp(nextForward, -CAR.reverseMax, top);
  // Rolling drag and a soft top-speed wall.
  nextForward *= 1 - 0.25 * dt;
  if (Math.abs(nextForward) < 2 && input.throttle === 0) nextForward = 0;

  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  const grip = input.handbrake ? CAR.handbrakeGrip : CAR.grip;
  // Split velocity into forward and lateral parts; grip eats the lateral one.
  const latX = car.vx - forwardSpeed * fx;
  const latY = car.vy - forwardSpeed * fy;
  const latKeep = Math.exp(-grip * dt);
  car.vx = nx * nextForward + latX * latKeep;
  car.vy = ny * nextForward + latY * latKeep;
  car.speed = nextForward;

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.x = clamp(car.x, 30, WORLD.width - 30);
  car.y = clamp(car.y, 30, WORLD.waterTop - 24);

  // Skid marks while sliding sideways or handbraking.
  const lateral = Math.abs(car.vx * -ny + car.vy * nx);
  if ((input.handbrake && Math.abs(nextForward) > 120) || lateral > 200) {
    spawnSkid(world.fx, car.x - nx * 24, car.y - ny * 24, car.angle);
  }
  // Sand slows a car down.
  if (car.y > 2480) {
    car.vx *= 1 - 1.2 * dt;
    car.vy *= 1 - 1.2 * dt;
  }
}

function collideCarWithBuildings(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const points = [
    { x: car.x, y: car.y, r: 20 },
    { x: car.x + fx * 24, y: car.y + fy * 24, r: 15 },
    { x: car.x - fx * 24, y: car.y - fy * 24, r: 15 },
  ];
  let hit = false;
  for (const p of points) {
    const before = { x: p.x, y: p.y };
    if (resolveBuildingCollisions(world.city, p, p.r)) {
      car.x += p.x - before.x;
      car.y += p.y - before.y;
      hit = true;
    }
  }
  if (hit) {
    const impact = Math.hypot(car.vx, car.vy);
    car.vx *= -0.25;
    car.vy *= -0.25;
    car.speed *= -0.25;
    if (impact > 240) damageCar(world, car, impact * 0.06);
    return impact;
  }
  return 0;
}

function collideCars(world, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = 44;
  if (d === 0 || d >= min) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const overlap = (min - d) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  const impact = Math.abs(rel);
  if (impact > 60) {
    const impulse = rel * 0.5;
    a.vx += nx * impulse;
    a.vy += ny * impulse;
    b.vx -= nx * impulse;
    b.vy -= ny * impulse;
    damageCar(world, a, impact * 0.05);
    damageCar(world, b, impact * 0.05);
    spawnParticles(world.fx, (a.x + b.x) / 2, (a.y + b.y) / 2, {
      count: 6, color: '#ffd23c', speed: 200, life: 0.3, size: 3,
    });
  }
  return impact;
}

export function damageCar(world, car, amount) {
  if (car.wrecked) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    car.wreckTimer = 6;
    car.driver = 'none';
    car.siren = false;
    world.audio.crash();
    spawnExplosion(world.fx, car.x, car.y);
    if (world.player.car === car) ejectPlayer(world, car, 25);
  }
}

export function ejectPlayer(world, car, damage) {
  const player = world.player;
  player.car = null;
  player.onFoot = true;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 34;
  player.y = car.y + Math.sin(side) * 34;
  player.angle = car.angle;
  if (damage) hurtPlayer(world, damage);
  world.audio.doorSlam();
}

export function hurtPlayer(world, amount) {
  const player = world.player;
  if (world.mode !== 'playing' || player.dead) return;
  player.health -= amount;
  player.lastDamageAt = world.time;
  addShake(world.fx, 4);
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
  }
}

// --- Traffic ---

function steerToward(car, tx, ty, dt) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  return {
    throttle: 1,
    steer: clamp(diff * 2.2, -1, 1),
    handbrake: false,
  };
}

function updateTrafficCar(world, car, dt) {
  // Turning? Aim for the intersection centre first, so the car rounds the
  // corner instead of cutting across the sidewalk.
  if (car.turnAt) {
    const input = steerToward(car, car.turnAt.x, car.turnAt.y, dt);
    if (Math.abs(car.speed) > TRAFFIC.cruiseSpeed) input.throttle = 0;
    driveCar(world, car, input, dt);
    if (Math.hypot(car.x - car.turnAt.x, car.y - car.turnAt.y) < 55) car.turnAt = null;
    return;
  }
  // Pick a point ahead on the car's road; turn at intersections sometimes.
  const line = car.roadLine;
  const ahead = 260;
  let tx;
  let ty;
  if (car.roadVertical) {
    tx = line + car.lane * ROADS.laneOffset;
    ty = car.y + car.roadDir * ahead;
    // Near a horizontal road? Maybe turn onto it.
    for (const hy of ROADS.horizontal) {
      if (Math.abs(car.y - hy) < 46 && Math.random() < 0.012) {
        car.roadVertical = false;
        car.roadLine = hy;
        car.roadDir = Math.random() < 0.5 ? 1 : -1;
        car.lane = car.roadDir;
        car.turnAt = { x: line, y: hy };
        break;
      }
    }
    if (ty < 60 || ty > WORLD.beachTop - 60) car.roadDir *= -1;
  } else {
    tx = car.x + car.roadDir * ahead;
    ty = line + car.lane * ROADS.laneOffset;
    for (const vx of ROADS.vertical) {
      if (Math.abs(car.x - vx) < 46 && Math.random() < 0.012) {
        car.roadVertical = true;
        car.roadLine = vx;
        car.roadDir = Math.random() < 0.5 ? 1 : -1;
        car.lane = car.roadDir;
        car.turnAt = { x: vx, y: line };
        break;
      }
    }
    if (tx < 60 || tx > WORLD.width - 60) car.roadDir *= -1;
  }

  // Slow down for the car ahead, and for any car closing in from the side
  // (crossing traffic at an intersection).
  let throttle = 1;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of world.cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    const aheadDist = dx * fx + dy * fy;
    const sideDist = Math.abs(dx * -fy + dy * fx);
    if (aheadDist > 0 && aheadDist < 110 && sideDist < 34) {
      throttle = aheadDist < 55 ? -1 : 0.15;
      break;
    }
    // Closing fast from any direction? Brake.
    if (dist < 105 && dist > 0) {
      const closing = -((other.vx - car.vx) * (dx / dist) + (other.vy - car.vy) * (dy / dist));
      if (closing > 60) {
        throttle = -1;
        break;
      }
    }
  }
  const input = steerToward(car, tx, ty, dt);
  input.throttle = throttle;
  // Cap traffic speed.
  const top = TRAFFIC.cruiseSpeed;
  if (Math.abs(car.speed) > top && input.throttle > 0) input.throttle = 0;
  driveCar(world, car, input, dt);

  // Stuck? Reverse a little, then give up and respawn.
  if (Math.abs(car.speed) < 12 && throttle > 0) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.5 && car.stuckTimer < 2.5) {
      driveCar(world, car, { throttle: -1, steer: -input.steer, handbrake: false }, dt);
    }
    if (car.stuckTimer > 5) {
      respawnTrafficCar(world, car);
    }
  } else {
    car.stuckTimer = 0;
  }
}

export function respawnTrafficCar(world, car) {
  const p = randomRoadPoint(world.rng, world.player.x, world.player.y, 500, TRAFFIC.spawnRadius);
  car.x = p.x;
  car.y = p.y;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  car.roadVertical = p.vertical;
  car.roadLine = p.vertical ? p.x : p.y;
  car.roadDir = Math.random() < 0.5 ? 1 : -1;
  car.lane = car.roadDir;
  car.angle = car.roadVertical ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.roadDir > 0 ? 0 : Math.PI;
  car.health = CAR.maxHealth;
  car.wrecked = false;
  car.stuckTimer = 0;
  car.turnAt = null;
}

export function maintainTraffic(world) {
  const player = world.player;
  // Remove traffic that wandered too far, then top up.
  for (let i = world.cars.length - 1; i >= 0; i--) {
    const car = world.cars[i];
    if (car.driver === 'traffic') {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d > TRAFFIC.despawnRadius) world.cars.splice(i, 1);
    }
  }
  let count = 0;
  for (const car of world.cars) if (car.driver === 'traffic') count++;
  while (count < TRAFFIC.count) {
    const p = randomRoadPoint(world.rng, player.x, player.y, 420, TRAFFIC.spawnRadius);
    const type = world.rng.pick(['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports']);
    const car = createCar(p.x, p.y, 0, type, 'traffic');
    car.roadVertical = p.vertical;
    car.roadLine = p.vertical ? p.x : p.y;
    car.roadDir = Math.random() < 0.5 ? 1 : -1;
    car.lane = car.roadDir;
    car.angle = car.roadVertical ? (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.roadDir > 0 ? 0 : Math.PI;
    world.cars.push(car);
    count++;
  }
}

export function spawnParkedCars(world) {
  const spots = [...world.city.parkingSpots];
  // Shuffle and take a spread of spots.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(world.rng.next() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const take = Math.min(spots.length, 16);
  for (let i = 0; i < take; i++) {
    const s = spots[i];
    const type = world.rng.pick(['sedan', 'sedan', 'van', 'sports', 'taxi']);
    const car = createCar(s.x, s.y, s.angle, type, 'parked');
    world.cars.push(car);
  }
}

export function updateVehicles(world, dt) {
  const cars = world.cars;
  for (const car of cars) {
    if (car.wrecked) {
      car.wreckTimer -= dt;
      car.vx *= 1 - 3 * dt;
      car.vy *= 1 - 3 * dt;
      car.x += car.vx * dt;
      car.y += car.vy * dt;
      if (Math.random() < dt * 6) spawnSmoke(world.fx, car.x, car.y);
      continue;
    }
    if (car.driver === 'traffic') updateTrafficCar(world, car, dt);
    // Player and police cars are driven by their own systems.
    if (car.health < 45 && car.health > 0) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        spawnSmoke(world.fx, car.x + Math.cos(car.angle) * 22, car.y + Math.sin(car.angle) * 22);
        car.smokeTimer = 0.12;
      }
    }
  }
  // Collisions: cars against buildings and each other.
  for (const car of cars) {
    if (car.wrecked) continue;
    const impact = collideCarWithBuildings(world, car);
    if (impact > 300 && car.driver === 'player') {
      world.audio.crash();
      addShake(world.fx, 5);
    }
  }
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      if (cars[i].wrecked || cars[j].wrecked) continue;
      const impact = collideCars(world, cars[i], cars[j]);
      if (impact > 320 && (cars[i].driver === 'player' || cars[j].driver === 'player')) {
        world.audio.crash();
        addShake(world.fx, 4);
      }
    }
  }
  // Remove long-dead wrecks.
  for (let i = cars.length - 1; i >= 0; i--) {
    if (cars[i].wrecked && cars[i].wreckTimer <= 0) cars.splice(i, 1);
  }
}

export function nearestStealableCar(world, x, y) {
  let best = null;
  let bestD = CAR.stealRadius;
  for (const car of world.cars) {
    if (car.wrecked || car.driver === 'player') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Soft shadow, offset to the south-east like the buildings'.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(6, 9, 36, 20, car.angle, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const L = CAR.length;
  const W = CAR.width;
  // Body.
  ctx.fillStyle = car.wrecked ? '#2b2b2e' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 9);
  ctx.fill();
  // Sunlit top edge and a darker skirt, so the body has depth.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, -L / 2 + 3, -W / 2 + 2, L - 6, 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, -L / 2 + 3, W / 2 - 8, L - 6, 6, 3);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = car.wrecked ? '#1c1c1e' : car.cabin;
  roundRect(ctx, -L / 6, -W / 2 + 5, L / 3, W - 10, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,180,210,0.85)';
  ctx.fillRect(L / 6 - 2, -W / 2 + 6, 5, W - 12);
  // Headlights and taillights.
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 4, 3, 6);
  ctx.fillRect(L / 2 - 3, W / 2 - 10, 3, 6);
  ctx.fillStyle = car.brakeLights ? '#ff2e2e' : '#a33';
  ctx.fillRect(-L / 2, -W / 2 + 4, 3, 6);
  ctx.fillRect(-L / 2, W / 2 - 10, 3, 6);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.type === 'police') {
    // White doors and a light bar.
    ctx.fillStyle = '#eef2f4';
    ctx.fillRect(-L / 6, -W / 2 + 2, L / 3, W - 4);
    ctx.fillStyle = '#1c2733';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', 0, 3);
    const flash = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.beginPath();
    ctx.arc(-4, -W / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.beginPath();
    ctx.arc(6, -W / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Siren glow on the ground for police.
  if (car.type === 'police' && car.siren && !car.wrecked) {
    const flash = Math.floor(time * 6) % 2 === 0;
    const glow = ctx.createRadialGradient(car.x, car.y, 4, car.x, car.y, 60);
    glow.addColorStop(0, flash ? 'rgba(255,46,46,0.28)' : 'rgba(46,107,255,0.28)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 60, 0, Math.PI * 2);
    ctx.fill();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
