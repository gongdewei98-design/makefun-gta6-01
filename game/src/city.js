// Solmar Bay itself: a seeded grid city with a beach, a harbor and a downtown.
// Generation is deterministic for a seed, so the map is the same every visit
// and every screenshot. Roads are the skeleton; blocks hold buildings, parks
// and parking lots; palms line the beach road.

import { PALETTE, ROADS, WORLD } from './config.js';
import { Rng } from './random.js';

const ROAD_HALF = ROADS.width / 2;
const SIDEWALK = 14;

// Named places missions and the HUD point at. All sit on roads, so they are drivable.
export const PLACES = {
  rosaHome: { x: 700, y: 700, label: "Rosa's apartment" },
  cafeLumen: { x: 1500, y: 1100, label: 'Café Lumen' },
  marinaParking: { x: 1100, y: 2300, label: 'Marina parking' },
  raysGarage: { x: 2300, y: 1900, label: "Ray's garage" },
  harbor: { x: 3100, y: 2300, label: 'South Docks' },
  safehouse: { x: 300, y: 300, label: 'Safehouse' },
  cityHall: { x: 1900, y: 700, label: 'City Hall' },
  airport: { x: 3100, y: 300, label: 'Solmar Airfield' },
  hospital: { x: 700, y: 1500, label: 'Bay General Hospital' },
  policeStation: { x: 1500, y: 300, label: 'Central Precinct' },
  beachPier: { x: 1900, y: 2520, label: 'Pier' },
  spawn: { x: 1500, y: 1500, label: 'Old Town' },
};

function blockRanges(lines, limit) {
  const edges = [0, ...lines, limit];
  const ranges = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i] === 0 ? 24 : edges[i] + ROAD_HALF + SIDEWALK;
    const b = edges[i + 1] === limit ? limit - 24 : edges[i + 1] - ROAD_HALF - SIDEWALK;
    if (b - a > 90) ranges.push([a, b]);
  }
  return ranges;
}

export function generateCity(seed) {
  const rng = new Rng(seed);
  const buildings = [];
  const parks = [];
  const parkingLots = [];
  const parkingSpots = [];
  const trees = [];
  const lamps = [];
  const cashSpots = [];
  const healthSpots = [];

  const xs = blockRanges(ROADS.vertical, WORLD.width);
  const ys = blockRanges(ROADS.horizontal, WORLD.height);
  // The strip below the last horizontal road is beach, not blocks.
  const beachYs = ys.filter(([a]) => a < WORLD.beachTop - 60);

  for (const [x0, x1] of xs) {
    for (const [y0, y1] of beachYs) {
      const w = x1 - x0;
      const h = y1 - y0;
      const roll = rng.next();
      if (roll < 0.62) {
        // Buildings: one or two per block, split along the long side.
        const split = w > h ? 'x' : 'y';
        const count = rng.chance(0.45) ? 2 : 1;
        for (let i = 0; i < count; i++) {
          let bx0 = x0;
          let by0 = y0;
          let bx1 = x1;
          let by1 = y1;
          if (count === 2) {
            if (split === 'x') {
              const mid = x0 + w * rng.range(0.42, 0.58);
              if (i === 0) bx1 = mid - 8; else bx0 = mid + 8;
            } else {
              const mid = y0 + h * rng.range(0.42, 0.58);
              if (i === 0) by1 = mid - 8; else by0 = mid + 8;
            }
          }
          const inset = rng.range(6, 18);
          const building = {
            x: bx0 + inset,
            y: by0 + inset,
            w: bx1 - bx0 - inset * 2,
            h: by1 - by0 - inset * 2,
            color: rng.pick(PALETTE.building),
            roof: rng.pick(PALETTE.roof),
            floors: rng.int(1, 4),
            seed: rng.int(0, 9999),
          };
          if (building.w > 40 && building.h > 40) buildings.push(building);
        }
      } else if (roll < 0.78) {
        parks.push({ x: x0, y: y0, w, h });
        const n = rng.int(4, 9);
        for (let i = 0; i < n; i++) {
          trees.push({
            x: rng.range(x0 + 14, x1 - 14),
            y: rng.range(y0 + 14, y1 - 14),
            palm: rng.chance(0.4),
            size: rng.range(9, 15),
          });
        }
      } else if (roll < 0.9) {
        parkingLots.push({ x: x0, y: y0, w, h });
        const cols = Math.floor((w - 20) / 46);
        const rows = Math.floor((h - 20) / 40);
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            if (rng.chance(0.55)) {
              parkingSpots.push({
                x: x0 + 24 + cx * 46,
                y: y0 + 22 + cy * 40,
                angle: rng.chance(0.5) ? 0 : Math.PI,
              });
            }
          }
        }
      } else {
        // Plaza: paved, with lamps and a couple of trees.
        for (let i = 0; i < 4; i++) {
          lamps.push({
            x: rng.range(x0 + 10, x1 - 10),
            y: rng.range(y0 + 10, y1 - 10),
          });
        }
        trees.push({
          x: (x0 + x1) / 2 + rng.range(-30, 30),
          y: (y0 + y1) / 2 + rng.range(-30, 30),
          palm: true,
          size: 13,
        });
      }
    }
  }

  // Palms along the beach road and the pier walk.
  for (let x = 120; x < WORLD.width - 100; x += 90) {
    if (rng.chance(0.8)) {
      trees.push({ x: x + rng.range(-12, 12), y: 2420 + rng.range(-6, 6), palm: true, size: rng.range(11, 15) });
    }
  }
  // Street trees and lamps along the avenues.
  for (const vx of ROADS.vertical) {
    for (let y = 140; y < WORLD.beachTop - 80; y += 220) {
      if (rng.chance(0.5)) trees.push({ x: vx + ROAD_HALF + 8, y, palm: rng.chance(0.6), size: rng.range(8, 12) });
      if (rng.chance(0.6)) lamps.push({ x: vx - ROAD_HALF - 8, y: y + 110 });
    }
  }

  // Cash pickups on sidewalks, health packs near the hospital and clinics.
  const cashRng = new Rng(seed ^ 0x9e3779b9);
  for (let i = 0; i < 14; i++) {
    const vx = cashRng.pick(ROADS.vertical);
    const hy = cashRng.pick(ROADS.horizontal);
    cashSpots.push({ x: vx + ROAD_HALF + 20, y: hy + cashRng.range(-120, 120) });
  }
  healthSpots.push(
    { x: PLACES.hospital.x + 80, y: PLACES.hospital.y + 30 },
    { x: 1900, y: 1900 },
    { x: 300, y: 1900 },
    { x: 2700, y: 1100 },
  );

  return {
    seed,
    buildings,
    parks,
    parkingLots,
    parkingSpots,
    trees,
    lamps,
    cashSpots,
    healthSpots,
    width: WORLD.width,
    height: WORLD.height,
  };
}

