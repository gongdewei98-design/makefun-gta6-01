// Solmar Bay — boot and the one loop. The world is created once from a seed,
// then the loop advances it in fixed 1/60 s steps and paints it. Modes:
// menu (a slow camera drift over the living city), playing, paused, busted,
// wasted, and shot (a staged scene for screenshots).
//
// ?seed=N fixes the city. ?shot=chase|street|drive|mission stages that scene,
// runs it forward, and sets window.__shotReady when the frame is ready.

import { CAMERA, MONEY, PLAYER, SAVE_KEY } from './config.js';
import { Rng } from './random.js';
import { generateCity, PLACES } from './city.js';
import { createEffects, updateEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput, PRESS_CONFIRM, PRESS_HORN, PRESS_MUTE, PRESS_PAUSE } from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createPlayer, handlePlayerPresses, updatePlayer } from './player.js';
import { maintainTraffic, nearestStealableCar, spawnParkedCars, updateVehicles } from './vehicles.js';
import { maintainPeds, updatePeds } from './pedestrians.js';
import { clearWanted, nearestPoliceDistance, updatePolice } from './police.js';
import { updateBullets, updateEnemies } from './combat.js';
import { tryStartMission, updateMission } from './missions.js';
import { applySave, clearSave, hasSave, loadSave, saveGame } from './save.js';
import { autopilot, shotDuration, stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const DEFAULT_SEED = 20261118;

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const hud = createHud(document);
const audio = createAudio();

function freshStats() {
  return { carsStolen: 0, pedsHit: 0, shotsFired: 0, gangDown: 0, missionsDone: 0 };
}

function createWorld() {
  const rng = new Rng(seed);
  const city = generateCity(seed);
  const fx = createEffects();
  const player = createPlayer(PLACES.spawn.x, PLACES.spawn.y);
  const world = {
    seed,
    rng,
    city,
    fx,
    audio,
    player,
    camera: { x: PLACES.spawn.x, y: PLACES.spawn.y, zoom: CAMERA.zoom },
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    pickups: [],
    pickupRespawns: [],
    wanted: 0,
    heat: 0,
    bustProgress: 0,
    lastSeenAt: -99,
    lastCrimeAt: -99,
    decayTimer: 0,
    lastShotAt: null,
    lastShotX: 0,
    lastShotY: 0,
    mission: null,
    missionsDone: [],
    time: 0,
    mode: shotName ? 'shot' : 'menu',
    nearCar: null,
    hornPressed: false,
    stats: freshStats(),
    autosaveTimer: 0,
    menuDrift: 0,
    notify(title, sub, dur) {
      hud.showMessage(title, sub, dur);
    },
    saveGame() {
      saveGame(world);
    },
    screenToWorld(x, y) {
      return renderer.screenToWorld(world, x, y);
    },
  };
  for (const s of city.cashSpots) {
    world.pickups.push({ kind: 'cash', x: s.x, y: s.y, amount: MONEY.cashPickup });
  }
  for (const s of city.healthSpots) {
    world.pickups.push({ kind: 'health', x: s.x, y: s.y, amount: 50 });
  }
  spawnParkedCars(world);
  maintainTraffic(world);
  maintainPeds(world);
  return world;
}

let world = createWorld();
let shotTime = 0;
let shotReady = false;

function update(world, dt) {
  world.time += dt;
  const playing = world.mode === 'playing' || world.mode === 'shot';

  maintainTraffic(world);
  maintainPeds(world);
  updateVehicles(world, dt);
  updatePeds(world, dt);
  updateEffects(world.fx, dt);
  if (!playing) return;

  if (world.mode === 'shot') {
    autopilot(world, dt);
  } else {
    updatePlayer(world, input, dt);
  }
  updatePolice(world, dt);
  updateBullets(world, dt);
  updateEnemies(world, dt);
  updateMission(world, dt);
  tryStartMission(world);

  world.nearCar = world.player.onFoot
    ? nearestStealableCar(world, world.player.x, world.player.y)
    : null;

  // Engine and siren follow the action.
  const car = world.player.car;
  audio.engine(car ? Math.abs(car.speed) / 660 : 0, Boolean(car));
  const policeDist = nearestPoliceDistance(world);
  audio.siren(dt, policeDist < 900 ? 1 - policeDist / 900 : 0);

  // Busted or wasted ends the run.
  if (world.player.dead && world.mode === 'playing') {
    world.mode = 'wasted';
    showEnd('WASTED', 'The hospital patched you up — and sent the bill.');
    return;
  }
  if (world.mode === 'busted') {
    showEnd('BUSTED', 'The precinct kept a cut of your cash as a "fine".');
    return;
  }

  // Autosave while playing.
  world.autosaveTimer += dt;
  if (world.autosaveTimer > 20) {
    world.autosaveTimer = 0;
    saveGame(world);
  }
}

function resetWorld() {
  world = createWorld();
  shotTime = 0;
  shotReady = false;
}

// --- Screens (DOM overlays) ---

const screens = {
  menu: document.getElementById('screen-menu'),
  pause: document.getElementById('screen-pause'),
  end: document.getElementById('screen-end'),
  help: document.getElementById('screen-help'),
  hud: document.getElementById('hud'),
};

function showOnly(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (!el) continue;
    el.classList.toggle('show', key === name || (name === 'playing' && key === 'hud'));
  }
  if (name === 'menu') refreshMenu();
}

