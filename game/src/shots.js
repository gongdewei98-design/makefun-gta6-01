// Screenshot scenes behind ?shot=chase|street|drive|mission (with &seed=N).
// Each one stages the real game — same rules, same city — then runs it forward
// a few seconds with a simple autopilot, so the frame is what playing really
// looks like and the same seed always gives the same frame. When the scene is
// ready, window.__shotReady is set for the screenshot tool.

import { PLACES } from './city.js';
import { createCar, driveCar } from './vehicles.js';
import { clearWanted } from './police.js';
import { MISSIONS, startMission } from './missions.js';
import { spawnGang } from './combat.js';
import { createPed } from './pedestrians.js';
import { angleDiff, clamp } from './random.js';

const SHOT_SECONDS = {
  chase: 2.4,
  street: 2.0,
  drive: 3.0,
  mission: 2.4,
};

function putPlayerInCar(world, x, y, angle, type, color) {
  const car = createCar(x, y, angle, type, 'player');
  if (color) car.color = color;
  world.cars.push(car);
  world.player.car = car;
  world.player.onFoot = false;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  world.camera.x = x;
  world.camera.y = y;
  return car;
}

function putPlayerOnFoot(world, x, y, angle) {
  world.player.car = null;
  world.player.onFoot = true;
  world.player.x = x;
  world.player.y = y;
  world.player.angle = angle;
  world.player.aimAngle = angle;
  world.camera.x = x;
  world.camera.y = y;
}

function spawnChase(world, x, y, count) {
  for (let i = 0; i < count; i++) {
    const behind = 130 + i * 110;
    const side = i % 2 === 0 ? -30 : 30;
    const car = createCar(x - behind, y + side, 0, 'police', 'police');
    car.vx = 420;
    car.speed = 420;
    world.cars.push(car);
  }
  // Oncoming traffic in the far lane streams past the chase.
  for (const [dx, dy] of [[320, -28], [620, -28]]) {
    const car = createCar(x + dx, y + dy, Math.PI, 'sedan', 'traffic');
    car.roadVertical = false;
    car.roadLine = y;
    car.roadDir = -1;
    car.lane = -1;
    car.vx = -210;
    car.speed = -210;
    world.cars.push(car);
  }
}

function placePeds(world, points) {
  // Hand-placed pedestrians near the action, so each frame has people in it.
  // They stroll off on their own — and scatter when the sirens come.
  for (const [x, y] of points) {
    const ped = createPed(world, x, y);
    ped.target = { x: x + 160, y: y - 30 };
    world.peds.push(ped);
  }
}

function stageChase(world) {
  // Cover shot: Mara fleeing down the beach road, three stars, sirens behind,
  // a mission objective on the HUD.
  const x = 1200;
  const y = 2300;
  // Clear the road ahead so the chase runs clean.
  for (let i = world.cars.length - 1; i >= 0; i--) {
    const car = world.cars[i];
    if (car.driver === 'traffic' && Math.hypot(car.x - x, car.y - y) < 1100) {
      world.cars.splice(i, 1);
    }
  }
  putPlayerInCar(world, x, y, 0, 'sports', '#d94f3d');
  spawnChase(world, x, y, 3);
  const def = MISSIONS.find((m) => m.id === 'long-way-home');
  startMission(world, def);
  // Point the mission at the safehouse so the objective reads on the HUD.
  world.mission.timer = 96;
  // People on the sidewalks ahead, about to scatter from the sirens.
  placePeds(world, [[1050, 2233], [1350, 2367], [1520, 2233], [900, 2367]]);
}

function stageStreet(world) {
  // On foot in Old Town: pedestrians, traffic, palms, pastel buildings.
  putPlayerOnFoot(world, 1500, 1500, -Math.PI / 2);
  clearWanted(world);
  // People close by so the street feels lived in.
  placePeds(world, [
    [-120, 60], [90, -80], [160, 120], [-200, -140], [60, 200],
    [-60, -190], [220, -40], [-260, 90], [30, -260],
  ].map(([dx, dy]) => [1500 + dx, 1500 + dy]));
}