export function isOnRoad(x, y) {
  for (const vx of ROADS.vertical) {
    if (Math.abs(x - vx) <= ROAD_HALF && y >= 0 && y <= WORLD.beachTop) return true;
  }
  for (const hy of ROADS.horizontal) {
    if (Math.abs(y - hy) <= ROAD_HALF && x >= 0 && x <= WORLD.width) return true;
  }
  return false;
}

export function inWater(x, y) {
  return y >= WORLD.waterTop;
}

export function onSand(x, y) {
  return y >= WORLD.beachTop && y < WORLD.waterTop;
}

/** Push a circle out of every building it overlaps; returns true when moved. */
export function resolveBuildingCollisions(city, body, radius) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * radius;
        body.y = cy + (dy / d) * radius;
      } else {
        // Centre inside the building: push out along the smallest overlap.
        const left = body.x - b.x;
        const right = b.x + b.w - body.x;
        const top = body.y - b.y;
        const bottom = b.y + b.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) body.x = b.x - radius;
        else if (m === right) body.x = b.x + b.w + radius;
        else if (m === top) body.y = b.y - radius;
        else body.y = b.y + b.h + radius;
      }
      hit = true;
    }
  }
  return hit;
}

export function pointInBuilding(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const vx of ROADS.vertical) {
    const d = Math.abs(x - vx);
    if (d < bestD) {
      bestD = d;
      best = { x: vx, y: Math.max(60, Math.min(y, WORLD.beachTop - 60)) };
    }
  }
  for (const hy of ROADS.horizontal) {
    const d = Math.abs(y - hy);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.max(60, Math.min(x, WORLD.width - 60)), y: hy };
    }
  }
  return best;
}

export function randomRoadPoint(rng, cx, cy, minR, maxR) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng.chance(0.5);
    let x;
    let y;
    if (vertical) {
      x = rng.pick(ROADS.vertical);
      y = rng.range(80, WORLD.beachTop - 80);
    } else {
      x = rng.range(80, WORLD.width - 80);
      y = rng.pick(ROADS.horizontal);
    }
    const d = Math.hypot(x - cx, y - cy);
    if (d >= minR && d <= maxR) return { x, y, vertical };
  }
  const p = nearestRoadPoint(cx + maxR * 0.7, cy);
  return { x: p.x, y: p.y, vertical: true };
}
