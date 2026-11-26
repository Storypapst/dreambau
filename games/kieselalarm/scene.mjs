import { FIELD } from "./run.mjs";

const WIDTH = FIELD.width;
const HEIGHT = FIELD.height;

function ellipse(ctx, x, y, rx, ry, fill, angle = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx, points, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  points.slice(1).forEach(point => ctx.lineTo(...point));
  ctx.stroke();
}

function square(ctx, x, y, width, height, radius, fill, border) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function seed(value) {
  const noise = Math.sin(value * 17.127 + 101.17) * 34157.327;
  return noise - Math.floor(noise);
}

function ground(ctx, distance, kart) {
  const wash = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  wash.addColorStop(0, '#253324');
  wash.addColorStop(.52, '#343a28');
  wash.addColorStop(1, '#192a24');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#111b15';
  ctx.fillRect(0, 0, 38, HEIGHT);
  ctx.fillRect(WIDTH - 38, 0, 38, HEIGHT);
  const offset = distance % 960;
  for (let i = 0; i < 174; i++) {
    const y = (seed(i * 3 + 14) * 960 + offset) % 960 - 35;
    const x = seed(i * 3) * WIDTH;
    if (y > HEIGHT + 25) continue;
    const size = 1 + seed(i * 3 + 1) * 3;
    ellipse(ctx, x, y, size * 1.6, size, i % 3 === 0 ? '#78806455' : '#121c1580');
    if (i % 18 === 0 && (x < 83 || x > WIDTH - 83)) {
      for (let tuft = 0; tuft < 4; tuft++) {
        line(ctx, [[x, y + 9], [x + tuft * 4 - 7, y - 7 - tuft * 3]], '#496049', 2);
      }
    }
  }

  for (let i = 0; i < 11; i++) {
    const y = (i * 89 + offset) % 960 - 100;
    const right = i % 2 === 1;
    const x = right ? WIDTH - 24 + seed(i) * 14 : 14 + seed(i) * 22;
    ellipse(ctx, x + 5, y + 7, 25, 16, '#0c1510b0', -.5);
    ellipse(ctx, x, y, 24, 13, i % 3 ? '#384c37' : '#535d3c', -.5);
    line(ctx, [[x - 17, y + 7], [x + 15, y - 8]], '#74836180', 1);
  }

  if (kart) {
    const offsetLane = distance % 51;
    for (const x of [154, 286]) {
      for (let y = offsetLane - 40; y < HEIGHT; y += 51) {
        line(ctx, [[x, y], [x, y + 15]], '#cad19a25', 2);
      }
    }
  }
  const shade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  shade.addColorStop(0, '#0b1814a6');
  shade.addColorStop(.35, '#0b181400');
  shade.addColorStop(.84, '#0a1b1200');
  shade.addColorStop(1, '#0a1b1280');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function insect(ctx, x, y, ant, clock = 0, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ellipse(ctx, 2, 6, 26, 27, '#0b140fc7');
  const dark = ant ? '#171312' : '#26361e';
  const top = ant ? '#c16a48' : '#819053';
  const glint = ant ? '#f1aa69' : '#d5b36d';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const step = Math.sin(clock * 23 + i * 2.1 + side) * 5;
      const y = -10 + i * 9;
      line(ctx, [[side * 7, y], [side * 19, y - 6 + step], [side * 25, y + 3 + step]], dark, 4);
      line(ctx, [[side * 9, y], [side * 19, y - 6 + step]], top, 1.4);
    }
    line(ctx, [[side * 5, ant ? -18 : 16], [side * 13, ant ? -28 : 26], [side * 19, ant ? -30 : 28]], top, 2);
  }
  ellipse(ctx, 0, ant ? 13 : -5, ant ? 13 : 17, ant ? 18 : 22, dark);
  ellipse(ctx, 0, ant ? 12 : -7, ant ? 10 : 14, ant ? 14 : 17, top);
  if (!ant) line(ctx, [[0, -24], [0, 10]], dark, 2);
  ellipse(ctx, 0, ant ? -1 : 10, 10, 11, dark);
  ellipse(ctx, 0, ant ? -14 : 16, 10, 9, top);
  ellipse(ctx, -4, ant ? -17 : 19, 2, 2, glint);
  ellipse(ctx, 4, ant ? -17 : 19, 2, 2, glint);
  ctx.restore();
}

