import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from './run.mjs';

const word = text => ({ text, hint: 'Langsam sprechen und noch einmal versuchen.' });
const activeLetters = run => run.units.filter(unit => unit.type === 'letter' && !unit.gone && !unit.used);
const step = (run, seconds = 1 / 60) => game.tickRun(run, seconds);

function until(run, condition, description) {
  for (let frame = 0; frame < 1800 && run.alive && !condition(); frame++) step(run);
  assert.ok(condition(), description);
}

function spell(run) {
  const completed = run.completed;
  while (run.completed === completed) {
    until(run, () => activeLetters(run).length > 0, 'word offers letters');
    const expected = Array.from(game.taskFor(run).text)[run.letter];
    const correct = activeLetters(run).find(unit => unit.letter === expected);
    assert.ok(correct, 'next letter is available');
    if (run.mode === 'kart') {
      const index = run.letter;
      game.steer(run, correct.x);
      until(run, () => run.letter !== index, 'kart drives through the chosen lane');
    } else {
      assert.ok(game.touchUnit(run, correct.x, correct.y));
    }
  }
}

function nextMission(run, mode) {
  spell(run);
  until(run, () => run.mode === mode, 'arrived in ' + mode);
  return run;
}

test('the next selected word is announced and visible before any target can be used', () => {
  const tasks = [word('ab'), word('CD')];
  const run = game.newRun(tasks, () => .6, { selectTask: ({previous}) => previous ? tasks[0] : tasks[1] });
  assert.equal(game.taskFor(run).text, 'CD');
  assert.equal(run.events[0].task.text, 'CD');
  assert.ok(run.previewUntil - run.clock >= 2);
  step(run, 1.9);
  assert.equal(run.time, 85);
  assert.equal(activeLetters(run).length, 0);
  spell(run);
  until(run, () => game.taskFor(run).text === 'ab', 'selector advances after the word');
  assert.equal(activeLetters(run).length, 0);
  assert.ok(run.previewUntil - run.clock >= 2);
});

test('wrong answers deduct points once and block alternative scoring during the hint', () => {
  const run = game.newRun([word('ab')], () => .34);
  until(run, () => activeLetters(run).length > 0, 'first wave');
  const a = activeLetters(run).find(unit => unit.letter === 'a');
  game.touchUnit(run, a.x, a.y);
  until(run, () => activeLetters(run).length > 0, 'second wave');
  const wrong = activeLetters(run).find(unit => unit.letter !== 'b');
  const before = run.score;
  const timeBefore = run.time;
  game.touchUnit(run, wrong.x, wrong.y);
  const event = run.events.find(unit => unit.type === 'wrong');
  assert.ok(event.penalty > 0);
  assert.equal(run.score, before - event.penalty);
  assert.equal(run.time, timeBefore - 2);
  assert.equal(event.index, 1);
  const time = run.time;
  run.energy = 100;
  run.units.push({type: 'goodie', x: 100, y: 150});
  assert.equal(game.touchUnit(run, 100, 150), false);
  assert.equal(game.usePulse(run), false);
  step(run, .5);
  assert.equal(run.time, time);
  assert.equal(run.score, before - event.penalty);
  spell(run);
  assert.equal(run.events.find(event => event.type === 'word').errors, 1);
});

test('a hard pause discards pending presentation events and locks every simulation input', () => {
  const run = nextMission(game.newRun([word('a')], () => .43), 'kart');
  until(run, () => activeLetters(run).length > 0, 'kart choices ready');
  run.energy = 100;
  run.units.push({type: 'goodie', x: 65, y: 145, speed: 0});
  game.setPaused(run, true);
  assert.deepEqual(run.events, []);
  const frozen = JSON.stringify(run);
  game.touchUnit(run, 65, 145);
  game.steer(run, 36);
  game.traceLine(run, 100, 150);
  game.releaseLine(run);
  game.usePulse(run);
  step(run, 10);
  assert.equal(JSON.stringify(run), frozen);
  game.setPaused(run, false);
  step(run, .1);
  assert.equal(run.paused, false);
  assert.ok(game.touchUnit(run, 65, 145));
  assert.equal(run.energy, 100);
});

