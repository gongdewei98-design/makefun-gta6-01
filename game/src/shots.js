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

// Hand-place pedestrians at offsets from (cx, cy), each with a stroll target
// along the sidewalk, so the staged frame has people near the action.
function placePeds(world, cx, cy, offsets) {
  for (const [dx, dy] of offsets) {
    const ped = createPed(world, cx + dx, cy + dy);
    ped.target = { x: ped.x + (dx % 2 === 0 ? 140 : -140), y: ped.y + 30 };
    world.peds.push(ped);
  }
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
  // Onlookers on the sidewalks ahead of the chase, watching it go by.
  placePeds(world, x, y, [
    [300, -67], [520, 67], [760, -67], [980, 67], [1200, -67],
    [1450, 67], [1700, -67], [210, 67],
  ]);
}

function stageStreet(world) {
  // On foot in Old Town: pedestrians, traffic, palms, pastel buildings.
  putPlayerOnFoot(world, 1500, 1500, -Math.PI / 2);
  clearWanted(world);
  // A crowd close by so the street feels lived in, including people at the
  // crosswalk corners where the zebra stripes are.
  placePeds(world, 1500, 1500, [
    [-120, 60], [90, -80], [160, 120], [-200, -140], [60, 200],
    [-70, -70], [70, 70], [-160, 140], [220, -40], [-40, -200],
    [140, -180], [-240, 40],
  ]);
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
  // Strollers on the beach-side sidewalk and a couple of beachgoers on the sand.
  placePeds(world, x, y, [
    [300, 67], [560, -67], [820, 67], [1080, -67], [1340, 67],
    [1600, -67], [430, 210], [950, 240],
  ]);
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
  // Dock workers and bystanders around the shootout: some scatter when the
  // shooting starts, which is exactly what the frame should show.
  placePeds(world, spot.x, spot.y, [
    [-320, 67], [-140, -67], [40, 67], [-420, -67], [120, -67],
    [-200, 120], [200, 120],
  ]);
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
