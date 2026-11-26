import { createProfile, recordAttempt, taskId } from './learning.mjs';

const prefix = 'kieselalarm.v1.';
const memory = new Map();
const cache = new Map();
const runningSync = new Map();
const lastSync = new Map();
const api = '/api/v1/';
let availableAt = 0;
let healthCheck;
let localStorageWorks = true;

function read(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(prefix + key);
    if (raw !== null) return JSON.parse(raw);
  } catch { localStorageWorks = false; }
  return memory.get(key) ?? fallback;
}

function write(key, value) {
  memory.set(key, value);
  try { window.localStorage.setItem(prefix + key, JSON.stringify(value)); }
  catch { localStorageWorks = false; }
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function storedKeys() {
  const keys = new Set(memory.keys());
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(prefix)) keys.add(key.slice(prefix.length));
    }
  } catch { localStorageWorks = false; }
  return [...keys];
}

export function listLearners() {
  return storedKeys().filter(key => key.startsWith('name.')).map(key => ({ id: key.slice(5), name: read(key) }))
    .filter(learner => typeof learner.name === 'string').sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function addLearner(name) {
  const normalized = name.trim().slice(0, 40);
  if (!normalized) return null;
  const existing = listLearners().find(item => item.name.toLocaleLowerCase('de') === normalized.toLocaleLowerCase('de'));
  const id = existing?.id ?? uuid();
  write('name.' + id, normalized);
  selectLearner(id);
  return id;
}

export function selectLearner(id) { write('current', id); }

export function currentLearner() {
  const learners = listLearners();
  const current = read('current');
  return learners.find(item => item.id === current)?.id ?? learners[0]?.id ?? addLearner('Spieler 1');
}

function ledger(id) {
  if (!cache.has(id)) {
    const events = new Map();
    const start = 'event.' + id + '.';
    for (const key of storedKeys()) {
      if (!key.startsWith(start)) continue;
      const event = read(key);
      if (event && typeof event.type === 'string') events.set(key.slice(start.length), event);
    }
    cache.set(id, events);
  }
  return cache.get(id);
}

export function learnerProgress(id, tasks) {
  const profile = createProfile();
  const byId = new Map(tasks.map(task => [taskId(task), task]));
  const history = [...ledger(id)].sort(([ida, a], [idb, b]) => a.at - b.at || ida.localeCompare(idb));
  for (const [, event] of history) {
    const task = byId.get(event.taskId);
    if (event.type === 'answer' && task) recordAttempt(profile, task, event, event.at);
  }
  return profile;
}

function addEvent(id, event) {
  lastSync.delete(id);
  const key = uuid();
  const value = { ...event, at: Date.now() };
  ledger(id).set(key, value);
  write('event.' + id + '.' + key, value);
  queueSync(id);
  return value;
}

export function recordAnswer(id, profile, task, attempt) {
  const event = addEvent(id, { type: 'answer', taskId: taskId(task), ...attempt });
  recordAttempt(profile, task, event, event.at);
}

function unspent(id) {
  const events = ledger(id);
  const redeemed = new Set();
  for (const event of events.values()) {
    if (event.type === 'redeem' && Array.isArray(event.awards)) {
      for (const award of event.awards) redeemed.add(award);
    }
  }
  return [...events].filter(([key, item]) => item.type === 'award' && Number.isSafeInteger(item.seconds) && item.seconds > 0 && !redeemed.has(key));
}

export function bonusFor(id) {
  return unspent(id).reduce((sum, [, item]) => sum + item.seconds, 0);
}

export function claimBonus(id) {
  const available = unspent(id);
  if (!available.length) return 0;
  addEvent(id, { type: 'redeem', awards: available.map(([key]) => key) });
  return available.reduce((sum, [, item]) => sum + item.seconds, 0);
}

export function awardBonus(id, seconds) {
  if (Number.isSafeInteger(seconds) && seconds > 0) addEvent(id, { type: 'award', seconds });
}

async function healthy() {
  if (!['http:', 'https:'].includes(window.location.protocol) || typeof fetch !== 'function') return false;
  if (!healthCheck || Date.now() >= availableAt) {
    availableAt = Date.now() + 60000;
    healthCheck = fetch(api + 'health', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) })
      .then(async response => response.ok && (await response.json()).service === 'kieselalarm').catch(() => false);
  }
  return healthCheck;
}

function mergeEvents(id, progress) {
  if (progress?.version !== 1 || !progress.events || typeof progress.events !== 'object') return;
  const local = ledger(id);
  for (const [key, event] of Object.entries(progress.events)) {
    if (local.has(key) || !/^[a-zA-Z0-9_-]{1,100}$/.test(key) || typeof event?.type !== 'string' || !Number.isFinite(event.at)) continue;
    local.set(key, event);
    write('event.' + id + '.' + key, event);
  }
}