function kart(ctx, x, y, clock, occupied = true) {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 2, 9, 39, 33, '#07110bc7');
  for (const wheelX of [-29, 16]) {
    for (const wheelY of [-21, 13]) {
      square(ctx, wheelX, wheelY, 13, 22, 5, '#121914', '#596251');
      line(ctx, [[wheelX + 3, wheelY + 10], [wheelX + 10, wheelY + 10]], '#78806c', 2);
    }
  }
  square(ctx, -22, -30, 44, 65, 12, '#a44e36', '#241e17');
  square(ctx, -18, -28, 36, 15, 5, '#bcb496', '#66593d');
  square(ctx, -18, 17, 36, 15, 5, '#a9a58a', '#574d36');
  square(ctx, -14, -11, 28, 23, 6, '#432720', '#e6ac5a');
  ellipse(ctx, -14, -33, 5, 3, '#faf3bb');
  ellipse(ctx, 14, -33, 5, 3, '#faf3bb');
  if (occupied) {
    insect(ctx, 0, 2, true, clock, .48);
    line(ctx, [[-5, -5], [5, -5]], '#8cddd3', 3);
  }
  ctx.restore();
}

function rock(ctx, x, y) {
  ellipse(ctx, x + 4, y + 11, 34, 21, '#0b140fbd');
  ctx.fillStyle = '#7b7860';
  ctx.strokeStyle = '#3e4335';
  ctx.lineWidth = 3;
  ctx.beginPath();
  [[-32, 8], [-24, -16], [-8, -24], [19, -17], [33, 4], [14, 20], [-18, 17]]
    .forEach(([dx, dy], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  line(ctx, [[x - 22, y - 12], [x - 5, y - 17], [x + 12, y - 12]], '#a49c7a', 3);
}

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }
}

function drawBug(ctx, item, clock) {
  const {x, y, kind} = item;
  const flash = item.flashUntil > clock;
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'wing') {
    insect(ctx, 0, 0, false, clock, .77);
    const angle = .48 + Math.sin(clock * 41) * .19;
    for (const side of [-1, 1]) {
      ellipse(ctx, side * 11, -6, 8, 19, flash ? '#fffacd' : '#a5dfe1b5', side * angle);
      line(ctx, [[side * 4, 9], [side * 16, -18]], '#49777b', 1);
      ellipse(ctx, side * 4, 13, 2, 2, '#affaff');
    }
  } else if (kind === 'armor') {
    insect(ctx, 0, 0, false, clock, 1.08);
    for (let i = 0; i < 3; i++) {
      const y = -17 + i * 8;
      const fill = flash ? '#fff5bc' : i < item.hp ? ['#9baa9a', '#798f8c', '#68807c'][i] : '#514a3a';
      polygon(ctx, [[-16, y + 3], [-11, y - 3], [0, y - 5], [11, y - 3], [16, y + 3], [0, y + 8]], fill, '#3d4d48');
      if (i >= item.hp) line(ctx, [[-7, y - 2], [-2, y + 1], [-5, y + 3], [3, y + 6]], '#1f2826', 2.3);
    }
  } else {
    insect(ctx, 0, 0, false, clock, .9);
    for (const side of [-1, 1]) {
      line(ctx, [[side * 9, -18], [side * 5, -8], [side * 5, 1]], flash ? '#fff5bc' : '#ead873', 2.6);
    }
  }
  ctx.restore();
}

function lineTile(ctx, unit) {
  const {x, y, used} = unit;
  ellipse(ctx, x, y + 4, 26, 26, '#0d1b15ab');
  ellipse(ctx, x, y, 25, 25, used ? '#76ccad' : '#c4d07c');
  ellipse(ctx, x, y, 22.5, 22.5, used ? '#2b5546' : '#293928');
  ctx.fillStyle = used ? '#c0ffe6' : '#fbffcc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 29px system-ui, sans-serif';
  ctx.fillText(unit.letter, x, y - 1);
  ctx.textAlign = 'center';
  ctx.font = 'bold 9px ui-monospace, monospace';
  ellipse(ctx, x + 18, y + 19, 7.5, 7.5, '#17271e');
  ctx.fillStyle = '#d3dbb9';
  ctx.fillText(String(unit.slot + 1), x + 18, y + 19);
}

