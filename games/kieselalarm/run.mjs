export const FIELD = { width: 441, height: 441, playerY: 365 };
const LANES = [85, 220, 355];
const MISSIONS = ['foot', 'kart', 'line'];
const alphabet = Array.from('aeinrstldgpmubkowfvhzcjüäö');
const between = (value, min, max) => Math.min(max, Math.max(min, value));
const BUGS = {
  runner: {hp: 1, speed: 126, rx: 14, ry: 20, points: 20},
  wing: {hp: 2, speed: 95, rx: 20, ry: 15, points: 30},
  armor: {hp: 3, speed: 72, rx: 19, ry: 21, points: 45},
};

function mix(items, random) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

export function choicesFor(task, index, random) {
  const right = Array.from(task.text)[index];
  const upper = right === right.toUpperCase();
  const pool = [...(task.traps?.[index] ?? ''), ...mix(alphabet, random)];
  const options = new Set([right]);
  for (const letter of pool) {
    options.add(upper ? letter.toUpperCase() : letter);
    if (options.size === 3) break;
  }
  return mix(options, random);
}

export function newRun(tasks, random = Math.random, {selectTask} = {}) {
  const run = {
    tasks, random, selectTask, taskIndex: 0, task: null, completed: 0, streak: 0,
    errors: {}, time: 85, health: 3, energy: 0, score: 0, buffs: 0,
    mode: 'foot', playerX: 220, steerTo: 220, alive: true, paused: false, clock: 0, distance: 0,
    shieldUntil: 0, hintUntil: 0, events: [], serial: 0, gunAngle: -Math.PI / 2,
    recoilUntil: 0, sideFireAt: 0, debris: [], units: [], shots: [], linePath: [], tracing: false,
  };
  beginWord(run);
  return run;
}

export function taskFor(run) {
  return run.task;
}

function beginWord(run) {
  const previous = run.task;
  const mode = MISSIONS[run.completed % MISSIONS.length];
  run.taskIndex = run.completed;
  run.task = run.selectTask?.({previous, completed: run.completed, random: run.random})
    ?? run.tasks[run.taskIndex % run.tasks.length];
  if (run.mode !== mode) emit(run, 'mode', {mode});
  run.mode = mode;
  run.modeSince = run.clock;
  run.parkX = between(run.playerX, 55, FIELD.width - 55);
  if (mode === 'line') run.playerX = run.parkX + (run.parkX > 220 ? -62 : 62);
  run.gunSide = 1;
  run.letter = 0;
  run.assisted = false;
  run.wordErrors = 0;
  run.wordSeconds = 0;
  run.awaitingWord = false;
  run.previewUntil = run.clock + (run.task.speech ? 3.2 : 2.5);
  run.nextWave = run.previewUntil;
  run.enemyAt = run.previewUntil + .55;
  run.shieldUntil = run.previewUntil + .8;
  run.steerTo = run.playerX;
  run.gunAngle = mode === 'kart' ? 0 : -Math.PI / 2;
  run.units = [];
  run.shots = [];
  run.linePath = [];
  run.tracing = false;
  emit(run, 'speak', {task: run.task});
}

function canAct(run) {
  return run.alive && !run.paused && !run.awaitingWord &&
    run.clock >= run.previewUntil && run.clock >= run.hintUntil;
}

export function setPaused(run, paused) {
  if (!run.alive || run.paused === paused) return;
  run.paused = paused;
  run.tracing = false;
  run.steerTo = run.playerX;
  if (paused) run.events.length = 0;
}

export function steer(run, x) {
  if (canAct(run) && run.mode === 'kart' && Number.isFinite(x)) {
    run.steerTo = between(x, 34, FIELD.width - 34);
  }
}

function emit(run, type, detail = {}) {
  run.events.push({type, ...detail});
}

function add(run, body) {
  const unit = {id: ++run.serial, ...body};
  run.units.push(unit);
  return unit;
}

function spawnWave(run) {
  const kart = run.mode === 'kart';
  const pace = 1 + Math.min(run.completed, 12) * 0.015;
  choicesFor(run.task, run.letter, run.random).forEach((letter, lane) => add(run, {
    type: 'letter', letter, x: LANES[lane], y: 70, speed: (kart ? 139 : 95) * pace, lane,
  }));
}