async function sync(id) {
  if (!await healthy()) return;
  let server = read('server.' + id);
  if (!server) {
    const response = await fetch(api + 'profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(6000) });
    if (!response.ok) return;
    const created = await response.json();
    if (typeof created.profileId !== 'string' || typeof created.token !== 'string') return;
    server = { profileId: created.profileId, token: created.token, origin: window.location.origin };
    write('server.' + id, server);
  }
  if (server.origin && server.origin !== window.location.origin) return;
  const url = api + 'profiles/' + encodeURIComponent(server.profileId) + '/progress';
  const headers = { Authorization: 'Bearer ' + server.token, 'Content-Type': 'application/json' };
  const current = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!current.ok) return;
  let snapshot = await current.json();
  for (let attempt = 0; attempt < 4; attempt++) {
    if (snapshot.progress?.version && snapshot.progress.version !== 1) return;
    mergeEvents(id, snapshot.progress);
    const events = ledger(id);
    const remote = snapshot.progress?.events ?? {};
    if ([...events.keys()].every(key => Object.hasOwn(remote, key))) break;
    const response = await fetch(url, { method: 'PUT', headers, signal: AbortSignal.timeout(6000),
      body: JSON.stringify({ revision: snapshot.revision, progress: { version: 1, events: Object.fromEntries(events) } }) });
    if (!response.ok && response.status !== 409) return;
    snapshot = await response.json();
    if (response.ok && [...events.keys()].every(key => Object.hasOwn(snapshot.progress?.events ?? {}, key))) break;
  }
  if (![...ledger(id).keys()].every(key => Object.hasOwn(snapshot.progress?.events ?? {}, key))) return;
  lastSync.set(id, Date.now());
  window.dispatchEvent(new CustomEvent('learner-synced', { detail: id }));
}

const syncTimers = new Map();
export function queueSync(id) {
  clearTimeout(syncTimers.get(id));
  syncTimers.set(id, setTimeout(() => {
    syncTimers.delete(id);
    if (runningSync.has(id)) { queueSync(id); return; }
    const start = () => sync(id);
    const job = navigator.locks ? navigator.locks.request('kieselalarm.sync.' + id, start) : start();
    runningSync.set(id, job);
    job.catch(() => {}).finally(() => runningSync.delete(id));
  }, 500));
}

export function saveStatus(id) {
  if (!localStorageWorks) return 'Speicherung nur bis zum Schließen möglich.';
  return lastSync.has(id) ? 'Auf diesem Gerät und dem Spielserver gespeichert.' : 'Auf diesem Gerät gespeichert.';
}

window.addEventListener('storage', event => {
  if (!event.key?.startsWith(prefix + 'event.')) return;
  const [, id, key] = event.key.slice(prefix.length).split('.');
  if (!cache.has(id) || !event.newValue) return;
  try { cache.get(id).set(key, JSON.parse(event.newValue)); } catch { return; }
  window.dispatchEvent(new CustomEvent('learner-synced', { detail: id }));
});

export function exportLearner(id) {
  return { format: 'kieselalarm-profile', version: 1, id, name: read('name.' + id),
    server: read('server.' + id), progress: { version: 1, events: Object.fromEntries(ledger(id)) } };
}

export function importLearner(file) {
  const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (file?.format !== 'kieselalarm-profile' || file.version !== 1 || !validUuid.test(file.id)
      || typeof file.name !== 'string' || !file.name.trim() || file.progress?.version !== 1
      || !file.progress.events || typeof file.progress.events !== 'object' || Array.isArray(file.progress.events)) {
    throw new Error('Diese Datei enthält kein gültiges Kieselalarm-Profil.');
  }
  if (file.server && (!validUuid.test(file.server.profileId) || typeof file.server.token !== 'string'
      || !/^[a-zA-Z0-9_-]{32,128}$/.test(file.server.token)
      || typeof file.server.origin !== 'string' || !/^https?:/.test(file.server.origin))) {
    throw new Error('Der Serverzugang in dieser Datei ist ungültig.');
  }
  const existing = read('server.' + file.id);
  if (file.server && existing && (existing.profileId !== file.server.profileId || existing.origin !== file.server.origin)) {
    throw new Error('Dieses Profil gehört bereits zu einem anderen Serverzugang.');
  }
  for (const [key, event] of Object.entries(file.progress.events)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key) || !event || typeof event.type !== 'string'
        || !Number.isFinite(event.at) || (event.type === 'answer' && (typeof event.correct !== 'boolean' || typeof event.taskId !== 'string'))) {
      throw new Error('Die Lerndaten sind unvollständig.');
    }
  }
  write('name.' + file.id, file.name.trim().slice(0, 40));
  if (file.server) write('server.' + file.id, file.server);
  mergeEvents(file.id, file.progress);
  selectLearner(file.id);
  queueSync(file.id);
  return file.id;
}

export function networkRestored(id) {
  availableAt = 0;
  queueSync(id);
}
