import { FIELD, newRun, steer, taskFor, tickRun, touchUnit, usePulse, setPaused, traceLine, releaseLine, endRun } from './run.mjs';
import { makeScene } from './scene.mjs';
import { TASKS } from './words.mjs';
import { EXTRA_TASKS } from './vocabulary.mjs';
import { SPEECH_CLIPS } from './speech-clips.mjs';
import { selectTask, taskId, taskPattern, wordStatus, reviewTasks } from './learning.mjs';
import { listLearners, currentLearner, selectLearner, addLearner, learnerProgress, bonusFor, claimBonus, awardBonus, recordAnswer, queueSync, networkRestored, saveStatus, exportLearner, importLearner } from './profiles.mjs';
import { makeReview } from './review.mjs';

const el = id => document.getElementById(id);
const catalog = [...TASKS, ...EXTRA_TASKS];
const field = el('field');
const scene = makeScene(field.getContext('2d'));
const media = new Audio();
media.preload = 'auto';
media.preservesPitch = true;
const keys = new Set();
const tones = new Set();
const statusLabels = { new: 'Neu', practice: 'Stolperstelle', learning: 'In Übung', secure: 'Sicher' };
const modes = {
  foot: ['Zu Fuß', 'Tippe den nächsten Buchstaben, Käfer oder Zeitbonus an. Tastatur: 1–3 wählen eine Spur.'],
  kart: ['Dosenkart', 'Ziehe das Kart zum richtigen Buchstaben. Die Pfeiltasten lenken, 1–3 wählen eine Spur. Tippe Käfer für einen Schuss an.'],
  line: ['Sternenlinie', 'Ziehe eine Linie durch die Buchstaben in Schreibreihenfolge. Du kannst sie auch einzeln antippen oder mit 1–6 wählen.'],
};

let screen = 'menu';
let learner = currentLearner();
let profile = learnerProgress(learner, catalog);
let run, pointer, lastPoint, lastTime, bannerUntil = 0, effects = [], recentIds = [], mistakeIds = new Set(), accessKey = '';
let voiceBoost = false, audioContext, speechGain, audioRequest = 0;

function write(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function stopAudio() {
  audioRequest++;
  media.pause();
  window.speechSynthesis?.cancel();
  for (const oscillator of tones) { try { oscillator.stop(); } catch {} }
  tones.clear();
  el('audio-status').hidden = true;
}

function setupAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    if (!audioContext) {
      audioContext = new Context();
      const stream = audioContext.createMediaElementSource(media);
      speechGain = audioContext.createGain();
      speechGain.gain.value = voiceBoost ? 2.25 : 1;
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -8;
      stream.connect(speechGain).connect(compressor).connect(audioContext.destination);
    }
    audioContext.resume().catch(() => {});
  } catch { speechGain = undefined; }
}

function speak(task, slow = false) {
  if (!task || document.hidden || screen === 'paused') return;
  const request = ++audioRequest;
  window.speechSynthesis?.cancel();
  media.pause();
  el('audio-status').hidden = true;
  function unavailable() {
    if (request !== audioRequest) return;
    if (screen === 'playing' && run?.task === task && !run.awaitingWord) run.assisted = true;
    if (screen === 'review') review.markRevealed(task);
    write(el('audio-status'), 'Ton nicht verfügbar. Das Wort lautet „' + task.text + '“.');
    el('audio-status').hidden = false;
  }
  function nativeVoice() {
    if (request !== audioRequest || screen === 'paused' || document.hidden) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { unavailable(); return; }
    const voices = window.speechSynthesis.getVoices();
    const german = voices.find(voice => /^de[-_]/i.test(voice.lang) && voice.localService)
      ?? voices.find(voice => /^de(?:[-_]|$)/i.test(voice.lang));
    if (voices.length && !german) { unavailable(); return; }
    const spoken = new SpeechSynthesisUtterance(slow ? task.text : (task.speech ?? task.text));
    if (german) spoken.voice = german;
    spoken.lang = 'de-DE';
    spoken.rate = slow ? .64 : .87;
    spoken.onerror = unavailable;
    window.speechSynthesis.speak(spoken);
  }
  const audio = task.audio || SPEECH_CLIPS[task.text];
  if (!audio) { nativeVoice(); return; }
  media.src = audio;
  media.playbackRate = slow ? .68 : .94;
  media.play().catch(nativeVoice);
}

