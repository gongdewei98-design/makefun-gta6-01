// The law: a wanted level in stars, police cars that hunt the player, foot
// cops who make the arrest, and the slow fade when the player stays unseen.
// Heat is the fine-grained score under the stars; crimes add heat, hiding
// sheds it.

import { CAR, POLICE, WANTED } from './config.js';
import { randomRoadPoint } from './city.js';
import { angleDiff, clamp } from './random.js';
import { createCar, damageCar, driveCar } from './vehicles.js';
import { addShake, spawnParticles } from './effects.js';

export function addHeat(world, amount, reason) {
  if (world.mode !== 'playing') return;
  const before = world.wanted;
  world.heat = Math.min(POLICE.heatPerStar * 5, world.heat + amount);
  world.wanted = Math.min(5, Math.floor(world.heat / POLICE.heatPerStar));
  if (world.wanted > before) {
    world.notify(`WANTED LEVEL ${world.wanted}`, reason || 'The police are on to you', 2.4);
    world.audio.busted();
  } else if (world.wanted === 0 && world.heat > 0) {
    world.wanted = 1;
    world.notify('WANTED LEVEL 1', reason || 'The police are on to you', 2.4);
  }
  world.lastCrimeAt = world.time;
}

export function setWanted(world, stars) {
  world.wanted = clamp(stars, 0, 5);
  world.heat = world.wanted * POLICE.heatPerStar;
  if (stars > 0) world.notify(`WANTED LEVEL ${stars}`, 'Lose the cops or lie low', 2.4);
}

export function clearWanted(world) {
  world.wanted = 0;
  world.heat = 0;
  world.bustProgress = 0;
}

function policeCars(world) {
  return world.cars.filter((c) => c.driver === 'police' && !c.wrecked);
}

function spawnPoliceCar(world) {
  const player = world.player;
  const p = randomRoadPoint(world.rng, player.x, player.y, 650, POLICE.spawnRadius);
  const car = createCar(p.x, p.y, 0, 'police', 'police');
  car.angle = Math.atan2(player.y - p.y, player.x - p.x);
  world.cars.push(car);
  return car;
}

function spawnFootCop(world, x, y) {
  const cop = {
    x, y,
    angle: 0,
    speed: 0,
    health: 50,
    state: 'chase',
    downTimer: 0,
    walkPhase: Math.random() * 6,
  };
  world.cops.push(cop);
  return cop;
}

function updatePoliceCar(world, car, dt) {
  const player = world.player;
  const target = player.car ?? player;
  const tx = target.x + (target.vx || 0) * 0.4;
  const ty = target.y + (target.vy || 0) * 0.4;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  const dist = Math.hypot(tx - car.x, ty - car.y);

  // Ram the player's car; slow down to drop off cops when the player is on foot.
  let throttle = 1;
  if (player.onFoot && dist < 190) throttle = dist < 90 ? -0.5 : 0.25;
  if (car.reverseTimer > 0) {
    car.reverseTimer -= dt;
    driveCar(world, car, { throttle: -1, steer: -Math.sign(diff), handbrake: false }, dt);
    return;
  }
  driveCar(world, car, { throttle, steer: clamp(diff * 2.4, -1, 1), handbrake: false }, dt);

  // Stuck against a wall? Back up and try again.
  if (Math.abs(car.speed) < 14 && throttle > 0.5) {
    car.stuckTimer += dt;
    if (car.stuckTimer > 1.6) {
      car.reverseTimer = 0.9;
      car.stuckTimer = 0;
    }
  } else {
    car.stuckTimer = 0;
  }

  // Drop a foot cop when close to a player on foot.
  if (player.onFoot && dist < 220 && world.cops.length < 2 + world.wanted) {
    if (Math.random() < dt * 0.5) {
      spawnFootCop(world, car.x + 40, car.y);
    }
  }
}

function updateFootCop(world, cop, dt) {
  const player = world.player;
  if (cop.state === 'down') {
    cop.downTimer -= dt;
    return;
  }
  const dx = player.x - cop.x;
  const dy = player.y - cop.y;
  const d = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  const speed = 265;
  cop.speed = speed;
  cop.x += Math.cos(cop.angle) * speed * dt;
  cop.y += Math.sin(cop.angle) * speed * dt;
  cop.walkPhase += speed * dt * 0.06;
  if (d > 1200) cop.state = 'gone';
}