function refreshMenu() {
  const save = loadSave();
  const continueBtn = document.getElementById('btn-continue');
  const progress = document.getElementById('menu-progress');
  if (save) {
    continueBtn.style.display = '';
    progress.textContent = `Saved game — $${save.money.toLocaleString('en-US')} · ${save.missionsDone.length}/5 missions`;
  } else {
    continueBtn.style.display = 'none';
    progress.textContent = 'No saved game yet — the city is waiting.';
  }
}

function startNewGame() {
  clearSave();
  resetWorld();
  world.mode = 'playing';
  showOnly('playing');
  audio.unlock();
  audio.startMusic();
  hud.showHint('WASD drive / walk · E steal car · Mouse aim, click shoot · M mute', 9);
  world.notify('SOLMAR BAY', 'Mara Vega, driver for hire. Find the yellow marker.', 4);
}

function continueGame() {
  const save = loadSave();
  resetWorld();
  if (save) applySave(world, save);
  world.mode = 'playing';
  showOnly('playing');
  audio.unlock();
  audio.startMusic();
  hud.showHint('WASD drive / walk · E steal car · Mouse aim, click shoot · M mute', 6);
}

function showEnd(title, sub) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-sub').textContent = sub;
  audio.busted();
  showOnly('end');
}

function respawn() {
  const player = world.player;
  const busted = world.mode === 'busted';
  const loss = busted ? MONEY.bustedLoss : MONEY.wastedLoss;
  player.money = Math.max(0, Math.floor(player.money * (1 - loss)));
  const spot = busted ? PLACES.policeStation : PLACES.hospital;
  if (player.car) {
    player.car.driver = 'parked';
    player.car = null;
  }
  player.onFoot = true;
  player.dead = false;
  player.health = PLAYER.maxHealth;
  player.x = spot.x;
  player.y = spot.y;
  player.vx = 0;
  player.vy = 0;
  world.camera.x = spot.x;
  world.camera.y = spot.y;
  world.cops.length = 0;
  world.enemies.length = 0;
  clearWanted(world);
  // Losing the run fails the active mission.
  if (world.mission) {
    world.mission = null;
    world.notify('MISSION FAILED', busted ? 'Busted mid-job.' : 'Wasted mid-job.', 2.6);
  }
  world.mode = 'playing';
  showOnly('playing');
  saveGame(world);
}

function pauseGame() {
  if (world.mode !== 'playing') return;
  world.mode = 'paused';
  showOnly('pause');
  saveGame(world);
}

function resumeGame() {
  if (world.mode !== 'paused') return;
  world.mode = 'playing';
  showOnly('playing');
}

function quitToMenu() {
  saveGame(world);
  world.mode = 'menu';
  showOnly('menu');
}

function wireButton(id, fn) {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      fn();
    });
  }
}

wireButton('btn-new', startNewGame);
wireButton('btn-continue', continueGame);
wireButton('btn-help', () => screens.help.classList.add('show'));
wireButton('btn-help-close', () => screens.help.classList.remove('show'));
wireButton('btn-resume', resumeGame);
wireButton('btn-restart', startNewGame);
wireButton('btn-quit', quitToMenu);
wireButton('btn-respawn', respawn);

// First gesture anywhere unlocks sound.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// --- Shot mode ---

if (shotName) {
  if (stageShot(world, shotName)) {
    showOnly('playing');
    status.textContent = `Screenshot scene: ${shotName}`;
  } else {
    world.mode = 'menu';
    showOnly('menu');
  }
} else {
  showOnly('menu');
}

// --- The loop ---

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let frameDt = (now - last) / 1000;
  last = now;
  if (frameDt > MAX_FRAME) frameDt = MAX_FRAME;

  const presses = input.takePresses();
  if (presses & PRESS_MUTE) audio.setMuted(!audio.muted);
  if (presses & PRESS_HORN) world.hornPressed = true;
  if (presses & PRESS_PAUSE) {
    if (world.mode === 'playing') pauseGame();
    else if (world.mode === 'paused') resumeGame();
  }
  if (presses & PRESS_CONFIRM) {
    if (world.mode === 'menu') {
      if (hasSave()) continueGame();
      else startNewGame();
    } else if (world.mode === 'busted' || world.mode === 'wasted') {
      respawn();
    }
  }
  if (world.mode === 'playing') handlePlayerPresses(world, presses);

  if (world.mode === 'playing' || (world.mode === 'shot' && !shotReady)) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update(world, STEP);
      accumulator -= STEP;
      steps++;
    }
    if (world.mode === 'shot' && !shotReady) {
      shotTime += frameDt;
      if (shotTime >= shotDuration(shotName)) {
        shotReady = true;
        window.__shotReady = true;
      }
    }
  } else if (world.mode === 'menu') {
    // The city stays alive behind the title: traffic and pedestrians move,
    // and the camera drifts slowly over downtown.
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update(world, STEP);
      accumulator -= STEP;
      steps++;
    }
    world.menuDrift += frameDt;
    const t = world.menuDrift * 0.05;
    world.camera.x = 1800 + Math.cos(t) * 500;
    world.camera.y = 1400 + Math.sin(t * 0.7) * 300;
  } else {
    // Paused, busted or wasted: the world holds still.
    renderer.updateCamera(world, frameDt);
  }

  if (world.mode === 'playing' || world.mode === 'shot') {
    renderer.updateCamera(world, frameDt);
  }
  renderer.render(world);
  if (world.mode === 'playing' || world.mode === 'shot') {
    hud.update(world);
  }
}

requestAnimationFrame(frame);