function spawnBoard(run) {
  const next = Array.from(run.task.text).slice(run.letter, run.letter + 5);
  const distractor = mix(alphabet, run.random).find(letter => !next.includes(letter));
  const tiles = mix([...next, distractor], run.random);
  run.boardEnd = run.letter + next.length;
  run.linePath = [];
  run.tracing = false;
  run.units = [];
  // Six well-separated points on an oval let a straight drag pass between other tiles.
  tiles.forEach((letter, slot) => {
    const angle = -Math.PI / 2 + slot * Math.PI * 2 / tiles.length;
    add(run, {type:'letter', letter, slot, speed:0,
      x:220 + Math.cos(angle) * 137, y:215 + Math.sin(angle) * 101});
  });
}

function spawnHazard(run) {
  const x = LANES[Math.floor(run.random() * LANES.length)];
  const roll = run.random();
  if (roll < .19) {
    add(run, {type: 'goodie', x, y: -25, speed: 99});
  } else if (run.mode === 'kart' && roll < .36) {
    add(run, {type: 'rock', x, y: -34, speed: 137});
  } else {
    const kind = roll < .58 ? 'runner' : roll < .80 ? 'wing' : 'armor';
    const model = BUGS[kind];
    add(run, {type:'bug', kind, hp:model.hp, maxHp:model.hp, x, baseX:x, y:-30,
      speed:model.speed + (run.mode === 'kart' ? 25 : 0)});
  }
}

function collect(run, unit) {
  unit.gone = true;
  run.energy = Math.min(100, run.energy + 24);
  run.score += 15;
  run.time += 1.5;
  emit(run, 'goodie', {x: unit.x, y: unit.y});
}

function hurtBug(run, unit, damage = 1, drop = true) {
  const model = BUGS[unit.kind] ?? BUGS.runner;
  unit.hp = Math.max(0, (unit.hp ?? model.hp) - damage);
  unit.flashUntil = run.clock + .19;
  const detail = {x:unit.x, y:unit.y, kind:unit.kind, hp:unit.hp};
  run.debris.push({...detail, id:unit.id, born:run.clock});
  if (unit.hp > 0) {
    emit(run, unit.kind === 'armor' ? 'armor' : 'wound', detail);
    return;
  }
  unit.gone = true;
  run.score += model.points;
  emit(run, 'hit', detail);
  if (drop) add(run, {type:'goodie', x:unit.x, y:unit.y, speed:86});
}

function fire(run, target) {
  const kart = run.mode === 'kart';
  const x = run.playerX + (kart ? Math.sign(target.x - run.playerX) * 18 : 0);
  const y = FIELD.playerY + (kart ? 0 : -5);
  const angle = Math.atan2(target.y - y, target.x - x);
  run.gunAngle = angle;
  run.recoilUntil = run.clock + .19;
  run.gunSide = Math.sign(target.x - run.playerX) || 1;
  const muzzle = {x:x + Math.cos(angle) * 23, y:y + Math.sin(angle) * 23, angle};
  if (target.type === 'letter') {
    run.traceShot = {...muzzle, endX:target.x, endY:target.y, born:run.clock};
  } else {
    run.shots.push({...muzzle, target});
  }
  emit(run, 'shot', {x, y, mode:run.mode});
}

function updateShots(run, delta) {
  run.shots = run.shots.filter(shot => {
    const bug = shot.target;
    if (bug.gone) return false;
    const dx = bug.x - shot.x;
    const dy = bug.y - shot.y;
    const distance = Math.hypot(dx, dy);
    const travel = 830 * delta;
    if (distance <= travel + 10) {
      hurtBug(run, bug);
      return false;
    }
    shot.angle = Math.atan2(dy, dx);
    shot.x += dx / distance * travel;
    shot.y += dy / distance * travel;
    return true;
  });
}

function hitPlayer(run, unit) {
  unit.gone = true;
  if (run.clock < run.shieldUntil) return;
  run.shieldUntil = run.clock + 1.25;
  run.health--;
  emit(run, 'damage', {x:run.playerX, y:FIELD.playerY});
  if (run.health <= 0) endRun(run);
}