function tone(frequencies, volume = .04) {
  if (screen !== 'playing' || audioContext?.state !== 'running') return;
  frequencies.forEach((frequency, index) => {
    const t = audioContext.currentTime + index * .073;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + .15);
    oscillator.connect(gain).connect(audioContext.destination);
    tones.add(oscillator);
    oscillator.onended = () => { tones.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(t);
    oscillator.stop(t + .16);
  });
}

function releaseInput() {
  keys.clear();
  if (run) releaseLine(run);
  const id = pointer;
  pointer = undefined;
  lastPoint = undefined;
  if (id !== undefined) { try { field.releasePointerCapture(id); } catch {} }
}

function changeScreen(next) {
  stopAudio();
  releaseInput();
  screen = next;
  for (const id of ['menu', 'profiles', 'words', 'review', 'end']) el(id).hidden = next !== id;
  el('arena').hidden = !['menu', 'playing', 'paused'].includes(next);
  el('pause-screen').hidden = next !== 'paused';
  el('home-actions').hidden = next !== 'menu';
  el('profiles-open').hidden = next !== 'menu';
  for (const id of ['hud', 'console', 'mode', 'pause']) el(id).hidden = next !== 'playing';
  for (const id of ['banner', 'preview', 'hint', 'home-bonus']) el(id).hidden = true;
  field.tabIndex = next === 'playing' ? 0 : -1;
  el('arena').dataset.penalty = 'false';
  lastTime = undefined;
}

function refreshProfile() {
  profile = learnerProgress(learner, catalog);
  const name = listLearners().find(item => item.id === learner)?.name ?? 'Spielprofil';
  write(el('home-name'), name);
  const count = Object.keys(profile.wordStats).length;
  write(el('home-level'), 'Lernstufe ' + profile.tier + ' · ' + count + (count === 1 ? ' Wort' : ' Wörter') + ' geübt');
  const bonus = bonusFor(learner);
  el('home-bonus').hidden = screen !== 'menu' || !bonus;
  write(el('home-bonus'), '+' + bonus + ' Sekunden für deine nächste Runde');
  write(el('save-status'), saveStatus(learner));
  if (screen === 'words') renderWords();
}

function home() {
  changeScreen('menu');
  run = undefined;
  effects = [];
  refreshProfile();
  queueSync(learner);
  el('start').focus({ preventScroll: true });
}

function chooseTask({ previous, random }) {
  const task = selectTask(catalog, profile, { random, recentIds, excludeIds: previous ? [taskId(previous)] : [] });
  recentIds = [...recentIds.slice(-3), taskId(task)];
  return task;
}

function start() {
  setupAudio();
  refreshProfile();
  recentIds = [];
  mistakeIds = new Set();
  run = newRun(catalog, Math.random, { selectTask: chooseTask });
  run.time += claimBonus(learner);
  effects = [];
  accessKey = '';
  changeScreen('playing');
  drawHUD(true);
  consumeEvents();
  field.focus({ preventScroll: true });
}

function pause() {
  if (screen !== 'playing' || !run?.alive) return;
  consumeEvents();
  if (!run.alive) return;
  setPaused(run, true);
  changeScreen('paused');
  el('resume').focus({ preventScroll: true });
}

function resume() {
  if (screen !== 'paused' || document.hidden || !run?.alive) return;
  setupAudio();
  setPaused(run, false);
  changeScreen('playing');
  drawHUD(true);
  if (run.clock < run.hintUntil) { el('hint').hidden = false; speak(taskFor(run), true); }
  else if (run.clock < run.previewUntil) speak(taskFor(run));
  field.focus({ preventScroll: true });
}

