// The story: Mara Vega, a driver for hire in Solmar Bay, works her way up
// from fares to favours. Five missions, each a short chain of objectives with
// a timer or a fight in it. A mission starts when Mara reaches its marker.

import { PLACES } from './city.js';
import { clearWanted, setWanted } from './police.js';
import { createCar } from './vehicles.js';
import { enemiesAlive, spawnGang } from './combat.js';

export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    start: 'rosaHome',
    reward: 400,
    brief: 'Rosa needs a lift across town and pays in cash. Easy money — if you hurry.',
    steps: [
      { text: 'Pick up Rosa at her apartment', type: 'goto', place: 'rosaHome', radius: 60 },
      { text: 'Drive Rosa to Café Lumen', type: 'goto', place: 'cafeLumen', radius: 70, timer: 90 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    start: 'marinaParking',
    reward: 700,
    brief: 'Ray wants the yellow Comet from the marina lot. Take it. Quietly is optional.',
    steps: [
      { text: 'Steal the yellow Comet at the marina', type: 'steal', place: 'marinaParking', radius: 70 },
      { text: 'Deliver the Comet to Ray\u2019s garage', type: 'deliver', place: 'raysGarage', radius: 70 },
    ],
  },
  {
    id: 'harbor-heat',
    title: 'Harbor Heat',
    start: 'harbor',
    reward: 900,
    brief: 'The Dockside Kings moved into the South Docks. Move them out.',
    steps: [
      { text: 'Clear the Dockside Kings from the harbor', type: 'eliminate', place: 'harbor', count: 5 },
    ],
  },
  {
    id: 'long-way-home',
    title: 'The Long Way Home',
    start: 'policeStation',
    reward: 1000,
    brief: 'You saw too much at the precinct. Three stars, one safehouse, two minutes.',
    steps: [
      { text: 'Lose the cops and reach the safehouse', type: 'goto', place: 'safehouse', radius: 70, timer: 120 },
    ],
  },
  {
    id: 'bay-lights',
    title: 'Bay Lights',
    start: 'cityHall',
    reward: 1500,
    brief: 'One VIP, one airfield, half the city\u2019s police in between. The big one.',
    steps: [
      { text: 'Pick up the VIP at City Hall', type: 'goto', place: 'cityHall', radius: 60 },
      { text: 'Get the VIP to Solmar Airfield', type: 'goto', place: 'airport', radius: 80, timer: 150 },
    ],
  },
];

export function nextMissionDef(world) {
  return MISSIONS.find((m) => !world.missionsDone.includes(m.id)) || null;
}

export function missionStartPlace(world) {
  const def = nextMissionDef(world);
  return def ? PLACES[def.start] : null;
}

export function startMission(world, def) {
  world.mission = {
    def,
    step: 0,
    timer: 0,
    targetCar: null,
    startedAt: world.time,
  };
  world.notify(def.title.toUpperCase(), def.brief, 4);
  world.audio.missionStart();
  if (def.id === 'hot-wheels') {
    // The prize: a yellow sports car waiting in the marina lot.
    const spot = PLACES.marinaParking;
    const car = createCar(spot.x + 30, spot.y + 40, Math.PI / 2, 'sports', 'parked');
    car.color = '#f2c230';
    world.cars.push(car);
    world.mission.targetCar = car;
  }
  if (def.id === 'harbor-heat') {
    spawnGang(world, PLACES.harbor.x, PLACES.harbor.y, 5);
  }
  if (def.id === 'long-way-home') {
    setWanted(world, 3);
  }
  beginStep(world);
}

function beginStep(world) {
  const mission = world.mission;
  const step = mission.def.steps[mission.step];
  mission.timer = step.timer ?? 0;
  if (mission.def.id === 'bay-lights' && mission.step === 1) {
    setWanted(world, 3);
    world.notify('THEY KNOW', 'The whole precinct is coming. Drive!', 2.6);
  }
}

function advanceStep(world) {
  const mission = world.mission;
  mission.step += 1;
  if (mission.step >= mission.def.steps.length) {
    completeMission(world);
  } else {
    beginStep(world);
    const step = mission.def.steps[mission.step];
    world.notify('OBJECTIVE', step.text, 2.6);
  }
}

function completeMission(world) {
  const mission = world.mission;
  world.player.money += mission.def.reward;
  world.missionsDone.push(mission.def.id);
  world.audio.missionComplete();
  world.notify('MISSION COMPLETE', `${mission.def.title} — +$${mission.def.reward}`, 3.5);
  if (mission.def.id === 'long-way-home' || mission.def.id === 'bay-lights') {
    clearWanted(world);
  }
  world.mission = null;
  world.stats.missionsDone += 1;
  if (world.saveGame) world.saveGame();
  if (world.missionsDone.length >= MISSIONS.length) {
    world.notify('YOU OWN SOLMAR BAY', 'Every job done. The city is yours now.', 6);
  }
}

export function failMission(world, reason) {
  if (!world.mission) return;
  world.audio.missionFailed();
  world.notify('MISSION FAILED', reason, 3);
  // The gang leaves; the Comet stays where it is.
  world.enemies.length = 0;
  world.mission = null;
}

export function tryStartMission(world) {
  if (world.mission || world.mode !== 'playing') return;
  const def = nextMissionDef(world);
  if (!def) return;
  const place = PLACES[def.start];
  const player = world.player;
  const d = Math.hypot(player.x - place.x, player.y - place.y);
  if (d < 70) startMission(world, def);
}

export function updateMission(world, dt) {
  const mission = world.mission;
  if (!mission) return;
  const step = mission.def.steps[mission.step];
  const player = world.player;

  if (step.timer) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      failMission(world, 'Out of time');
      return;
    }
  }

  if (step.type === 'goto' || step.type === 'deliver') {
    const place = PLACES[step.place];
    const d = Math.hypot(player.x - place.x, player.y - place.y);
    if (step.type === 'deliver') {
      if (mission.targetCar && mission.targetCar.wrecked) {
        failMission(world, 'The Comet is wrecked');
        return;
      }
      if (d < step.radius && player.car === mission.targetCar) advanceStep(world);
    } else if (d < step.radius) {
      advanceStep(world);
    }
  } else if (step.type === 'steal') {
    if (player.car === mission.targetCar) {
      setWanted(world, 2);
      advanceStep(world);
    }
  } else if (step.type === 'eliminate') {
    if (enemiesAlive(world) === 0) advanceStep(world);
  }
}

/** What the HUD shows: text, target position, distance and time left. */
export function currentObjective(world) {
  if (world.mission) {
    const step = world.mission.def.steps[world.mission.step];
    const place = PLACES[step.place];
    const d = place ? Math.round(Math.hypot(world.player.x - place.x, world.player.y - place.y)) : 0;
    return {
      title: world.mission.def.title,
      text: step.text,
      target: place ? { x: place.x, y: place.y } : null,
      distance: d,
      timer: step.timer ? Math.max(0, world.mission.timer) : null,
      active: true,
    };
  }
  const def = nextMissionDef(world);
  if (!def) {
    return { title: 'Solmar Bay', text: 'All missions complete — the city is yours', target: null, distance: 0, timer: null, active: false };
  }
  const place = PLACES[def.start];
  return {
    title: def.title,
    text: `Go to the marker to start: ${def.title}`,
    target: { x: place.x, y: place.y },
    distance: Math.round(Math.hypot(world.player.x - place.x, world.player.y - place.y)),
    timer: null,
    active: false,
  };
}