function takeLetter(run, unit) {
  const task = run.task;
  const letters = Array.from(task.text);
  const index = run.letter;
  const expected = letters[index];
  const line = run.mode === 'line';
  if (!line) {
    for (const tile of run.units) if (tile.type === 'letter') tile.gone = true;
  }
  if (unit.letter !== expected) {
    const penalty = 10;
    const timePenalty = 2;
    run.score -= penalty;
    run.time = Math.max(0, run.time - timePenalty);
    run.streak = 0;
    run.assisted = true;
    run.wordErrors++;
    run.errors[task.text] = task.hint;
    run.tracing = false;
    run.hintUntil = run.clock + 3.2;
    run.nextWave = run.hintUntil;
    emit(run, 'wrong', {x:unit.x, y:unit.y, task, expected, given:unit.letter, index, penalty, timePenalty});
    return;
  }
  if (line) {
    unit.used = true;
    run.linePath.push({x:unit.x, y:unit.y});
  }
  run.letter++;
  run.score += 10;
  emit(run, 'letter', {x:unit.x, y:unit.y, letter:expected});
  run.nextWave = run.clock + (line ? .38 : .20);
  if (run.letter !== letters.length) {
    if (line && run.letter === run.boardEnd) {
      run.tracing = false;
      for (const tile of run.units) if (!tile.used) tile.gone = true;
    }
    return;
  }

  run.completed++;
  run.awaitingWord = true;
  run.nextWordAt = run.clock + .95;
  run.streak = run.assisted ? 0 : run.streak + 1;
  run.time += 4;
  run.energy = Math.min(100, run.energy + 21);
  run.score += 50;
  const boosted = run.streak !== 0 && run.streak % 5 === 0;
  if (boosted) run.buffs = 7;
  emit(run, 'word', {task, streak:run.streak, boosted, assisted:run.assisted,
    errors:run.wordErrors, seconds:run.wordSeconds});
}

export function usePulse(run) {
  if (!canAct(run) || run.mode === 'line' || run.energy < 100) return false;
  run.energy = 0;
  run.shieldUntil = run.clock + 3;
  for (const unit of run.units) {
    if (unit.gone) continue;
    if (unit.type === 'bug') hurtBug(run, unit, Infinity, false);
    if (unit.type === 'rock') unit.gone = true;
  }
  emit(run, 'pulse', {x:run.playerX, y:FIELD.playerY});
  return true;
}

function pickAt(run, x, y) {
  let best;
  let nearest = Infinity;
  for (const unit of run.units) {
    if (unit.gone || unit.used || unit.type === 'rock') continue;
    if (unit.type === 'letter' && (run.mode === 'kart' || run.letter === run.boardEnd && run.mode === 'line')) continue;
    const dx = Math.abs(x - unit.x);
    const dy = Math.abs(y - unit.y);
    const distance = Math.hypot(dx, dy);
    const inTile = run.mode === 'line' ? distance <= 29 : dx <= 29 && dy <= 29 && distance <= 38;
    const hit = unit.type === 'letter' ? inTile : distance <= (unit.type === 'goodie' ? 23 : 27);
    if (!hit) continue;
    // Tiles are painted above enemies. Target the face the player can see.
    if (unit.type === 'letter') return unit;
    if (distance < nearest) {
      nearest = distance;
      best = unit;
    }
  }
  return best;
}

export function touchUnit(run, x, y) {
  if (!canAct(run)) return false;
  const unit = pickAt(run, x, y);
  if (run.mode === 'line') run.tracing = !!unit;
  if (!unit) return false;
  if (unit.type === 'letter') {
    if (run.mode === 'foot') fire(run, unit);
    takeLetter(run, unit);
  } else if (unit.type === 'bug') fire(run, unit);
  else collect(run, unit);
  return true;
}

export function traceLine(run, x, y) {
  if (!canAct(run) || run.mode !== 'line' || !run.tracing) return false;
  const unit = pickAt(run, x, y);
  if (!unit) return false;
  takeLetter(run, unit);
  return true;
}

export function releaseLine(run) {
  if (!run.paused) run.tracing = false;
}