function effect(x, y, color, label = '', ring = false) {
  effects.push({ x, y, color, label, ring, age: 0, life: ring ? .65 : .55 });
}

function banner(message, seconds = 1.35) {
  write(el('banner'), message);
  el('banner').hidden = false;
  bannerUntil = run.clock + seconds;
}

function lineButtons() {
  const host = el('line-access');
  const units = run.mode === 'line' && run.clock >= run.previewUntil && !run.awaitingWord
    ? run.units.filter(unit => unit.type === 'letter' && !unit.gone) : [];
  const key = units.map(unit => unit.id + ':' + Boolean(unit.used)).join(',') + ':' + (run.clock < run.hintUntil);
  host.hidden = !units.length;
  if (key === accessKey) return;
  accessKey = key;
  const focused = host.contains(document.activeElement) ? Number(document.activeElement.dataset.slot) : -1;
  host.replaceChildren(...units.map(unit => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary'; button.dataset.slot = unit.slot;
    button.textContent = unit.letter;
    button.disabled = !!unit.used || run.clock < run.hintUntil;
    button.setAttribute('aria-label', unit.letter + ', Taste ' + (unit.slot + 1));
    return button;
  }));
  if (focused >= 0) (host.querySelector('[data-slot="' + focused + '"]:enabled') ?? host.querySelector('button:enabled') ?? field).focus({ preventScroll: true });
}

