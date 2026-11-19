// Drawing only: the camera, the city, and everything in it. The world is
// painted in layers — ground, roads, buildings, then everything that moves —
// with soft shadows and a warm palette so the city reads as one sun-soaked
// place. Only what the camera sees is drawn.

import { CAMERA, PALETTE, ROADS, WORLD } from './config.js';
import { PLACES } from './city.js';
import { clamp, lerp } from './random.js';
import { drawParticles, drawSkids, shakeOffset } from './effects.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './pedestrians.js';
import { drawCop } from './police.js';
import { drawBullets, drawEnemy } from './combat.js';
import { drawPlayer } from './player.js';
import { currentObjective } from './missions.js';

// Deterministic 0..1 value from any integer seed. Every step is kept unsigned
// (>>> 0): a signed hash once fed a negative into a placement and crashed the
// umbrella render, so no hash here is ever allowed to go negative.
function hash01(n) {
  let h = (n >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }

  function updateCamera(world, dt) {
    const cam = world.camera;
    const player = world.player;
    const lookX = player.x + (player.vx || 0) * CAMERA.lookAhead;
    const lookY = player.y + (player.vy || 0) * CAMERA.lookAhead;
    const t = 1 - Math.exp(-CAMERA.follow * dt);
    cam.x = lerp(cam.x, lookX, t);
    cam.y = lerp(cam.y, lookY, t);
    const halfW = viewW / 2 / cam.zoom;
    const halfH = viewH / 2 / cam.zoom;
    cam.x = clamp(cam.x, halfW - 100, WORLD.width - halfW + 100);
    cam.y = clamp(cam.y, halfH - 100, WORLD.height - halfH + 100);
  }

  function screenToWorld(world, sx, sy) {
    const cam = world.camera;
    return {
      x: (sx - viewW / 2) / cam.zoom + cam.x,
      y: (sy - viewH / 2) / cam.zoom + cam.y,
    };
  }

  function visibleRect(world) {
    const cam = world.camera;
    const halfW = viewW / 2 / cam.zoom + 80;
    const halfH = viewH / 2 / cam.zoom + 80;
    return { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH };
  }

  function drawGround(world, view) {
    // Base ground.
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    // Parks: grass with dirt path crosses, ponds and flower beds.
    for (const p of world.city.parks) {
      if (p.x > view.x1 || p.x + p.w < view.x0 || p.y > view.y1 || p.y + p.h < view.y0) continue;
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      // Dirt paths crossing the park, plus to plus.
      ctx.fillStyle = '#c9b183';
      ctx.fillRect(p.x + p.w / 2 - 7, p.y + 4, 14, p.h - 8);
      ctx.fillRect(p.x + 4, p.y + p.h / 2 - 7, p.w - 8, 14);
      const seed = Math.floor(p.x) * 31 + Math.floor(p.y);
      // A pond in about half the parks, tucked into a seeded quadrant.
      if (hash01(seed + 5) < 0.5) {
        const px = p.x + p.w * (0.24 + hash01(seed + 6) * 0.5);
        const py = p.y + p.h * (0.24 + hash01(seed + 7) * 0.5);
        ctx.fillStyle = '#e8ddc8';
        ctx.beginPath();
        ctx.ellipse(px, py, 34, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6fb3c9';
        ctx.beginPath();
        ctx.ellipse(px, py, 29, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(px - 8, py - 5, 10, 5, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Flower beds: small clusters of bright dots at seeded spots.
      const bedColors = ['#e86a92', '#f2c230', '#c86dd7', '#ff8a5c'];
      for (let i = 0; i < 3; i++) {
        const bx = p.x + 18 + hash01(seed + 11 + i * 3) * (p.w - 36);
        const by = p.y + 18 + hash01(seed + 12 + i * 3) * (p.h - 36);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(bx, by, 16, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let j = 0; j < 7; j++) {
          ctx.fillStyle = bedColors[Math.floor(hash01(seed + 20 + i * 10 + j) * bedColors.length)];
          ctx.beginPath();
          ctx.arc(
            bx - 10 + hash01(seed + 30 + i * 10 + j) * 20,
            by - 6 + hash01(seed + 40 + i * 10 + j) * 12,
            2.6, 0, Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }
    // Parking lots.
    for (const p of world.city.parkingLots) {
      if (p.x > view.x1 || p.x + p.w < view.x0 || p.y > view.y1 || p.y + p.h < view.y0) continue;
      ctx.fillStyle = '#5a5a60';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(232,224,200,0.6)';
      ctx.lineWidth = 2;
      for (let x = p.x + 24; x < p.x + p.w - 10; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, p.y + 10);
        ctx.lineTo(x, p.y + p.h - 10);
        ctx.stroke();
      }
    }
    // Beach and water.
    if (view.y1 > WORLD.beachTop) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(view.x0, WORLD.beachTop, view.x1 - view.x0, WORLD.waterTop - WORLD.beachTop);
      // Wet sand near the waterline.
      ctx.fillStyle = '#d9c184';
      ctx.fillRect(view.x0, WORLD.waterTop - 14, view.x1 - view.x0, 14);
      // Beach umbrellas and towels: seeded columns along the sand, so the
      // same beach shows up on every load. All placements come from hash01,
      // which never returns a negative.
      const umbrellaColors = [['#e86a5c', '#f5efe2'], ['#3d7dd9', '#f5efe2'], ['#f2c230', '#e86a5c'], ['#4ecdc4', '#f5efe2']];
      const towelColors = ['#e86a92', '#3d7dd9', '#f2c230', '#4ecdc4', '#c86dd7'];
      for (let i = 0; i * 130 + 90 < WORLD.width - 60; i++) {
        const present = hash01(i * 7 + 11);
        if (present >= 0.62) continue;
        const ux = 90 + i * 130 + (hash01(i * 13 + 3) - 0.5) * 44;
        if (ux < view.x0 - 40 || ux > view.x1 + 40) continue;
        const uy = WORLD.beachTop + 34 + hash01(i * 17 + 5) * 110;
        const pair = umbrellaColors[Math.floor(hash01(i * 19 + 7) * umbrellaColors.length)];
        // Shadow, then the segmented canopy: eight wedges, alternating colours.
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(ux + 8, uy + 10, 17, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let w = 0; w < 8; w++) {
          ctx.fillStyle = pair[w % 2];
          ctx.beginPath();
          ctx.moveTo(ux, uy);
          ctx.arc(ux, uy, 16, (w / 8) * Math.PI * 2, ((w + 1) / 8) * Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(ux, uy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // A towel beside it, with a stripe.
        const tx = ux + 20 + hash01(i * 23 + 9) * 14;
        const ty = uy + 12 + (hash01(i * 29 + 13) - 0.5) * 18;
        ctx.fillStyle = towelColors[Math.floor(hash01(i * 31 + 17) * towelColors.length)];
        ctx.fillRect(tx, ty, 24, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(tx + 4, ty, 4, 11);
      }
    }
    if (view.y1 > WORLD.waterTop) {
      const grad = ctx.createLinearGradient(0, WORLD.waterTop, 0, WORLD.height);
      grad.addColorStop(0, PALETTE.water);
      grad.addColorStop(1, PALETTE.waterDeep);
      ctx.fillStyle = grad;
      ctx.fillRect(view.x0, WORLD.waterTop, view.x1 - view.x0, WORLD.height - WORLD.waterTop);
      // Rolling wave lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const wy = WORLD.waterTop + 26 + i * 34;
        ctx.beginPath();
        for (let x = view.x0; x < view.x1; x += 24) {
          const y = wy + Math.sin(x * 0.01 + world.time * 1.4 + i * 1.7) * 4;
          if (x === view.x0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // Foam at the shoreline.
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let x = Math.floor(view.x0 / 46) * 46; x < view.x1; x += 46) {
        const wobble = Math.sin(x * 0.05 + world.time * 2) * 3;
        ctx.beginPath();
        ctx.ellipse(x + 20, WORLD.waterTop + 2 + wobble, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRoads(world, view) {
    const half = ROADS.width / 2;
    // Sidewalks first (a pale border around every road), then asphalt.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const vx of ROADS.vertical) {
      if (vx + half + 14 < view.x0 || vx - half - 14 > view.x1) continue;
      ctx.fillRect(vx - half - 14, 0, ROADS.width + 28, WORLD.beachTop + 14);
    }
    for (const hy of ROADS.horizontal) {
      if (hy + half + 14 < view.y0 || hy - half - 14 > view.y1) continue;
      ctx.fillRect(0, hy - half - 14, WORLD.width, ROADS.width + 28);
    }
    ctx.fillStyle = PALETTE.road;
    for (const vx of ROADS.vertical) {
      if (vx + half < view.x0 || vx - half > view.x1) continue;
      ctx.fillRect(vx - half, 0, ROADS.width, WORLD.beachTop);
    }
    for (const hy of ROADS.horizontal) {
      if (hy + half < view.y0 || hy - half > view.y1) continue;
      ctx.fillRect(0, hy - half, WORLD.width, ROADS.width);
    }
    // Zebra crosswalks at every intersection, on all four arms. The stripes
    // run with the traffic flow: vertical bars across a vertical road's arms,
    // horizontal bars across a horizontal road's.
    ctx.fillStyle = 'rgba(240,236,220,0.85)';
    for (const vx of ROADS.vertical) {
      for (const hy of ROADS.horizontal) {
        if (vx < view.x0 - half - 30 || vx > view.x1 + half + 30) continue;
        if (hy < view.y0 - half - 30 || hy > view.y1 + half + 30) continue;
        // North and south arms of the vertical road.
        for (let x = vx - half + 8; x < vx + half - 8; x += 15) {
          ctx.fillRect(x, hy - half - 18, 8, 12);
          ctx.fillRect(x, hy + half + 6, 8, 12);
        }
        // West and east arms of the horizontal road.
        for (let y = hy - half + 8; y < hy + half - 8; y += 15) {
          ctx.fillRect(vx - half - 18, y, 12, 8);
          ctx.fillRect(vx + half + 6, y, 12, 8);
        }
      }
    }
    // Centre dashes, broken at intersections.
    ctx.fillStyle = PALETTE.dash;
    for (const vx of ROADS.vertical) {
      if (vx < view.x0 || vx > view.x1) continue;
      for (let y = 20; y < WORLD.beachTop - 20; y += 44) {
        let inCrossing = false;
        for (const hy of ROADS.horizontal) {
          if (Math.abs(y - hy) < half + 12) {
            inCrossing = true;
            break;
          }
        }
        if (!inCrossing && y > view.y0 && y < view.y1) ctx.fillRect(vx - 2, y, 4, 22);
      }
    }
    for (const hy of ROADS.horizontal) {
      if (hy < view.y0 || hy > view.y1) continue;
      for (let x = 20; x < WORLD.width - 20; x += 44) {
        let inCrossing = false;
        for (const vx of ROADS.vertical) {
          if (Math.abs(x - vx) < half + 12) {
            inCrossing = true;
            break;
          }
        }
        if (!inCrossing && x > view.x0 && x < view.x1) ctx.fillRect(x, hy - 2, 22, 4);
      }
    }
  }

  function drawBuildings(world, view) {
    for (const b of world.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = 6 + b.floors * 3; // 9..18: taller blocks read taller.
      // Strong drop shadow to the south-east, sized by height.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + lift + 4, b.y + lift + 6, b.w, b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(b.x + lift + 9, b.y + lift + 11, b.w, b.h);
      // Wall face: the whole footprint.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // South and east side faces, darker, so the block reads as a solid.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift);
      ctx.fillRect(b.x + b.w - lift, b.y, lift, b.h);
      // Lit window strips on the side faces: warm rectangles, some dark.
      ctx.fillStyle = 'rgba(255,236,160,0.85)';
      const winH = Math.max(3, lift - 6);
      for (let wx = b.x + 10; wx < b.x + b.w - 10; wx += 22) {
        if (hash01(b.seed + Math.floor(wx)) < 0.6) {
          ctx.fillRect(wx, b.y + b.h - lift + 3, 10, winH);
        }
      }
      for (let wy = b.y + 10; wy < b.y + b.h - 10; wy += 22) {
        if (hash01(b.seed * 3 + Math.floor(wy)) < 0.6) {
          ctx.fillRect(b.x + b.w - lift + 3, wy, winH, 10);
        }
      }
      // Roof, offset toward the north-west so the south and east walls show
      // as the building's sides.
      const rx = b.x - lift;
      const ry = b.y - lift;
      ctx.fillStyle = b.roof;
      ctx.fillRect(rx, ry, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(rx, ry, b.w, 7);
      // Roof panel seams.
      ctx.strokeStyle = 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 2;
      for (let sx = rx + 26; sx < rx + b.w - 10; sx += 26) {
        ctx.beginPath();
        ctx.moveTo(sx, ry + 4);
        ctx.lineTo(sx, ry + b.h - 4);
        ctx.stroke();
      }
      for (let sy = ry + 26; sy < ry + b.h - 10; sy += 26) {
        ctx.beginPath();
        ctx.moveTo(rx + 4, sy);
        ctx.lineTo(rx + b.w - 4, sy);
        ctx.stroke();
      }
      if (b.w < 70 || b.h < 70) continue; // Small roofs stay plain.
      const s = b.seed;
      const innerX = rx + 10;
      const innerY = ry + 10;
      const innerW = b.w - 20;
      const innerH = b.h - 20;
      // A helipad on about one in four towers (3+ floors), centred.
      const hasPad = b.floors >= 3 && hash01(s + 77) < 0.25 && Math.min(b.w, b.h) > 120;
      if (hasPad) {
        const cx = rx + b.w / 2;
        const cy = ry + b.h / 2;
        const pr = Math.min(b.w, b.h) * 0.26;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(cx, cy, pr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, pr - 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const hw = pr * 0.28;
        const hh = pr * 0.62;
        ctx.fillRect(cx - hw, cy - hh, pr * 0.2, hh * 2);
        ctx.fillRect(cx + hw - pr * 0.2, cy - hh, pr * 0.2, hh * 2);
        ctx.fillRect(cx - hw, cy - pr * 0.1, hw * 2, pr * 0.2);
      }
      // AC units along the north edge: grey boxes with fan circles.
      const acCount = 1 + Math.floor(hash01(s + 1) * 3);
      for (let i = 0; i < acCount; i++) {
        const ax = innerX + 6 + hash01(s + 21 + i * 5) * Math.max(10, innerW - 30);
        const ay = innerY + 4 + hash01(s + 22 + i * 5) * 14;
        ctx.fillStyle = '#8d99ae';
        ctx.fillRect(ax, ay, 18, 13);
        ctx.fillStyle = '#5d6a7a';
        ctx.beginPath();
        ctx.arc(ax + 9, ay + 6.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c9d2dc';
        ctx.beginPath();
        ctx.arc(ax + 9, ay + 6.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      // Vents along the south edge: dark boxes with a lighter top.
      const ventCount = 1 + Math.floor(hash01(s + 2) * 2);
      for (let i = 0; i < ventCount; i++) {
        const vx = innerX + 6 + hash01(s + 31 + i * 5) * Math.max(10, innerW - 24);
        const vy = innerY + innerH - 16 - hash01(s + 32 + i * 5) * 10;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(vx, vy, 12, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(vx, vy, 12, 3);
      }
      // A skylight on the west side: pale blue with a white frame.
      if (hash01(s + 3) < 0.7) {
        const kx = innerX + 4 + hash01(s + 41) * 12;
        const ky = innerY + innerH * 0.3 + hash01(s + 42) * innerH * 0.3;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(kx, ky, 20, 14);
        ctx.fillStyle = '#a8d0e0';
        ctx.fillRect(kx + 2, ky + 2, 16, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(kx + 2, ky + 2, 16, 3);
      }
      // A water tank on the east side: a cylinder seen from above.
      if (hash01(s + 4) < 0.65) {
        const tx = innerX + innerW - 22 - hash01(s + 51) * 14;
        const ty = innerY + innerH * 0.3 + hash01(s + 52) * innerH * 0.3;
        ctx.fillStyle = '#7a8a9a';
        ctx.beginPath();
        ctx.arc(tx, ty, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#a8b8c8';
        ctx.beginPath();
        ctx.arc(tx - 2, ty - 2, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(tx - 3, ty - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // A rooftop garden in one corner, unless the helipad took the roof.
      if (!hasPad && hash01(s + 55) < 0.3) {
        const gx = innerX + innerW - 44;
        const gy = innerY + innerH - 34;
        ctx.fillStyle = '#5d9c4f';
        ctx.fillRect(gx, gy, 36, 26);
        ctx.fillStyle = '#3f8f4f';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(gx + 6 + hash01(s + 61 + i) * 24, gy + 5 + hash01(s + 65 + i) * 16, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawTree(ctx, tree) {
    ctx.save();
    ctx.translate(tree.x, tree.y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(5, 7, tree.size, tree.size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.palmTrunk;
    ctx.fillRect(-2, -2, 4, 8);
    if (tree.palm) {
      ctx.strokeStyle = PALETTE.palmLeaf;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a) * tree.size * 0.7,
          Math.sin(a) * tree.size * 0.7 - 3,
          Math.cos(a) * tree.size * 1.3,
          Math.sin(a) * tree.size * 1.3 + 4,
        );
        ctx.stroke();
      }
      ctx.fillStyle = '#c98d5e';
      ctx.beginPath();
      ctx.arc(3, 2, 2.5, 0, Math.PI * 2);
      ctx.arc(-3, 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.treeLeaf;
      ctx.beginPath();
      ctx.arc(0, -4, tree.size * 0.9, 0, Math.PI * 2);
      ctx.arc(-tree.size * 0.6, 2, tree.size * 0.6, 0, Math.PI * 2);
      ctx.arc(tree.size * 0.6, 2, tree.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(-3, -7, tree.size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeacon(world, view) {
    const obj = currentObjective(world);
    if (!obj.target) return;
    const { x, y } = obj.target;
    if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) return;
    const pulse = 0.5 + Math.sin(world.time * 4) * 0.5;
    // Light pillar.
    const grad = ctx.createLinearGradient(0, y - 160, 0, y);
    grad.addColorStop(0, 'rgba(255,210,60,0)');
    grad.addColorStop(1, `rgba(255,210,60,${0.25 + pulse * 0.2})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - 14, y - 160, 28, 160);
    // Pulsing ring on the ground.
    ctx.strokeStyle = `rgba(255,210,60,${0.6 + pulse * 0.4})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 34 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    // Floating diamond.
    const bob = Math.sin(world.time * 3) * 6;
    ctx.save();
    ctx.translate(x, y - 64 + bob);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23c';
    ctx.strokeStyle = '#7a5b00';
    ctx.lineWidth = 2;
    ctx.fillRect(-11, -11, 22, 22);
    ctx.strokeRect(-11, -11, 22, 22);
    ctx.restore();
    // The mission's letter when it is a start marker.
    if (!obj.active) {
      ctx.fillStyle = '#7a5b00';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', x, y - 64 + bob);
    }
  }

  function drawPickups(world, view) {
    for (const p of world.pickups) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      const bob = Math.sin(world.time * 3 + p.x) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(-11, -7, 22, 14);
        ctx.fillStyle = '#e8f5e9';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
      } else {
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#d43a2f';
        ctx.fillRect(-3, -8, 6, 16);
        ctx.fillRect(-8, -3, 16, 6);
      }
      ctx.restore();
    }
  }

  function render(world) {
    const cam = world.camera;
    const shake = shakeOffset(world.fx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + shake.x, -cam.y + shake.y);
    const view = visibleRect(world);

    drawGround(world, view);
    drawRoads(world, view);
    drawBuildings(world, view);
    drawSkids(ctx, world.fx);
    drawBeacon(world, view);
    drawPickups(world, view);

    // Everything that moves, sorted by height on screen so near things overlap far ones.
    const drawables = [];
    for (const ped of world.peds) drawables.push({ y: ped.y, draw: () => drawPed(ctx, ped) });
    for (const cop of world.cops) drawables.push({ y: cop.y, draw: () => drawCop(ctx, cop, world.time) });
    for (const e of world.enemies) drawables.push({ y: e.y, draw: () => drawEnemy(ctx, e) });
    for (const car of world.cars) drawables.push({ y: car.y, draw: () => drawCar(ctx, car, world.time) });
    if (world.player.onFoot) {
      drawables.push({ y: world.player.y, draw: () => drawPlayer(ctx, world.player, world.time) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) {
      if (d.y > view.y0 - 60 && d.y < view.y1 + 60) d.draw();
    }
    drawBullets(ctx, world.bullets);
    drawParticles(ctx, world.fx);

    // Trees and lamps sit above the street: canopies overlap the pavement.
    for (const tree of world.city.trees) {
      if (tree.x < view.x0 || tree.x > view.x1 || tree.y < view.y0 || tree.y > view.y1) continue;
      drawTree(ctx, tree);
    }
    for (const lamp of world.city.lamps) {
      if (lamp.x < view.x0 || lamp.x > view.x1 || lamp.y < view.y0 || lamp.y > view.y1) continue;
      ctx.fillStyle = '#3a3a42';
      ctx.fillRect(lamp.x - 2, lamp.y - 8, 4, 16);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y - 9, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    resize,
    render,
    updateCamera,
    screenToWorld: (world, x, y) => screenToWorld(world, x, y),
    get view() {
      return { w: viewW, h: viewH };
    },
  };
}