function drawUnit(ctx, item, clock) {
  const {x, y} = item;
  if (item.type === 'bug') {
    drawBug(ctx, item, clock);
  } else if (item.type === 'rock') {
    rock(ctx, x, y);
  } else if (item.type === 'goodie') {
    ellipse(ctx, x, y, 22, 22, '#6decc42a');
    square(ctx, x - 13, y - 14, 26, 28, 8, '#213e31', '#70e4c4');
    line(ctx, [[x, y - 6], [x, y + 6]], '#d1fff0', 2);
    line(ctx, [[x - 6, y], [x + 6, y]], '#d1fff0', 2);
  } else if (item.slot !== undefined) {
    lineTile(ctx, item);
  } else {
    ellipse(ctx, x, y + 24, 25, 7, '#0d1b13b8');
    square(ctx, x - 26, y - 25, 52, 50, 11, '#1b291f', '#c7d681');
    square(ctx, x - 21, y - 19, 42, 39, 7, '#333f27');
    ctx.fillStyle = '#f9ffce';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px ui-monospace, monospace';
    ctx.fillText(item.letter, x, y + 1);
    for (const side of [-1, 1]) ellipse(ctx, x + side * 21, y + 19, 2, 2, '#cee66f');
  }
}

function blaster(ctx, x, y, angle, kick) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.translate(-4 * kick, 0);
  square(ctx, -7, -6, 20, 12, 5, '#b9874e', '#332d24');
  square(ctx, 5, -5, 18, 10, 3, '#8faaa3', '#253d37');
  square(ctx, 17, -6, 8, 12, 2, '#b4e6cd', '#2b4940');
  line(ctx, [[6, -2], [14, -2]], '#ffe4a1', 2.6);
  ellipse(ctx, 1, 0, 3, 3, '#85f6d2');
  if (kick > .48) {
    polygon(ctx, [[24, -3], [33, -7], [30, -2], [42, 0], [30, 3], [33, 7], [24, 3]],
      '#f6efad');
    ellipse(ctx, 26, 0, 6, 3, '#fffbed');
  }
  ctx.restore();
}

function drawShot(ctx, shot) {
  const dx = Math.cos(shot.angle);
  const dy = Math.sin(shot.angle);
  line(ctx, [[shot.x - dx * 16, shot.y - dy * 16], [shot.x, shot.y]], '#69e6b88c', 6);
  line(ctx, [[shot.x - dx * 8, shot.y - dy * 8], [shot.x, shot.y]], '#edffb7', 3);
  ellipse(ctx, shot.x, shot.y, 3.4, 3.4, '#fff8c9');
}

function drawDebris(ctx, run) {
  for (const hit of run.debris) {
    const t = (run.clock - hit.born) / .55;
    const count = hit.hp > 0 ? 5 : 12;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    for (let i = 0; i < count; i++) {
      const noise = seed(hit.id + i * 41);
      const angle = i / count * Math.PI * 2 + noise;
      const distance = (9 + t * (30 + noise * 37)) * (hit.hp > 0 ? .65 : 1);
      const x = hit.x + Math.cos(angle) * distance;
      const y = hit.y + Math.sin(angle) * distance + t * t * 10;
      if (hit.kind === 'armor') {
        polygon(ctx, [[x - 3, y - 2], [x + 3, y - 3], [x + 1, y + 4]], i % 2 ? '#c6d2bc' : '#f3ae65');
      } else if (hit.kind === 'wing') {
        ellipse(ctx, x, y, 2 + noise * 3, 2, '#9ce0d7', angle);
      } else {
        ellipse(ctx, x, y, 2 + noise * 3, 2 + noise, i % 2 ? '#e9bc67' : '#9fa852', angle);
      }
    }
    ctx.restore();
  }
}