function drawHUD(updateSlots = false) {
  const seconds = Math.ceil(Math.max(0, run.time));
  write(el('clock'), Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'));
  write(el('score'), run.score + ' Pkt.');
  write(el('lives'), '◆ '.repeat(Math.max(0, run.health)) + '◇ '.repeat(Math.max(0, 3 - run.health)));
  el('lives').setAttribute('aria-label', run.health + ' Trefferpunkte');
  write(el('mode'), modes[run.mode][0]);
  write(el('controls'), modes[run.mode][1]);
  const charge = Math.floor(run.energy);
  el('charge').style.transform = 'scaleX(' + charge / 100 + ')';
  el('pulse').disabled = charge < 100 || run.mode === 'line' || run.awaitingWord || run.clock < Math.max(run.hintUntil, run.previewUntil);
  el('pulse').setAttribute('aria-label', 'Impuls ' + charge + ' Prozent');
  el('preview').hidden = run.clock >= run.previewUntil;
  el('arena').dataset.penalty = String(run.clock < run.hintUntil);
  if (run.clock >= run.hintUntil) el('hint').hidden = true;
  if (run.clock >= bannerUntil) el('banner').hidden = true;
  lineButtons();
  if (!updateSlots) return;
  const letters = [...taskFor(run).text];
  el('slots').setAttribute('aria-label', 'Gesammelt: ' + (letters.slice(0, run.letter).join('') || 'noch keine') + ', ' + letters.length + ' Buchstaben insgesamt');
  el('slots').replaceChildren(...letters.map((letter, index) => {
    const node = document.createElement('span');
    node.className = 'slot ' + (index < run.letter ? 'done' : index === run.letter ? 'current' : '');
    node.textContent = index < run.letter ? letter : '';
    return node;
  }));
}

function consumeEvents() {
  for (const event of run.events.splice(0)) {
    switch (event.type) {
      case 'speak':
        write(el('preview-word'), [...event.task.text].length + ' Buchstaben');
        speak(event.task);
        drawHUD(true);
        break;
      case 'letter':
        effect(event.x, event.y, '#e4ef83', event.letter);
        tone([330 * 2 ** ((run.letter % 7) / 12)]);
        drawHUD(true);
        break;
      case 'wrong': {
        mistakeIds.add(taskId(event.task));
        recordAnswer(learner, profile, event.task, { correct: false, given: event.given, expected: event.expected, index: event.index });
        const verdict = document.createElement('strong');
        verdict.textContent = event.given + ' → ' + event.expected + ' · −' + event.penalty + ' Punkte · −' + event.timePenalty + ' s';
        el('hint').replaceChildren(verdict, document.createTextNode(event.task.hint));
        el('hint').hidden = false;
        speak(event.task, true);
        effect(event.x, event.y, '#f58a6c', '−' + event.penalty);
        break;
      }
      case 'word':
        recordAnswer(learner, profile, event.task, { correct: true, assisted: event.assisted });
        banner(event.boosted ? 'Glühspur · 7 s' : (event.streak >= 2 ? event.streak + ' in Serie · ' : '') + '+4 s');
        tone([440, 554, 660]); break;
      case 'mode': releaseInput(); banner(modes[event.mode][0], 1.5); break;
      case 'shot': tone([170], .014); break;
      case 'armor': case 'wound': tone([215], .022); break;
      case 'hit': effect(event.x, event.y, '#ffb277'); tone([224, 142], .025); break;
      case 'goodie': effect(event.x, event.y, '#65e4c3', '+1,5 s'); tone([510, 680], .03); break;
      case 'damage': effect(event.x, event.y, '#f58a6c', '−1 Herz'); tone([125, 91]); break;
      case 'pulse': effect(event.x, event.y, '#65e4c3', '', true); tone([156, 247, 523], .055); break;
      case 'end': finishRound(); break;
    }
  }
}

const review = makeReview(el('review'), {
  speak, answer: (task, attempt) => recordAnswer(learner, profile, task, attempt),
  finish(award) { awardBonus(learner, award.seconds); results(award); },
});

function finishRound() {
  const missed = reviewTasks(catalog, profile, { ids: [...mistakeIds] });
  if (!missed.length) { results(); return; }
  changeScreen('review');
  review.start(missed);
}

function results(award) {
  changeScreen('end');
  write(el('summary'), run.completed + (run.completed === 1 ? ' Wort' : ' Wörter') + ' geschafft · ' + run.score + ' Punkte');
  const missed = catalog.filter(task => mistakeIds.has(taskId(task))).map(task => task.text);
  write(el('mistakes'), missed.length ? 'Deine Fehlerwörter: ' + missed.join(' · ') : 'Kein Buchstabe falsch gewählt.');
  el('award').hidden = !award;
  if (award) write(el('award'), award.clean + (award.clean === 1 ? ' Wort' : ' Wörter') + ' auf Anhieb richtig · ' + award.clean + ' × 5 s' + (award.multiplier > 1 ? ' × ' + award.multiplier : '') + ' = +' + award.seconds + ' s für die nächste Runde');
  el('again').focus({ preventScroll: true });
}

function renderWords() {
  const expanded = new Set([...el('word-list').querySelectorAll('details[open]')].map(node => node.dataset.word));
  const filter = el('word-filter').value, term = el('word-search').value.trim().toLocaleLowerCase('de');
  const name = listLearners().find(item => item.id === learner)?.name;
  const now = Date.now();
  const rows = catalog.map(task => {
    const status = wordStatus(task, profile), stats = profile.wordStats[taskId(task)];
    return { task, stats, status, due: !!stats && stats.dueAt <= now };
  });
  write(el('words-summary'), name + ' · Lernstufe ' + profile.tier + ' · ' + rows.filter(row => row.due).length + ' zur Wiederholung fällig');
  const filtered = rows.filter(({ task, status, due }) => task.text.toLocaleLowerCase('de').includes(term)
    && (!filter || (filter === 'due' ? due : status === filter))).sort((a, b) => a.task.text.localeCompare(b.task.text, 'de'));
  const nodes = filtered.map(({ task, stats, status, due }) => {
    const details = document.createElement('details'), summary = document.createElement('summary'), label = document.createElement('span');
    details.dataset.word = taskId(task);
    details.open = expanded.has(taskId(task));
    label.className = 'word-state'; label.textContent = statusLabels[status] + (due ? ' · fällig' : '');
    summary.append(document.createTextNode(task.text), label);
    const meta = document.createElement('p'); meta.className = 'word-meta';
    meta.textContent = taskPattern(task) + ' · Stufe ' + (task.tier ?? task.level);
    const hint = document.createElement('p'); hint.textContent = task.hint;
    details.append(summary, meta, hint);
    if (task.speech) { const example = document.createElement('p'); example.textContent = task.speech; details.append(example); }
    if (stats?.lastError) {
      const err = stats.lastError, error = document.createElement('p');
      error.textContent = 'Letzte Stolperstelle: „' + (err.given || '–') + '“ statt „' + (err.expected || '–') + '“' + (Number.isInteger(err.index) ? ' an Platz ' + (err.index + 1) : '') + '.';
      details.append(error);
    }
    const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'secondary'; listen.textContent = 'Langsam anhören';
    listen.addEventListener('click', () => { setupAudio(); speak(task, true); });
    details.append(listen);
    return details;
  });
  if (!nodes.length) { const none = document.createElement('p'); none.textContent = 'Hier gibt es gerade keine passenden Wörter.'; nodes.push(none); }
  el('word-list').replaceChildren(...nodes);
}

function profilesView() {
  const select = el('profile-select');
  select.replaceChildren(...listLearners().map(item => {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option;
  }));
  select.value = learner;
  refreshProfile();
}

function fieldPoint(event) {
  const bounds = field.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) * FIELD.width / bounds.width, y: (event.clientY - bounds.top) * FIELD.height / bounds.height };
}