export function updatePolice(world, dt) {
  const player = world.player;
  const wanted = world.wanted;

  // Keep the right number of police cars on the road.
  const cars = policeCars(world);
  const want = POLICE.carsPerStar[wanted] ?? 0;
  if (cars.length < want) {
    spawnPoliceCar(world);
  } else if (cars.length > want) {
    // Surplus cars leave: the farthest one drives off.
    let farthest = null;
    let farD = -1;
    for (const car of cars) {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d > farD) {
        farD = d;
        farthest = car;
      }
    }
    if (farthest && farD > 500) {
      const idx = world.cars.indexOf(farthest);
      if (idx !== -1) world.cars.splice(idx, 1);
    }
  }

  for (const car of policeCars(world)) updatePoliceCar(world, car, dt);
  for (const cop of world.cops) updateFootCop(world, cop, dt);
  for (let i = world.cops.length - 1; i >= 0; i--) {
    if (world.cops[i].state === 'gone' || (world.cops[i].state === 'down' && world.cops[i].downTimer <= -8)) {
      world.cops.splice(i, 1);
    }
  }

  // Can any police see the player?
  let seen = false;
  for (const car of policeCars(world)) {
    if (Math.hypot(car.x - player.x, car.y - player.y) < POLICE.sightRange) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of world.cops) {
      if (cop.state !== 'down' && Math.hypot(cop.x - player.x, cop.y - player.y) < POLICE.sightRange) {
        seen = true;
        break;
      }
    }
  }
  if (seen) world.lastSeenAt = world.time;

  // Heat fades while unseen; each faded star drops the wanted level.
  if (wanted > 0 && world.time - world.lastSeenAt > POLICE.decayDelay) {
    world.decayTimer = (world.decayTimer || 0) + dt;
    if (world.decayTimer >= POLICE.decayStep) {
      world.decayTimer = 0;
      world.heat = Math.max(0, world.heat - POLICE.heatPerStar);
      world.wanted = Math.floor(world.heat / POLICE.heatPerStar);
      if (world.wanted === 0) {
        world.notify('YOU LOST THEM', 'The heat is off — for now', 2.2);
      }
    }
  } else {
    world.decayTimer = 0;
  }

  // Busted: a cop reaches a slow player on foot, or police box in a stopped car.
  if (wanted > 0 && !player.dead) {
    let busting = false;
    if (player.onFoot) {
      const playerSpeed = Math.hypot(player.vx, player.vy);
      for (const cop of world.cops) {
        if (cop.state === 'down') continue;
        if (Math.hypot(cop.x - player.x, cop.y - player.y) < POLICE.bustRadius && playerSpeed < 90) {
          busting = true;
          break;
        }
      }
    } else if (player.car) {
      if (Math.abs(player.car.speed) < 25) {
        let near = 0;
        for (const car of policeCars(world)) {
          if (Math.hypot(car.x - player.x, car.y - player.y) < 150) near++;
        }
        if (near >= 2) busting = true;
      }
    }
    if (busting) {
      world.bustProgress += dt / POLICE.bustTime;
      if (world.bustProgress >= 1) {
        world.bustProgress = 0;
        world.mode = 'busted';
      }
    } else {
      world.bustProgress = Math.max(0, world.bustProgress - dt * 1.5);
    }
  }

  // Police cars that ram the player hard hurt the player's car.
  if (player.car && !player.car.wrecked) {
    for (const car of policeCars(world)) {
      const d = Math.hypot(car.x - player.car.x, car.y - player.car.y);
      if (d < 46 && Math.abs(car.speed) > 300) {
        damageCar(world, player.car, 8 * dt);
      }
    }
  }
}

export function hurtCop(world, cop, amount) {
  if (cop.state === 'down') return;
  cop.health -= amount;
  spawnParticles(world.fx, cop.x, cop.y, { count: 5, color: '#ff5a5a', speed: 120, life: 0.3, size: 3 });
  if (cop.health <= 0) {
    cop.state = 'down';
    cop.downTimer = 10;
    addHeat(world, WANTED.killCop, 'You dropped a cop');
  }
}

export function nearestPoliceDistance(world) {
  let best = Infinity;
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < best) best = d;
  }
  return best;
}

export function drawCop(ctx, cop, time) {
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (cop.state === 'down') {
    ctx.rotate(cop.angle);
    ctx.fillStyle = '#1c2733';
    ctx.fillRect(-13, -6, 26, 12);
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(15, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(cop.angle + Math.PI / 2);
  const swing = Math.sin(cop.walkPhase) * 3;
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(-6, -2 + swing * 0.4, 5, 12);
  ctx.fillRect(1, -2 - swing * 0.4, 5, 12);
  ctx.fillStyle = '#2e6bff';
  ctx.beginPath();
  ctx.ellipse(0, -2, 8, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c9a0';
  ctx.beginPath();
  ctx.arc(0, -12, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Cap.
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.arc(0, -13.5, 6.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-6.5, -14, 13, 3);
  ctx.restore();
}
