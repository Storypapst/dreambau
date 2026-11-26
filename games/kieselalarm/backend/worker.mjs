// Fetch entry point shared by the website Worker and future mobile clients.
const profilesPath = '/api/v1/profiles';
const profileRoute = /^\/api\/v1\/profiles\/([0-9a-f-]{36})\/progress$/;
const limit = 2 * 1024 * 1024;
const encoder = new TextEncoder();

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}

function reply(status, value) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer realm="Kieselalarm"';
  if (status === 503) headers['Retry-After'] = '2';
  return new Response(JSON.stringify(value), {status, headers});
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readObject(request) {
  const mime = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (mime !== 'application/json') throw new ApiError(415, 'expected_application_json');
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, 'body_too_large');
  if (!request.body) throw new ApiError(400, 'invalid_json');

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'body_too_large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoded = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    const data = JSON.parse(decoded, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number');
      return value;
    });
    if (!object(data)) throw new Error('Expected object');
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid_json');
  } finally {
    reader.releaseLock();
  }
}

function digest(token) {
  return crypto.subtle.digest('SHA-256', encoder.encode(token));
}

async function create(request, db) {
  if (Object.keys(await readObject(request)).length) throw new ApiError(400, 'empty_object_required');
  const profileId = crypto.randomUUID();
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...random))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  await db.prepare('INSERT INTO profiles (id, token_hash) VALUES (?, ?)')
    .bind(profileId, await digest(token)).run();
  return reply(201, {profileId, token, revision: 0, progress: {}});
}

async function progressRequest(request, db, profileId) {
  const auth = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '');
  if (!auth) throw new ApiError(401, 'unauthorized');
  const tokenHash = await digest(auth[1]);
  if (request.method === 'PUT') {
    const body = await readObject(request);
    if (Object.keys(body).length !== 2 || !Number.isSafeInteger(body.revision) ||
        body.revision < 0 || !object(body.progress)) {
      throw new ApiError(400, 'invalid_progress');
    }
    const updated = await db.prepare(
      'UPDATE profiles SET revision = revision + 1, progress = ? ' +
      'WHERE id = ? AND token_hash = ? AND revision = ? RETURNING revision'
    ).bind(JSON.stringify(body.progress), profileId, tokenHash, body.revision).first();
    if (updated) return reply(200, {revision: updated.revision, progress: body.progress});
  }
  const row = await db.prepare('SELECT revision, progress FROM profiles WHERE id = ? AND token_hash = ?')
    .bind(profileId, tokenHash).first();
  if (!row) throw new ApiError(401, 'unauthorized');
  const snapshot = {revision: row.revision, progress: JSON.parse(row.progress)};
  return request.method === 'PUT'
    ? reply(409, {error: 'revision_conflict', ...snapshot})
    : reply(200, snapshot);
}

export async function handleProfileRequest(request, db) {
  const {pathname} = new URL(request.url);
  try {
    if (pathname === '/api/v1/health' && request.method === 'GET') {
      await db.prepare('SELECT 1 FROM profiles LIMIT 1').first();
      return reply(200, {status: 'ok', service: 'kieselalarm', apiVersion: 1});
    }
    if (pathname === profilesPath && request.method === 'POST') return await create(request, db);
    const profile = profileRoute.exec(pathname);
    if (profile && ['GET', 'PUT'].includes(request.method)) {
      return await progressRequest(request, db, profile[1]);
    }
    if (profile || pathname === profilesPath || pathname === '/api/v1/health') {
      return reply(405, {error: 'method_not_allowed'});
    }
    return reply(404, {error: 'not_found'});
  } catch (error) {
    if (error instanceof ApiError) return reply(error.status, {error: error.message});
    return reply(503, {error: 'storage_unavailable'});
  }
}
