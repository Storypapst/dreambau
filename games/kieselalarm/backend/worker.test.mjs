import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';

const { handleProfileRequest } = await import('./worker.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const migration = new URL('./profiles.sql', import.meta.url);
let sqlite;
let db;

// Run the SQL through SQLite while exposing the subset of D1 used by the Worker.
function connection(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      function bind(...values) {
        const args = values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
        return {
          first: async () => statement.get(...args) ?? null,
          run: async () => ({meta: {changes: statement.run(...args).changes}}),
        };
      }
      return {...bind(), bind};
    },
  };
}

beforeEach(() => {
  assert.equal(typeof handleProfileRequest, 'function', 'missing Worker API entry point');
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(migration, 'utf8'));
  db = connection(sqlite);
});
afterEach(() => sqlite?.close());

async function call(method, path, body, token) {
  const headers = {'Content-Type': 'application/json'};
  if (token) headers.Authorization = 'Bearer ' + token;
  const request = new Request('https://game.example' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handleProfileRequest(request, db);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return [response.status, await response.json()];
}

async function create() {
  const [status, profile] = await call('POST', '/api/v1/profiles', {});
  assert.equal(status, 201);
  assert.equal(profile.revision, 0);
  assert.deepEqual(profile.progress, {});
  return {path: '/api/v1/profiles/' + profile.profileId + '/progress', ...profile};
}

test('health confirms the profile table is available', async () => {
  assert.deepEqual(await call('GET', '/api/v1/health'),
    [200, {status: 'ok', service: 'kieselalarm', apiVersion: 1}]);
  sqlite.exec('DROP TABLE profiles');
  assert.equal((await call('GET', '/api/v1/health'))[0], 503);
});

test('a native or web client can create a profile, save and reopen it', async () => {
  const {path, token, profileId} = await create();
  const progress = {version: 1, events: {abc: {type: 'answer', taskId: 'Bär', correct: true}}};
  const expected = {revision: 1, progress};
  assert.deepEqual(await call('PUT', path, {revision: 0, progress}, token), [200, expected]);
  assert.deepEqual(await call('GET', path, undefined, token), [200, expected]);
  const dbHash = sqlite.prepare('SELECT token_hash FROM profiles WHERE id=?').get(profileId).token_hash;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  assert.deepEqual(new Uint8Array(dbHash), new Uint8Array(hash));
});

test('credentials scope both reads and writes', async () => {
  const a = await create();
  const b = await create();
  for (const token of [undefined, a.token]) {
    for (const [method, body] of [['GET', undefined], ['PUT', {revision: 0, progress: {}}]]) {
      assert.deepEqual(await call(method, b.path, body, token), [401, {error: 'unauthorized'}]);
    }
  }
  assert.deepEqual(await call('GET', b.path, undefined, b.token), [200, {revision: 0, progress: {}}]);
});

test('one write wins a revision and the conflict returns the winning state', async () => {
  const {path, token} = await create();
  const writes = await Promise.all(['A', 'B'].map(letter =>
    call('PUT', path, {revision: 0, progress: {letter}}, token)));
  writes.sort((a, b) => a[0] - b[0]);
  assert.equal(writes[0][0], 200);
  assert.deepEqual(writes[1], [409, {error: 'revision_conflict', ...writes[0][1]}]);
  assert.deepEqual(await call('GET', path, undefined, token), writes[0]);
});

test('invalid and oversized requests leave the profile unchanged', async () => {
  const {path, token} = await create();
  for (const body of [{revision: true, progress: {}}, {revision: 0, progress: []}, {progress: {}}]) {
    assert.equal((await call('PUT', path, body, token))[0], 400);
  }
  const raw = new Request('https://game.example' + path, {
    method: 'PUT', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
    body: '{"revision":0,"progress":{"v":1e999}}',
  });
  assert.equal((await handleProfileRequest(raw, db)).status, 400);
  assert.equal((await call('PUT', path, {revision: 0, progress: {big: 'x'.repeat(2 * 1024 * 1024)}}, token))[0], 413);
  assert.deepEqual(await call('GET', path, undefined, token), [200, {revision: 0, progress: {}}]);
});
