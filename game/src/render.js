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
    // Parks.
    for (const p of world.city.parks) {
      if (p.x > view.x1 || p.x + p.w < view.x0 || p.y > view.y1 || p.y + p.h < view.y0) continue;
      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
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
  }

  function drawBuildings(world, view) {
    for (const b of world.city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      const lift = 6 + b.floors * 3;
      // Drop shadow to the south-east, sized by height.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + lift, b.y + lift + 4, b.w, b.h);
      // Wall face.
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // South and east faces, darker, for a hint of height.
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(b.x, b.y + b.h - lift, b.w, lift);
      ctx.fillRect(b.x + b.w - lift, b.y, lift, b.h);
      // Roof.
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, 8);
      // Roof clutter: vents and a water tank, placed by the building's seed.
      const s = b.seed;
      const vx = b.x + 14 + (s % 53);
      const vy = b.y + 14 + ((s >> 3) % 41);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(vx, vy, 14, 10);
      ctx.fillRect(b.x + b.w - 30, b.y + b.h - 26, 12, 12);
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
