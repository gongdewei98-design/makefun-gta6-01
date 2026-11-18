// Saving to localStorage: money, finished missions and where Mara stands.
// Nothing leaves the browser. A corrupt or missing save simply starts fresh.

import { SAVE_KEY } from './config.js';

export function saveGame(world) {
  try {
    const data = {
      version: 1,
      money: Math.floor(world.player.money),
      missionsDone: world.missionsDone,
      player: { x: Math.round(world.player.x), y: Math.round(world.player.y) },
      health: Math.round(world.player.health),
      stats: world.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function applySave(world, data) {
  world.player.money = data.money;
  world.missionsDone = [...data.missionsDone];
  world.player.x = data.player.x;
  world.player.y = data.player.y;
  world.player.health = data.health;
  if (data.stats) world.stats = { ...world.stats, ...data.stats };
  world.camera.x = data.player.x;
  world.camera.y = data.player.y;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Saving was never available; nothing to clear.
  }
}