// Relative movement in an ellipse expanded by the player's hull catches crossings between frames.
function crossesPlayer(unit, oldX, oldY, run, oldPlayerX) {
  const kart = run.mode === 'kart';
  const bug = BUGS[unit.kind] ?? BUGS.runner;
  const dims = unit.type === 'bug' ? [bug.rx, bug.ry] :
    unit.type === 'rock' ? [28, 19] : unit.type === 'goodie' ? [13, 14] : [25, 24];
  const rx = (kart ? 23 : 13) + dims[0];
  const ry = (kart ? 28 : 20) + dims[1];
  const startX = (oldX - oldPlayerX) / rx;
  const startY = (oldY - FIELD.playerY) / ry;
  const dx = (unit.x - run.playerX) / rx - startX;
  const dy = (unit.y - FIELD.playerY) / ry - startY;
  const length = dx * dx + dy * dy;
  const nearest = length ? between(-(startX * dx + startY * dy) / length, 0, 1) : 0;
  return (startX + dx * nearest) ** 2 + (startY + dy * nearest) ** 2 <= 1;
}

export function endRun(run) {
  if (!run.alive) return;
  run.paused = false;
  run.alive = false;
  run.tracing = false;
  emit(run, 'end');
}

function advance(run, delta) {
  run.clock += delta;
  run.debris = run.debris.filter(piece => run.clock - piece.born < .55);
  if (run.clock < run.hintUntil) return;
  const kart = run.mode === 'kart';
  run.distance += delta * (kart ? 160 : run.mode === 'line' ? 26 : 69);
  if (run.awaitingWord) {
    if (run.clock >= run.nextWordAt) beginWord(run);
    return;
  }
  if (run.clock < run.previewUntil) return;
  run.time = Math.max(0, run.time - delta);
  run.wordSeconds += delta;
  if (!run.time) {
    endRun(run);
    return;
  }
  run.buffs = Math.max(0, run.buffs - delta);
  if (run.mode === 'line') {
    if (run.clock >= run.nextWave && (!run.units.length || run.letter === run.boardEnd)) spawnBoard(run);
    return;
  }

  const oldPlayerX = run.playerX;
  const target = kart ? run.steerTo : 220 + Math.sin(run.clock * 1.1) * 65;
  run.playerX += between(target - run.playerX, -480 * delta, 480 * delta);
  updateShots(run, delta);
  for (const unit of run.units) {
    if (unit.gone) continue;
    const oldX = unit.x;
    const oldY = unit.y;
    unit.y += unit.speed * delta;
    if (unit.type === 'letter' && !kart) unit.x = LANES[unit.lane] + Math.sin(unit.y * .02 + unit.lane) * 10;
    if (unit.kind === 'wing' && unit.baseX !== undefined) unit.x = unit.baseX + Math.sin(unit.y * .027) * 27;
    if (unit.type !== 'letter' || kart) {
      if (crossesPlayer(unit, oldX, oldY, run, oldPlayerX)) {
        if (unit.type === 'letter') takeLetter(run, unit);
        else if (unit.type === 'goodie') collect(run, unit);
        else if (unit.type === 'bug' && run.buffs > 0) hurtBug(run, unit, Infinity, false);
        else hitPlayer(run, unit);
      }
    }
    if (!canAct(run)) break;
    if (unit.y > FIELD.height + 38) unit.gone = true;
  }
  run.units = run.units.filter(unit => !unit.gone);
  if (!canAct(run)) return;
  if (kart && run.clock >= run.sideFireAt) {
    const passing = run.units.find(unit => unit.type === 'bug' &&
      Math.abs(unit.y - FIELD.playerY) < 44 && Math.abs(unit.x - run.playerX) > 39);
    if (passing) {
      fire(run, passing);
      run.sideFireAt = run.clock + .40;
    }
  }
  if (run.clock >= run.nextWave && !run.units.some(unit => unit.type === 'letter')) spawnWave(run);
  if (run.clock >= run.enemyAt) {
    spawnHazard(run);
    run.enemyAt = run.clock + (kart ? 1.65 : 1.85);
  }
}

export function tickRun(run, delta) {
  if (!run.alive || run.paused || !Number.isFinite(delta) || delta <= 0) return;
  // Bound the physics step across refresh rates and delayed input frames.
  while (delta > 0 && run.alive) {
    const interval = Math.min(delta, 1 / 30);
    advance(run, interval);
    delta -= interval;
  }
}