function accents(ctx, effects) {
  for (const effect of effects) {
    const t = effect.age / effect.life;
    const r = effect.ring ? 17 + 380 * t : 7 + 37 * t;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = effect.ring ? 4 : 2;
    ctx.beginPath();
    ctx.ellipse(effect.x, effect.y, r, r * .78, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const direction = i * Math.PI * 2 / 7 + effect.x * .01;
      const x = effect.x + Math.cos(direction) * r;
      const y = effect.y + Math.sin(direction) * r * .78;
      line(ctx, [[x, y], [x + Math.cos(direction) * 9, y + Math.sin(direction) * 9]], effect.color, 2);
    }
    if (effect.label) {
      ctx.fillStyle = effect.color;
      ctx.font = '900 16px system-ui';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(effect.label, effect.x, effect.y - 27 - t * 22);
    }
  }
  ctx.globalAlpha = 1;
}

function rain(ctx, clock) {
  for (let i = 0; i < 30; i++) {
    const y = (seed(i + 220) * 760 + clock * (370 + seed(i) * 130)) % 760 - 30;
    const x = (seed(i + 170) * (WIDTH + 80) - (clock * 52 % (WIDTH + 80)) + WIDTH + 80) % (WIDTH + 80) - 30;
    line(ctx, [[x, y], [x - 6, y + 17]], '#a5d0bd40', 1.1);
  }
}

function makeBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  return canvas;
}

export function makeScene(ctx) {
  const backdrop = makeBackdrop();
  const backdropContext = backdrop.getContext('2d');
  return (run, effects, idle) => {
    if (!run) {
      ground(backdropContext, idle * 24, false);
      ctx.drawImage(backdrop, 0, 0);
      insect(ctx, 213, 203, true, idle, 2.5);
      insect(ctx, 333, 121, false, idle, 2);
      rock(ctx, 95, 148);
      return;
    }
    const kartMode = run.mode === 'kart';
    ground(backdropContext, run.distance, kartMode);
    ctx.drawImage(backdrop, 0, 0);
    const lineMode = run.mode === 'line';
    if (lineMode) {
      kart(ctx, run.parkX, FIELD.playerY + 9, run.clock, false);
      if (run.linePath.length > 1) {
        const points = run.linePath.map(point => [point.x, point.y]);
        line(ctx, points, '#15291e', 9);
        line(ctx, points, '#91e1bb', 4);
      }
    }
    // Letter faces remain legible when scenery or opponents share a lane.
    for (const unit of run.units) if (!unit.gone && unit.type !== 'letter') drawUnit(ctx, unit, run.clock);
    for (const unit of run.units) if (!unit.gone && unit.type === 'letter') drawUnit(ctx, unit, run.clock);
    const y = FIELD.playerY;
    if (run.clock < run.shieldUntil || run.buffs > 0) {
      const color = run.buffs > 0 ? '#f3bc7670' : '#85ead16f';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(run.playerX, y, 39 + Math.sin(run.clock * 10) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const kick = Math.max(0, (run.recoilUntil - run.clock) / .19);
    if (kartMode) {
      kart(ctx, run.playerX, y, run.clock);
      blaster(ctx, run.playerX + 18 * run.gunSide, y, run.gunAngle, kick);
    } else {
      const dismount = lineMode ? Math.min(1, (run.clock - run.modeSince) / .68) : 1;
      const x = lineMode ? run.parkX + (run.playerX - run.parkX) * dismount : run.playerX;
      insect(ctx, x, y, true, run.clock);
      line(ctx, [[x - 6, y - 16], [x + 6, y - 16]], '#a4ddd8', 4);
      if (!lineMode) blaster(ctx, x, y - 5, run.gunAngle, kick);
    }
    const beam = run.traceShot;
    if (beam && run.clock - beam.born < .16) {
      const progress = Math.min(1, (run.clock - beam.born) / .12);
      const x = beam.x + (beam.endX - beam.x) * progress;
      const y = beam.y + (beam.endY - beam.y) * progress;
      drawShot(ctx, {x, y, angle:beam.angle});
    }
    for (const shot of run.shots) drawShot(ctx, shot);
    drawDebris(ctx, run);
    if (run.completed >= 4 && run.completed % 6 >= 4) rain(ctx, run.clock);
    accents(ctx, effects);
  };
}