test('a fast obstacle crossing the edge of the kart body hits only when its path overlaps', () => {
  const run = nextMission(game.newRun([word('a')], () => .42), 'kart');
  until(run, () => activeLetters(run).length > 0, 'kart ready');
  run.units = [];
  run.shieldUntil = 0;
  const y = game.FIELD.playerY - 57;
  const rock = offset => ({type:'rock', x: run.playerX + offset, y, speed: 1800});
  run.units.push(rock(72));
  step(run, .09);
  assert.equal(run.health, 3);
  run.units.push(rock(39));
  step(run, .09);
  assert.equal(run.health, 2);
  assert.equal(game.FIELD.width, game.FIELD.height);
});

test('a foot shot leaves the blaster and armor absorbs a hit before a bug breaks apart', () => {
  const run = game.newRun([word('abc')], () => .77);
  until(run, () => activeLetters(run).length > 0, 'foot ready');
  run.units = run.units.filter(unit => unit.type !== 'letter');
  run.units.push({ id:24, type:'bug', kind:'armor', hp:2, maxHp:2, x:90, y:210, speed:0 });
  const bug = run.units.find(unit => unit.id === 24);
  const before = run.score;
  assert.ok(game.touchUnit(run, bug.x, bug.y));
  assert.ok(run.shots.length);
  assert.ok(run.recoilUntil > run.clock);
  assert.equal(bug.hp, 2);
  until(run, () => bug.hp === 1, 'first projectile cracks the shell');
  assert.equal(run.score, before);
  assert.ok(run.events.some(event => event.type === 'armor'));
  game.touchUnit(run, bug.x, bug.y);
  until(run, () => bug.gone, 'second projectile breaks the shell');
  assert.ok(run.score > before);
  assert.ok(run.events.some(event => event.type === 'hit' && event.kind === 'armor'));
});

test('kart side fire travels from the moving vehicle to a passing target', () => {
  const run = nextMission(game.newRun([word('a')], () => .44), 'kart');
  until(run, () => activeLetters(run).length > 0, 'kart ready');
  const bug = { id:500, type:'bug', kind:'runner', hp:1, maxHp:1, x:run.playerX + 83, y:game.FIELD.playerY - 4, speed:0 };
  run.units = [bug];
  step(run);
  assert.ok(run.shots.some(shot => shot.x > run.playerX && Math.abs(shot.y - bug.y) < 20));
  until(run, () => bug.gone, 'side shot reaches passing bug');
});

test('dismount connects tapped and dragged letters in order across pages, then resumes on foot', () => {
  const tasks = [word('a'), word('b'), word('Eisbeere')];
  const run = nextMission(game.newRun(tasks, () => .4), 'kart');
  nextMission(run, 'line');
  until(run, () => activeLetters(run).length > 0, 'letter board ready');
  assert.ok(activeLetters(run).length <= 6);
  const tile = letter => activeLetters(run).find(unit => unit.letter === letter);
  game.touchUnit(run, tile('i').x, tile('i').y);
  assert.equal(run.letter, 0);
  until(run, () => run.clock >= run.hintUntil, 'try again after hint');
  game.touchUnit(run, tile('E').x, tile('E').y);
  game.traceLine(run, tile('i').x, tile('i').y);
  assert.equal(run.letter, 2);
  assert.equal(run.linePath.length, 2);
  game.releaseLine(run);
  game.traceLine(run, tile('s').x, tile('s').y);
  assert.equal(run.letter, 2);
  nextMission(run, 'foot');
  assert.equal(run.completed, 3);
  assert.equal(run.events.filter(event => event.type === 'word').at(-1).assisted, true);
});

test('ending a paused round shows one summary and prevents restart by later input', () => {
  const run = game.newRun([word('ab')]);
  game.setPaused(run, true);
  assert.equal(typeof game.endRun, 'function');
  game.endRun(run);
  game.endRun(run);
  assert.equal(run.alive, false);
  assert.equal(run.events.filter(event => event.type === 'end').length, 1);
  step(run, 15);
  assert.equal(run.time, 85);
});

test('a letter in front of a bug receives the foot tap and the blaster aims at the chosen tile', () => {
  const run = game.newRun([word('ab')]);
  until(run, () => activeLetters(run).length > 0, 'foot ready');
  const tile = activeLetters(run).find(unit => unit.letter === 'a');
  const bug = {id:78, type:'bug', kind:'runner', hp:1, maxHp:1, x:tile.x + 2, y:tile.y, speed:0};
  run.units.unshift(bug);
  game.touchUnit(run, bug.x, bug.y);
  assert.equal(run.letter, 1);
  assert.equal(bug.hp, 1);
  assert.ok(run.recoilUntil > run.clock);
});
