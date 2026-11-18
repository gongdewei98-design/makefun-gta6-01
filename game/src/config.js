// Solmar Bay — tuning and world constants.
// One place for every number that shapes how the city feels.

export const WORLD = {
  width: 3600,
  height: 2800,
  // Beach and water bands along the south edge.
  beachTop: 2480,
  waterTop: 2680,
};

export const ROADS = {
  // Vertical road centre lines (x) and horizontal ones (y).
  vertical: [300, 700, 1100, 1500, 1900, 2300, 2700, 3100],
  horizontal: [300, 700, 1100, 1500, 1900, 2300],
  width: 110,
  laneOffset: 28,
};

export const PLAYER = {
  walkSpeed: 230,
  sprintSpeed: 350,
  radius: 13,
  maxHealth: 100,
  // Health comes back slowly once the player has been safe for a while.
  regenDelay: 8,
  regenRate: 3,
  fireCooldown: 0.22,
  bulletSpeed: 900,
  bulletDamage: 34,
  meleeRange: 34,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 760,
  reverseMax: 180,
  // Top speed by body type, pixels per second.
  topSpeed: { sedan: 520, taxi: 500, van: 420, sports: 660, police: 580 },
  turnRate: 2.6,
  grip: 6.5,
  handbrakeGrip: 1.6,
  maxHealth: 100,
  stealRadius: 70,
};

export const TRAFFIC = {
  count: 26,
  cruiseSpeed: 230,
  spawnRadius: 1300,
  despawnRadius: 1700,
};

export const PEDS = {
  count: 48,
  walkSpeed: 70,
  fleeSpeed: 210,
  spawnRadius: 1100,
  despawnRadius: 1600,
};

export const POLICE = {
  // Police cars on the road per wanted star.
  carsPerStar: [0, 2, 3, 4, 5, 6],
  chaseSpeed: 560,
  spawnRadius: 900,
  bustRadius: 46,
  bustTime: 1.4,
  sightRange: 750,
  // Seconds out of sight before one star fades.
  decayDelay: 6,
  decayStep: 4,
  heatPerStar: 100,
};

export const WANTED = {
  stealCar: 100,
  hitPedestrian: 100,
  shoot: 55,
  killCop: 200,
  killPedestrian: 60,
  hitPoliceCar: 40,
};

export const MONEY = {
  start: 500,
  bustedLoss: 0.15,
  wastedLoss: 0.1,
  cashPickup: 75,
};

export const CAMERA = {
  zoom: 1,
  follow: 5,
  lookAhead: 0.35,
};

export const SAVE_KEY = 'solmar-bay-save-v1';

export const DISTRICTS = [
  { name: 'Marina District', x0: 0, y0: 0, x1: 1200, y1: 1400 },
  { name: 'Old Town', x0: 1200, y0: 0, x1: 2400, y1: 1400 },
  { name: 'Harbor East', x0: 2400, y0: 0, x1: 3600, y1: 1400 },
  { name: 'Palm Beach', x0: 0, y0: 1400, x1: 1800, y1: 2800 },
  { name: 'South Docks', x0: 1800, y0: 1400, x1: 3600, y1: 2800 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar Bay';
}

// Sun-soaked palette: warm sand, turquoise water, pastel buildings.
export const PALETTE = {
  ground: '#c9b183',
  grass: '#8fae5d',
  sand: '#ecd9a0',
  water: '#2fa8b8',
  waterDeep: '#1d7f9e',
  road: '#4a4a52',
  roadEdge: '#3a3a42',
  sidewalk: '#b8b2a4',
  dash: '#e8e0c8',
  building: ['#f2a65a', '#7fb5b5', '#e8837a', '#f4e3c1', '#9db8d2', '#d9a5c0', '#a8c686', '#f0c75e'],
  roof: ['#b5543f', '#5d7d8c', '#8c5a6b', '#7a6a4f', '#4f6d8c', '#6b8e6b', '#a08050', '#7d6a8c'],
  palmTrunk: '#7a5a38',
  palmLeaf: '#3f8f4f',
  treeLeaf: '#5d9c4f',
};
