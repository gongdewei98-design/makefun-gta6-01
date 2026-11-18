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
    // Parks: lawn, a path across, and a pond or flower beds on some.
    for (const p of world.city.parks) {
      if (p.x > view.x1 || p.x + p.w < view.x0 || p.y > view.y1 || p.y + p.h < view.y0) continue;
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
      // A pale path across the park, both ways.
      ctx.fillStyle = 'rgba(220,210,180,0.85)';
      ctx.fillRect(p.x, p.y + p.h / 2 - 6, p.w, 12);
      ctx.fillRect(p.x + p.w / 2 - 6, p.y, 12, p.h);
      // A pond on the bigger parks, flower beds on the smaller ones.
      // Seeded by the park's position, so it never moves.
      const h = (((p.x * 31 + p.y * 17) % 100) + 100) % 100;
      if (p.w > 200 && p.h > 150 && h < 45) {
        ctx.fillStyle = '#2fa8b8';
        ctx.beginPath();
        ctx.ellipse(p.x + p.w * 0.3, p.y + p.h * 0.3, 36, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.x + p.w * 0.3 - 9, p.y + p.h * 0.3 - 6, 15, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const flowerColors = ['#e8837a', '#f2c230', '#d9a5c0', '#f5efe2'];
        for (let i = 0; i < 10; i++) {
          const fx = p.x + 16 + ((h * 37 + i * 53) % Math.max(20, p.w - 32));
          const fy = p.y + 16 + ((h * 23 + i * 41) % Math.max(20, p.h - 32));
          ctx.fillStyle = flowerColors[(h + i) % flowerColors.length];
          ctx.beginPath();
          ctx.arc(fx, fy, 4, 0, Math.PI * 2);
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
      // Beach umbrellas and towels: deterministic by position, so they never
      // move between visits. Some stretches stay empty.
      const UMBRELLA_COLORS = ['#e8837a', '#f2c230', '#7fb5b5', '#d9a5c0', '#f4e3c1'];
      for (let x = 100; x < WORLD.width - 60; x += 120) {
        if (x < view.x0 - 60 || x > view.x1 + 60) continue;
        const uh = ((x * 2654435761) >>> 0) % 100;
        if (uh < 30) continue;
        const uy = WORLD.beachTop + 36 + (uh % 5) * 12;
        const color = UMBRELLA_COLORS[uh % UMBRELLA_COLORS.length];
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(x + 8, uy + 8, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8a8a84';
        ctx.fillRect(x - 1, uy - 4, 2, 14);
        // Canopy: alternating colored and white wedges, like a real umbrella.
        for (let w = 0; w < 6; w++) {
          ctx.fillStyle = w % 2 === 0 ? color : '#f5efe2';
          ctx.beginPath();
          ctx.moveTo(x, uy);
          ctx.arc(x, uy, 18, (w * Math.PI) / 3, ((w + 1) * Math.PI) / 3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, uy, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = UMBRELLA_COLORS[(uh + 2) % UMBRELLA_COLORS.length];
        ctx.fillRect(x + 24, uy + 4, 20, 10);
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
    // Solid edge lines along both sides of every road.
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    for (const vx of ROADS.vertical) {
      if (vx + half < view.x0 || vx - half > view.x1) continue;
      ctx.fillRect(vx - half + 5, 0, 3, WORLD.beachTop);
      ctx.fillRect(vx + half - 8, 0, 3, WORLD.beachTop);
    }
    for (const hy of ROADS.horizontal) {
      if (hy + half < view.y0 || hy - half > view.y1) continue;
      ctx.fillRect(0, hy - half + 5, WORLD.width, 3);
      ctx.fillRect(0, hy + half - 8, WORLD.width, 3);
    }
    // Crosswalks at every intersection: zebra stripes on each road's asphalt,
    // just outside the crossing, so every corner reads as a city street.
    ctx.fillStyle = 'rgba(232,224,200,0.75)';
    for (const vx of ROADS.vertical) {
      for (const hy of ROADS.horizontal) {
        // Stripes across the vertical road, above and below the crossing.
        for (const cy of [hy - half - 10, hy + half + 10]) {
          if (cy < view.y0 - 12 || cy > view.y1 + 12) continue;
          for (let x = vx - half + 8; x < vx + half - 8; x += 14) {
            ctx.fillRect(x, cy - 8, 7, 16);
          }
        }
        // Stripes across the horizontal road, left and right of the crossing.
        for (const cx of [vx - half - 10, vx + half + 10]) {
          if (cx < view.x0 - 12 || cx > view.x1 + 12) continue;
          for (let y = hy - half + 8; y < hy + half - 8; y += 14) {
            ctx.fillRect(cx - 8, y, 16, 7);
          }
        }
      }
    }
  }

  function drawBuildings(world, view) {
    for (const b of world.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = 6 + b.floors * 3;
      // Drop shadow to the south-east, sized by height.
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(b.x + lift, b.y + lift + 4, b.w, b.h);
      // Wall face.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // South and east faces, darker, for a hint of height. The roof sits
      // toward the north-west, so the wall bands read as the building's sides.
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(b.x, b.y + b.h - 7 - lift, b.w, 7 + lift);
      ctx.fillRect(b.x + b.w - 7 - lift, b.y, 7 + lift, b.h);
      // Roof: an inset slab with a darker border and panel seams.
      const rx = b.x + 7;
      const ry = b.y + 7;
      const rw = b.w - 14 - lift;
      const rh = b.h - 14 - lift;
      ctx.fillStyle = b.roof;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 3;
      ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(rx, ry, rw, 8);
      // Panel seams across the roof.
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 2;
      for (let px = rx + 46; px < rx + rw - 10; px += 46) {
        ctx.beginPath();
        ctx.moveTo(px, ry + 4);
        ctx.lineTo(px, ry + rh - 4);
        ctx.stroke();
      }
      for (let py = ry + 46; py < ry + rh - 10; py += 46) {
        ctx.beginPath();
        ctx.moveTo(rx + 4, py);
        ctx.lineTo(rx + rw - 4, py);
        ctx.stroke();
      }
      // Windows along the south and east wall bands: lit panes in a row.
      ctx.fillStyle = 'rgba(255,240,190,0.75)';
      const winStep = 26;
      for (let wx = b.x + 14; wx < b.x + b.w - lift - 14; wx += winStep) {
        ctx.fillRect(wx, b.y + b.h - lift + 1, 10, Math.max(4, lift - 4));
      }
      for (let wy = b.y + 14; wy < b.y + b.h - lift - 14; wy += winStep) {
        ctx.fillRect(b.x + b.w - lift + 1, wy, Math.max(4, lift - 4), 10);
      }
      // Seeded roof furniture: AC units, vents, skylights, a water tank,
      // a rooftop garden, or a helipad on the tallest towers.
      let s = (b.seed * 2654435761) >>> 0;
      const next = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
      const units = 1 + Math.floor(next() * 3);
      for (let i = 0; i < units; i++) {
        const uw = 16 + next() * 10;
        const uh = 12 + next() * 8;
        const ux = rx + 10 + next() * Math.max(10, rw - uw - 20);
        const uy = ry + 10 + next() * Math.max(10, rh - uh - 20);
        ctx.fillStyle = '#c9c9c2';
        ctx.fillRect(ux, uy, uw, uh);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(ux + uw / 2, uy + uh / 2, Math.min(uw, uh) * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      const vents = 1 + Math.floor(next() * 2);
      for (let i = 0; i < vents; i++) {
        const vx = rx + 10 + next() * Math.max(10, rw - 26);
        const vy = ry + 10 + next() * Math.max(10, rh - 22);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(vx, vy, 12, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(vx, vy, 12, 3);
      }
      if (next() < 0.55) {
        // Skylight: a blue-tinted glass panel.
        const sw = Math.min(44, rw * 0.3);
        const sh = Math.min(30, rh * 0.3);
        const sx = rx + 12 + next() * Math.max(8, rw - sw - 24);
        const sy = ry + 12 + next() * Math.max(8, rh - sh - 24);
        ctx.fillStyle = 'rgba(150,200,225,0.85)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      }
      if (b.floors >= 3 && next() < 0.7) {
        // Water tank on a tall block: a drum with a highlight.
        const tx = rx + rw - 26;
        const ty = ry + 24;
        ctx.fillStyle = '#8a8a84';
        ctx.beginPath();
        ctx.arc(tx, ty, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(tx - 4, ty - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.floors >= 4 && next() < 0.5) {
        // Helipad on the tallest towers: a ring with an H. Only about half
        // of them have one, so the skyline does not repeat itself.
        const hx = rx + rw / 2;
        const hy = ry + rh / 2;
        const hr = Math.min(rw, rh) * 0.22;
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = `bold ${Math.round(hr)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', hx, hy + 1);
      } else if (next() < 0.3) {
        // Rooftop garden: a green patch with tiny shrubs.
        const gw = Math.min(70, rw * 0.4);
        const gh = Math.min(46, rh * 0.35);
        const gx = rx + 10 + next() * Math.max(8, rw - gw - 20);
        const gy = ry + 10 + next() * Math.max(8, rh - gh - 20);
        ctx.fillStyle = 'rgba(93,156,79,0.9)';
        ctx.fillRect(gx, gy, gw, gh);
        ctx.fillStyle = 'rgba(63,143,79,0.9)';
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.arc(gx + 8 + next() * (gw - 16), gy + 8 + next() * (gh - 16), 4 + next() * 3, 0, Math.PI * 2);
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