function selectPosition(slot) {
  if (screen !== 'playing' || !run?.alive) return;
  if (run.mode === 'kart') {
    if (slot <= 2) steer(run, [85, 220, 355][slot]);
  } else {
    const unit = run.units.find(item => item.type === 'letter' && !item.gone && !item.used && (run.mode === 'line' ? item.slot : item.lane) === slot);
    if (unit) { touchUnit(run, unit.x, unit.y); releaseLine(run); }
  }
  consumeEvents();
  drawHUD();
}

field.addEventListener('pointerdown', event => {
  if (screen !== 'playing' || !run?.alive || pointer !== undefined || event.button !== 0) return;
  event.preventDefault();
  field.focus({ preventScroll: true });
  try { field.setPointerCapture(event.pointerId); } catch {}
  pointer = event.pointerId;
  lastPoint = fieldPoint(event);
  if (!touchUnit(run, lastPoint.x, lastPoint.y)) steer(run, lastPoint.x);
  consumeEvents();
  drawHUD();
});
function movePointer(event) {
  if (screen !== 'playing' || !run?.alive || pointer !== event.pointerId) return;
  if (run.mode === 'kart') { steer(run, fieldPoint(event).x); return; }
  if (run.mode !== 'line') return;
  const path = event.getCoalescedEvents?.() ?? [];
  for (const sample of [...path, event]) {
    const next = fieldPoint(sample), start = lastPoint ?? next;
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - start.x, next.y - start.y) / 12));
    for (let i = 1; i <= steps && run.tracing; i++) {
      traceLine(run, start.x + (next.x - start.x) * i / steps, start.y + (next.y - start.y) * i / steps);
    }
    lastPoint = next;
  }
  consumeEvents();
  drawHUD();
}
field.addEventListener('pointermove', movePointer);
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) field.addEventListener(type, event => {
  if (pointer !== event.pointerId) return;
  if (type === 'pointerup' && run.mode === 'line') movePointer(event);
  releaseInput();
});
el('line-access').addEventListener('click', event => {
  const button = event.target.closest('[data-slot]');
  if (button && !button.disabled) selectPosition(Number(button.dataset.slot));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (screen === 'playing' || screen === 'paused')) {
    event.preventDefault();
    if (!event.repeat) { if (screen === 'playing') pause(); else resume(); }
    return;
  }
  if (screen !== 'playing' || !run?.alive || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    keys.add(event.key); event.preventDefault();
  } else if (/^[1-6]$/.test(event.key)) {
    if (!event.repeat) selectPosition(Number(event.key) - 1);
    event.preventDefault();
  } else if (event.key === ' ' && event.target === field) {
    usePulse(run); consumeEvents(); drawHUD(); event.preventDefault();
  }
});
window.addEventListener('keyup', event => keys.delete(event.key));
function background() {
  if (screen === 'playing') pause();
  else { stopAudio(); releaseInput(); }
}
window.addEventListener('blur', background);
window.addEventListener('pagehide', background);
document.addEventListener('visibilitychange', () => { if (document.hidden) background(); });
window.addEventListener('online', () => networkRestored(learner));
setInterval(() => { if (!document.hidden) queueSync(learner); }, 60000);
window.addEventListener('learner-synced', event => {
  if (event.detail === learner) refreshProfile();
});
el('pause').addEventListener('click', pause);
el('resume').addEventListener('click', resume);
el('finish').addEventListener('click', () => {
  if (screen !== 'paused') return;
  endRun(run); consumeEvents();
});
el('start').addEventListener('click', start);
el('again').addEventListener('click', start);
el('repeat').addEventListener('click', () => {
  if (screen === 'playing') { setupAudio(); speak(taskFor(run), true); }
});
el('pulse').addEventListener('click', () => {
  if (screen !== 'playing') return;
  usePulse(run); consumeEvents(); drawHUD();
});
el('sound').addEventListener('click', () => {
  if (screen !== 'playing') return;
  voiceBoost = !voiceBoost;
  setupAudio();
  if (speechGain) speechGain.gain.value = voiceBoost ? 2.25 : 1;
  el('sound').setAttribute('aria-pressed', String(voiceBoost));
  speak(taskFor(run), true);
});
el('words-open').addEventListener('click', () => { changeScreen('words'); renderWords(); el('word-search').focus({ preventScroll: true }); });
el('word-filter').addEventListener('change', renderWords);
el('word-search').addEventListener('input', renderWords);
el('profiles-open').addEventListener('click', () => { changeScreen('profiles'); profilesView(); el('profile-select').focus({ preventScroll: true }); });
el('profile-select').addEventListener('change', event => {
  learner = event.target.value; selectLearner(learner); profilesView(); queueSync(learner); write(el('transfer-status'), '');
});
el('profile-form').addEventListener('submit', event => {
  event.preventDefault();
  const id = addLearner(el('profile-name').value);
  if (!id) return;
  learner = id; el('profile-name').value = ''; profilesView(); queueSync(learner); write(el('transfer-status'), '');
});
el('export').addEventListener('click', () => {
  const backup = exportLearner(learner);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'kieselalarm-profil.json'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  write(el('transfer-status'), 'Profildatei zum Speichern bereit.');
});
el('import').addEventListener('change', async event => {
  const input = event.target, file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    learner = importLearner(JSON.parse(await file.text()));
    profilesView(); write(el('transfer-status'), 'Profil geöffnet.');
  } catch (error) { write(el('transfer-status'), error instanceof SyntaxError ? 'Diese Datei enthält kein gültiges Profil.' : error.message); }
  input.value = '';
});
for (const id of ['end-back', 'words-back', 'profiles-back']) el(id).addEventListener('click', home);

function frame(timestamp) {
  const delta = lastTime === undefined ? 0 : Math.min(.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;
  if (screen === 'playing' && run?.alive) {
    if (keys.has('ArrowLeft')) steer(run, run.playerX - 85);
    if (keys.has('ArrowRight')) steer(run, run.playerX + 85);
    tickRun(run, delta);
    consumeEvents();
    if (screen === 'playing') {
      effects = effects.filter(part => (part.age += delta) < part.life);
      drawHUD();
      scene(run, effects, run.clock);
    }
  } else if (screen === 'menu') scene(undefined, [], timestamp / 1000);
  requestAnimationFrame(frame);
}
changeScreen('menu');
refreshProfile();
queueSync(learner);
requestAnimationFrame(frame);
