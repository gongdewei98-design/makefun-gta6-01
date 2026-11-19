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

// Deterministic [0, 1) from a seed and an item index, so roof furniture,
// ponds and umbrellas sit in the same place every visit.
function hash01(seed, n) {
  let x = (seed * 2654435761 + n * 40503) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = (x * 1274126177) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
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
    // Parks: lawn, a cross of dirt paths, a pond in the bigger ones,
    // and flower beds in the corners.
    for (const p of world.city.parks) {
      if (p.x > view.x1 || p.x + p.w < view.x0 || p.y > view.y1 || p.y + p.h < view.y0) continue;
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#cbb98d';
      ctx.fillRect(p.x + p.w / 2 - 7, p.y, 14, p.h);
      ctx.fillRect(p.x, p.y + p.h / 2 - 7, p.w, 14);
      const pondRoll = hash01(Math.round(p.x) * 7 + Math.round(p.y), 1);
      if (p.w > 150 && p.h > 120 && pondRoll < 0.7) {
        const px = p.x + p.w * (0.25 + pondRoll * 0.3);
        const py = p.y + p.h * (0.3 + hash01(Math.round(p.x), 2) * 0.4);
        ctx.fillStyle = '#d9c184';
        ctx.beginPath();
        ctx.ellipse(px, py, 34, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4fa8c8';
        ctx.beginPath();
        ctx.ellipse(px, py, 28, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(px - 8, py - 5, 10, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const flowerColors = ['#e8837a', '#f2c230', '#d9a5c0', '#f5f5f5'];
      for (const [fx, fy] of [[p.x + 16, p.y + 16], [p.x + p.w - 46, p.y + p.h - 46]]) {
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.fillRect(fx - 4, fy - 4, 38, 38);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = flowerColors[Math.floor(hash01(Math.round(p.x + p.y), 10 + i) * flowerColors.length)];
          ctx.beginPath();
          ctx.arc(
            fx + hash01(Math.round(p.x), 20 + i) * 30,
            fy + hash01(Math.round(p.y), 30 + i) * 30,
            3, 0, Math.PI * 2,
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
      // Beach umbrellas and towels, spaced along the sand.
      const umbrellaColors = [
        ['#d94f3d', '#f5f5f5'], ['#3d7dd9', '#f5f5f5'],
        ['#f2c230', '#d94f3d'], ['#2e8b57', '#f5f5f5'],
      ];
      for (let i = 0; i < 20; i++) {
        const ux = 90 + i * 175 + hash01(i, 1) * 60;
        if (ux < view.x0 - 40 || ux > view.x1 + 40) continue;
        if (hash01(i, 2) < 0.25) continue; // some spots stay empty
        const uy = WORLD.beachTop + 36 + hash01(i, 3) * 110;
        const [c1, c2] = umbrellaColors[Math.floor(hash01(i, 4) * umbrellaColors.length)];
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(ux + 8, uy + 10, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Segmented canopy: six alternating wedges.
        for (let s = 0; s < 6; s++) {
          ctx.fillStyle = s % 2 === 0 ? c1 : c2;
          ctx.beginPath();
          ctx.moveTo(ux, uy);
          ctx.arc(ux, uy, 20, (s / 6) * Math.PI * 2, ((s + 1) / 6) * Math.PI * 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.beginPath();
        ctx.arc(ux, uy, 3, 0, Math.PI * 2);
        ctx.fill();
        // A towel beside it.
        ctx.save();
        ctx.translate(ux + 26, uy + 14);
        ctx.rotate(hash01(i, 5) * 0.6 - 0.3);
        ctx.fillStyle = c1;
        ctx.fillRect(-14, -7, 28, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(-14, -7, 28, 4);
        ctx.restore();
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
    // Zebra crosswalks at every intersection: white stripes across each road
    // just outside the crossing box, on all four arms.
    ctx.fillStyle = 'rgba(240,236,220,0.9)';
    for (const vx of ROADS.vertical) {
      for (const hy of ROADS.horizontal) {
        // Bands across the vertical road, north and south of the crossing.
        for (const sy of [hy - half - 22, hy + half + 6]) {
          if (sy < view.y0 - 20 || sy > view.y1) continue;
          for (let x = vx - half + 8; x < vx + half - 12; x += 18) {
            ctx.fillRect(x, sy, 10, 16);
          }
        }
        // Bands across the horizontal road, west and east of the crossing.
        for (const sx of [vx - half - 22, vx + half + 6]) {
          if (sx < view.x0 - 20 || sx > view.x1) continue;
          for (let y = hy - half + 8; y < hy + half - 12; y += 18) {
            ctx.fillRect(sx, y, 16, 10);
          }
        }
      }
    }
  }

  function drawBuildings(world, view) {
    for (const b of world.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = 6 + b.floors * 3; // shadow offset, grows with height
      const off = 5 + b.floors * 2; // roof shift to the north-west
      // Strong drop shadow to the south-east.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + lift, b.y + lift + 4, b.w, b.h);
      // Wall face.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // South and east wall bands, darker, with lit window strips.
      const band = 7 + off;
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(b.x, b.y + b.h - band, b.w, band);
      ctx.fillRect(b.x + b.w - band, b.y, band, b.h);
      ctx.fillStyle = 'rgba(255,230,150,0.85)';
      const winH = Math.max(3, Math.floor(band / 2) - 1);
      for (let x = b.x + 10; x < b.x + b.w - 16; x += 22) {
        ctx.fillRect(x, b.y + b.h - band + 2, 12, winH);
      }
      const winW = Math.max(3, Math.floor(band / 2) - 1);
      for (let y = b.y + 10; y < b.y + b.h - 16; y += 22) {
        ctx.fillRect(b.x + b.w - band + 2, y, winW, 12);
      }
      // Roof, shifted north-west so the south and east walls read as height.
      const rx = b.x + 7 - off;
      const ry = b.y + 7 - off;
      const rw = b.w - 14;
      const rh = b.h - 14;
      ctx.fillStyle = b.roof;
      ctx.fillRect(rx, ry, rw, rh);
      // Sunlit top edge.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(rx, ry, rw, 8);
      // Roof panel seams.
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      for (let x = rx + 30; x < rx + rw - 8; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, ry + 2);
        ctx.lineTo(x, ry + rh - 2);
        ctx.stroke();
      }
      for (let y = ry + 30; y < ry + rh - 8; y += 30) {
        ctx.beginPath();
        ctx.moveTo(rx + 2, y);
        ctx.lineTo(rx + rw - 2, y);
        ctx.stroke();
      }
      // Roof furniture, seeded by the building so it never moves.
      if (rw > 70 && rh > 70) {
        const fx = (f) => rx + 10 + f * (rw - 20);
        const fy = (f) => ry + 10 + f * (rh - 20);
        // AC units with fan circles.
        const acCount = 1 + Math.floor(hash01(b.seed, 1) * 2);
        for (let i = 0; i < acCount; i++) {
          const ax = fx(hash01(b.seed, 10 + i));
          const ay = fy(hash01(b.seed, 20 + i));
          ctx.fillStyle = '#9aa0a3';
          ctx.fillRect(ax, ay, 18, 13);
          ctx.fillStyle = '#5a5e60';
          ctx.beginPath();
          ctx.arc(ax + 9, ay + 6.5, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#c8ccce';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax + 5.5, ay + 6.5);
          ctx.lineTo(ax + 12.5, ay + 6.5);
          ctx.moveTo(ax + 9, ay + 3);
          ctx.lineTo(ax + 9, ay + 10);
          ctx.stroke();
        }
        // Vents.
        const ventCount = 1 + Math.floor(hash01(b.seed, 2) * 2);
        for (let i = 0; i < ventCount; i++) {
          const vx = fx(hash01(b.seed, 30 + i));
          const vy = fy(hash01(b.seed, 40 + i));
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(vx, vy, 9, 9);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(vx, vy, 9, 2);
        }
        // Skylight.
        const sx = fx(hash01(b.seed, 3));
        const sy = fy(hash01(b.seed, 4));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(sx, sy, 20, 14);
        ctx.fillStyle = '#8ec8dd';
        ctx.fillRect(sx + 2, sy + 2, 16, 10);
        // Water tank near a corner.
        if (hash01(b.seed, 5) < 0.6) {
          const tx = rx + rw - 18 - hash01(b.seed, 6) * 20;
          const ty = ry + rh - 18 - hash01(b.seed, 7) * 20;
          ctx.fillStyle = '#7a8288';
          ctx.beginPath();
          ctx.arc(tx, ty, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#a8b0b5';
          ctx.beginPath();
          ctx.arc(tx, ty, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a6065';
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // Helipad on about one in four towers; otherwise a rooftop garden.
        const tower = b.floors >= 3 && Math.min(rw, rh) > 110;
        if (tower && hash01(b.seed, 8) < 0.25) {
          const hx = rx + rw / 2;
          const hy = ry + rh / 2;
          const hr = Math.min(rw, rh) / 2 - 12;
          ctx.fillStyle = 'rgba(30,30,36,0.85)';
          ctx.beginPath();
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#f5f5f5';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hx, hy, hr - 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#f5f5f5';
          ctx.font = `bold ${Math.round(hr)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', hx, hy + 1);
        } else if (hash01(b.seed, 9) < 0.5) {
          const gx = fx(hash01(b.seed, 11));
          const gy = fy(hash01(b.seed, 12));
          ctx.fillStyle = '#5d9c4f';
          ctx.fillRect(gx, gy, 30, 20);
          ctx.fillStyle = '#3f8f4f';
          ctx.beginPath();
          ctx.arc(gx + 8, gy + 8, 5, 0, Math.PI * 2);
          ctx.arc(gx + 21, gy + 12, 6, 0, Math.PI * 2);
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