function stageDrive(world) {
  // Cruising the coastal road with the beach and the water in frame.
  const x = 1100;
  const y = 2300;
  // Clear the road ahead so the cruise is clean, then script oncoming cars.
  for (let i = world.cars.length - 1; i >= 0; i--) {
    const car = world.cars[i];
    if (car.driver === 'traffic' && Math.hypot(car.x - x, car.y - y) < 950) {
      world.cars.splice(i, 1);
    }
  }
  putPlayerInCar(world, x, y, 0, 'sedan', '#3d7dd9');
  world.camera.zoom = 0.85;
  world.shotThrottle = 0.85;
  clearWanted(world);
  for (const [dx, dy] of [[420, -28], [780, -28]]) {
    const car = createCar(x + dx, y + dy, Math.PI, 'sedan', 'traffic');
    car.roadVertical = false;
    car.roadLine = y;
    car.roadDir = -1;
    car.lane = -1;
    car.vx = -210;
    car.speed = -210;
    world.cars.push(car);
  }
  const ahead = createCar(x + 900, y + 28, 0, 'sports', 'traffic');
  ahead.roadVertical = false;
  ahead.roadLine = y;
  ahead.roadDir = 1;
  ahead.lane = 1;
  ahead.vx = 240;
  ahead.speed = 240;
  world.cars.push(ahead);
  // Strollers on the beach-side sidewalk, umbrellas behind them.
  placePeds(world, [[1300, 2367], [1600, 2367], [1000, 2367]]);
}

function stageMission(world) {
  // The harbor shootout: Mara on foot, gang members ahead, objective live.
  const spot = PLACES.harbor;
  putPlayerOnFoot(world, spot.x - 260, spot.y - 40, 0);
  clearWanted(world);
  const def = MISSIONS.find((m) => m.id === 'harbor-heat');
  startMission(world, def);
  // Keep the gang in frame, ahead of Mara.
  world.enemies.length = 0;
  spawnGang(world, spot.x - 60, spot.y, 4);
  // Bystanders caught in the shootout, running for cover.
  placePeds(world, [[2950, 2233], [3050, 2367], [2720, 2367], [2980, 2100]]);
  // A parked car for cover near the fight.
  const cover = createCar(spot.x - 150, spot.y + 28, 0, 'sedan', 'parked');
  cover.color = '#7fb5b5';
  world.cars.push(cover);
}

/** Drive the player's car straight ahead, gently, for the shot scenes. */
function autopilot(world, dt) {
  const car = world.player.car;
  if (!car || car.wrecked) return;
  // Look ahead for a car in the way; swing to the other lane to pass it,
  // and ease off the gas when something is right in front.
  let laneY = 2300;
  let throttle = world.shotThrottle ?? 0.7;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of world.cars) {
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const aheadDist = dx * fx + dy * fy;
    const sideDist = dx * -fy + dy * fx;
    if (aheadDist > 0 && aheadDist < 170 && Math.abs(sideDist) < 40) {
      laneY = 2300 + (sideDist > 0 ? -55 : 55);
      if (aheadDist < 80) throttle *= 0.3;
      break;
    }
  }
  const ahead = { x: car.x + 400, y: laneY };
  const desired = Math.atan2(ahead.y - car.y, ahead.x - car.x);
  const diff = angleDiff(car.angle, desired);
  driveCar(world, car, { throttle, steer: clamp(diff * 2, -1, 1), handbrake: false }, dt);
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
  world.player.vx = car.vx;
  world.player.vy = car.vy;
}

export function stageShot(world, name) {
  const stages = { chase: stageChase, street: stageStreet, drive: stageDrive, mission: stageMission };
  const stage = stages[name];
  if (!stage) return false;
  stage(world);
  return true;
}

export function shotDuration(name) {
  return SHOT_SECONDS[name] ?? 2;
}

export { autopilot };
