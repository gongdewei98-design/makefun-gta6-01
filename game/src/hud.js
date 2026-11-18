// The HUD: money, health, wanted stars, the mission objective and a live
// minimap. The HUD is DOM (crisp text, cheap updates); the minimap is a small
// canvas redrawn every frame. Values are only written when they change.

import { districtAt, ROADS, WORLD } from './config.js';
import { currentObjective } from './missions.js';

export function createHud(doc) {
  const el = {
    money: doc.getElementById('hud-money'),
    healthFill: doc.getElementById('hud-health-fill'),
    stars: doc.getElementById('hud-stars'),
    district: doc.getElementById('hud-district'),
    speed: doc.getElementById('hud-speed'),
    speedValue: doc.getElementById('hud-speed-value'),
    objectiveTitle: doc.getElementById('hud-objective-title'),
    objectiveText: doc.getElementById('hud-objective-text'),
    objectiveMeta: doc.getElementById('hud-objective-meta'),
    message: doc.getElementById('hud-message'),
    messageTitle: doc.getElementById('hud-message-title'),
    messageSub: doc.getElementById('hud-message-sub'),
    hint: doc.getElementById('hud-hint'),
    bust: doc.getElementById('hud-bust'),
    bustFill: doc.getElementById('hud-bust-fill'),
    carPrompt: doc.getElementById('hud-carprompt'),
    minimap: doc.getElementById('minimap'),
  };
  const mapCtx = el.minimap.getContext('2d');
  const cache = {};
  let messageUntil = 0;
  let hintUntil = 0;

  function setText(node, key, value) {
    if (!node) return;
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  function drawMinimap(world) {
    const w = el.minimap.width;
    const h = el.minimap.height;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    mapCtx.clearRect(0, 0, w, h);
    // Ground and water.
    mapCtx.fillStyle = '#2e2a22';
    mapCtx.fillRect(0, 0, w, h);
    mapCtx.fillStyle = '#1d7f9e';
    mapCtx.fillRect(0, 2480 * sy, w, h - 2480 * sy);
    mapCtx.fillStyle = '#ecd9a0';
    mapCtx.fillRect(0, 2440 * sy, w, 40 * sy);
    // Roads.
    mapCtx.strokeStyle = '#8b8578';
    mapCtx.lineWidth = 3;
    for (const vx of ROADS.vertical) {
      mapCtx.beginPath();
      mapCtx.moveTo(vx * sx, 0);
      mapCtx.lineTo(vx * sx, 2440 * sy);
      mapCtx.stroke();
    }
    for (const hy of ROADS.horizontal) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, hy * sy);
      mapCtx.lineTo(w, hy * sy);
      mapCtx.stroke();
    }
    // Mission marker: a pulsing yellow diamond.
    const obj = currentObjective(world);
    if (obj.target) {
      const pulse = 4 + Math.sin(world.time * 5) * 1.5;
      mapCtx.save();
      mapCtx.translate(obj.target.x * sx, obj.target.y * sy);
      mapCtx.rotate(Math.PI / 4);
      mapCtx.fillStyle = '#ffd23c';
      mapCtx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      mapCtx.restore();
    }
    // Police as flashing dots, enemies as red dots.
    for (const car of world.cars) {
      if (car.driver === 'police' && !car.wrecked) {
        mapCtx.fillStyle = Math.floor(world.time * 6) % 2 === 0 ? '#ff2e2e' : '#2e6bff';
        mapCtx.beginPath();
        mapCtx.arc(car.x * sx, car.y * sy, 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }
    for (const e of world.enemies) {
      if (e.state === 'down') continue;
      mapCtx.fillStyle = '#ff5a5a';
      mapCtx.beginPath();
      mapCtx.arc(e.x * sx, e.y * sy, 2.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // The player: a white arrow pointing where she faces.
    const p = world.player;
    mapCtx.save();
    mapCtx.translate(p.x * sx, p.y * sy);
    mapCtx.rotate(p.angle);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#222';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(7, 0);
    mapCtx.lineTo(-5, -5);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  return {
    showMessage(title, sub, dur) {
      setText(el.messageTitle, 'msgTitle', title);
      setText(el.messageSub, 'msgSub', sub || '');
      messageUntil = performance.now() / 1000 + dur;
      el.message.classList.add('show');
    },
    showHint(text, dur) {
      setText(el.hint, 'hint', text);
      hintUntil = performance.now() / 1000 + dur;
      el.hint.classList.add('show');
    },
    hideHint() {
      el.hint.classList.remove('show');
    },
    update(world) {
      const now = performance.now() / 1000;
      if (now > messageUntil) el.message.classList.remove('show');
      if (now > hintUntil) el.hint.classList.remove('show');
      const player = world.player;

      setText(el.money, 'money', `$${Math.floor(player.money).toLocaleString('en-US')}`);
      const healthPct = Math.max(0, Math.round(player.health));
      if (cache.health !== healthPct) {
        cache.health = healthPct;
        el.healthFill.style.width = `${healthPct}%`;
        el.healthFill.classList.toggle('low', healthPct < 30);
      }
      const stars = '★'.repeat(world.wanted) + '☆'.repeat(5 - world.wanted);
      setText(el.stars, 'stars', stars);
      el.stars.classList.toggle('hot', world.wanted > 0);
      setText(el.district, 'district', districtAt(player.x, player.y));

      if (!player.onFoot && player.car) {
        el.speed.classList.add('show');
        const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
        setText(el.speedValue, 'speed', `${kmh}`);
      } else {
        el.speed.classList.remove('show');
      }

      const obj = currentObjective(world);
      setText(el.objectiveTitle, 'objTitle', obj.title);
      setText(el.objectiveText, 'objText', obj.text);
      let meta = '';
      if (obj.target) meta += `${obj.distance}m`;
      if (obj.timer !== null) meta += (meta ? '  ·  ' : '') + `⏱ ${Math.ceil(obj.timer)}s`;
      setText(el.objectiveMeta, 'objMeta', meta);

      if (world.bustProgress > 0.02) {
        el.bust.classList.add('show');
        el.bustFill.style.width = `${Math.round(world.bustProgress * 100)}%`;
      } else {
        el.bust.classList.remove('show');
      }

      // "Press E" prompt when a stealable car is near and Mara is on foot.
      if (player.onFoot && world.nearCar) {
        el.carPrompt.classList.add('show');
        setText(el.carPrompt, 'carPrompt', world.nearCar.type === 'police' ? 'E — STEAL POLICE CAR' : 'E — STEAL CAR');
      } else {
        el.carPrompt.classList.remove('show');
      }

      drawMinimap(world);
    },
  };
}
