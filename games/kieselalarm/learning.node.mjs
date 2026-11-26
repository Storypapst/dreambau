import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS } from './words.mjs';

import { EXTRA_TASKS } from './vocabulary.mjs';
import { createProfile, taskId, taskPattern, recordAttempt, selectTask, reviewTasks, wordStatus } from './learning.mjs';

const day = 86_400_000;

test('all added words can be played with unique IDs, usable hints and position-specific decoys', () => {
  assert.ok(EXTRA_TASKS.length >= 120, 'at least 120 new spellings');
  const all = [...TASKS, ...EXTRA_TASKS];
  assert.equal(new Set(all.map(taskId)).size, all.length);
  assert.equal(new Set(all.map(task => task.text.toLocaleLowerCase('de-DE'))).size, all.length);
  for (const task of EXTRA_TASKS) {
    assert.match(task.text, /^\p{L}+$/u);
    assert.ok(task.hint.length > 12, task.text);
    assert.ok([1, 2, 3].includes(task.level) && task.level === task.tier, task.text);
    assert.ok(Object.keys(task.traps).length >= 1, task.text);
    for (const [position, alternatives] of Object.entries(task.traps)) {
      const target = [...task.text][position];
      assert.ok(target && /^[\p{L}]+$/u.test(alternatives), task.text);
      assert.ok(!alternatives.toLowerCase().includes(target.toLowerCase()), task.text);
    }
  }
  for (const tier of [1, 2, 3]) {
    const available = EXTRA_TASKS.filter(word => word.level === tier);
    assert.ok(available.length >= 30 && new Set(available.map(taskPattern)).size >= 5);
  }
});

test('mistakes preserve the actual confusion and are prioritised in an end-of-run review', () => {
  const profile = createProfile();
  const [rad, hund] = TASKS;
  recordAttempt(profile, rad, { correct: false, given: 't', expected: 'd', index: 2 }, 12);
  recordAttempt(profile, rad, { correct: true, review: true }, 13);
  recordAttempt(profile, hund, { correct: false, given: 't', expected: 'd', index: 3 }, 14);
  const restored = createProfile(JSON.parse(JSON.stringify(profile)));
  const stats = restored.wordStats[taskId(hund)];
  assert.equal(stats.errors, 1);
  assert.deepEqual(stats.lastError, { given: 't', expected: 'd', index: 3, at: 14 });
  assert.equal(stats.errorsByIndex[3].count, 1);
  assert.equal(wordStatus(hund, restored), 'practice');
  assert.deepEqual(reviewTasks(TASKS, restored, { limit: 1 }), [hund]);
  assert.deepEqual(reviewTasks(TASKS, restored, { ids: [taskId(rad)] }), [rad]);
  assert.equal(wordStatus(rad, restored), 'learning');
  assert.equal(wordStatus(TASKS[2], restored), 'new');
});

test('only spaced successes advance mastery and an independent miss brings a secure word back', () => {
  const profile = createProfile(), rad = TASKS[0];
  const pass = (at, review = false) => recordAttempt(profile, rad, { correct: true, review }, at);
  pass(0);
  const firstDue = profile.wordStats[taskId(rad)].dueAt;
  pass(1000); pass(2000, true);
  assert.equal(wordStatus(rad, profile), 'learning');
  assert.equal(profile.wordStats[taskId(rad)].dueAt, firstDue);
  pass(firstDue);
  const secondDue = profile.wordStats[taskId(rad)].dueAt;
  assert.ok(secondDue - firstDue > firstDue);
  pass(secondDue);
  assert.equal(wordStatus(rad, profile), 'secure');
  recordAttempt(profile, rad, { correct: false, index: 2, given: 't' }, secondDue + 1);
  assert.equal(wordStatus(rad, profile), 'practice');
  assert.equal(profile.wordStats[taskId(rad)].lastError.expected, 'd');
});

test('selection transfers a weak spelling to an unfamiliar word and returns to the original when due', () => {
  const profile = createProfile();
  const [rad, hund] = TASKS;
  const wiese = EXTRA_TASKS.find(task => task.text === 'Wiese');
  recordAttempt(profile, rad, { correct: false, given: 't', index: 2 }, 10);
  const pool = [rad, wiese, hund];
  const choose = (now, roll, extras) => selectTask(pool, profile, { now, random: () => roll, ...extras });
  assert.equal(choose(11, .42), hund);
  assert.equal(choose(11, .66, { excludeIds: [taskId(hund)] }), wiese);
  // Two alternatives keep the word out of the immediate sequence. Later it
  // can recur even when the entire small pool has recently been played.
  recordAttempt(profile, wiese, { correct: true }, 12);
  recordAttempt(profile, hund, { correct: true }, 13);
  assert.equal(choose(day, .1), rad);
  assert.equal(choose(day, .1, { excludeIds: pool.map(taskId) }), undefined);
});

test('a typo outside the target spelling does not label every word of that pattern as weak', () => {
  const profile = createProfile();
  recordAttempt(profile, TASKS[0], { correct: false, index: 0, given: 'H' }, 0);
  assert.ok(!profile.patternStats[taskPattern(TASKS[0])]?.need);
  assert.equal(wordStatus(TASKS[0], profile), 'practice');
});

test('different independently spelled words unlock higher tiers across sessions', () => {
  let profile = createProfile();
  const all = [...TASKS, ...EXTRA_TASKS];
  const beginner = all.filter(task => task.level === 1);
  for (const [i, task] of beginner.slice(0, 12).entries())
    recordAttempt(profile, task, { correct: true, review: true }, i * day);
  assert.equal(profile.tier, 1);
  for (const [i, task] of beginner.slice(0, 12).entries())
    recordAttempt(profile, task, { correct: true }, (20 + i) * day);
  profile = createProfile(JSON.parse(JSON.stringify(profile)));
  assert.equal(profile.tier, 2);
  const advanced = all.filter(task => task.level === 3);
  const medium = all.filter(task => task.level === 2);
  assert.equal(selectTask([advanced[0], medium[0]], profile, { now: 40 * day, random: () => .4 }), medium[0]);
  for (const [i, task] of medium.slice(0, 16).entries())
    recordAttempt(profile, task, { correct: true }, (40 + i) * day);
  assert.equal(profile.tier, 3);
  assert.equal(selectTask(advanced, profile, { now: 70 * day, random: () => .67 }).level, 3);
});

test('external recent IDs keep the current word out even if it had no attempt yet', () => {
  const [rad, hund] = TASKS;
  assert.equal(selectTask([rad, hund], createProfile(), { recentIds: [taskId(rad)], now: 0, random: () => 0 }), hund);
});

test('assisted completions preserve the miss and correctly spelled whole-word reviews recover it', () => {
  const profile = createProfile(), rad = TASKS[0];
  recordAttempt(profile, rad, { correct: false, given: 'Rat', expected: 'Rad', review: true }, 250);
  const stats = profile.wordStats[taskId(rad)];
  assert.deepEqual(stats.lastError, { at: 250, given: 't', expected: 'd', index: 2 });
  recordAttempt(profile, rad, { correct: true, assisted: true }, 254);
  assert.equal(wordStatus(rad, profile), 'practice');
  assert.equal(stats.attempts, 1);
  recordAttempt(profile, rad, { correct: true, review: true }, 300);
  assert.equal(wordStatus(rad, profile), 'learning');
  assert.equal(stats.clean, 0);
  assert.deepEqual(profile, createProfile(JSON.parse(JSON.stringify(profile))));
});
