import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { instructions } from './interview-model.mjs';
import { createAccess } from './access.mjs';
import { advance, confirm, documentMarkdown, getDocument, listDocuments, rate, review, reviseFromFeedback, saveTechnicalReview, start } from './workflow.mjs';

const assets = {
  '/ideas/': ['./index.html', 'text/html'],
  '/ideas/app.js': ['./app.js', 'text/javascript'],
  '/ideas/intake.css': ['./intake.css', 'text/css'],
  '/ideas/hub.css': ['../understand-anything/site/hub/assets/hub.css', 'text/css'],
};

const hash = value => createHash('sha256').update(value).digest('hex');

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.headers['content-type'] !== 'application/json') throw new TypeError('JSON required');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new TypeError('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createIntake({ database, reviewerToken, interview, emailAccess, dailyCalls = 50, previewMode = false, livePreview = false, resolveIdentity }) {
  if (!resolveIdentity && (!reviewerToken || reviewerToken.length < 32)) throw new Error('A reviewer secret is required');
  const reviewerHash = reviewerToken ? hash(reviewerToken) : null;
  const db = new DatabaseSync(database);
  const access = resolveIdentity ? null : createAccess(db, emailAccess);
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, secret TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_documents (
      id TEXT PRIMARY KEY REFERENCES proposals(id), revision TEXT NOT NULL,
      preview TEXT NOT NULL, shared_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_votes (
      id TEXT NOT NULL REFERENCES proposals(id), revision TEXT NOT NULL,
      voter TEXT NOT NULL, importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5),
      suggestion TEXT NOT NULL, PRIMARY KEY (id, revision, voter)
    );
    CREATE TABLE IF NOT EXISTS pending_interview_answers (
      id TEXT PRIMARY KEY REFERENCES proposals(id), version INTEGER NOT NULL, answer TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budgets (
      day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, kind)
    );
  `);
  const reserve = db.prepare(`
    INSERT INTO budgets VALUES (?, ?, 1)
    ON CONFLICT(day, kind) DO UPDATE SET count = count + 1 WHERE count < ?
  `);
  const insert = db.prepare('INSERT INTO proposals VALUES (?, ?, ?, ?)');
  const find = db.prepare('SELECT * FROM proposals WHERE id = ?');
  const findPending = db.prepare('SELECT answer FROM pending_interview_answers WHERE id = ? AND version = ?');
  const savePending = db.prepare(`
    INSERT INTO pending_interview_answers VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET version = excluded.version, answer = excluded.answer
      WHERE pending_interview_answers.version < excluded.version
  `);
  const clearPending = db.prepare('DELETE FROM pending_interview_answers WHERE id = ? AND version = ?');
  const interviewing = new Set();
  const update = db.prepare('UPDATE proposals SET version = ?, data = ? WHERE id = ? AND version = ?');
  const submitted = db.prepare("SELECT id, data FROM proposals WHERE json_extract(data, '$.submittedAt') IS NOT NULL ORDER BY json_extract(data, '$.submittedAt') DESC LIMIT 100");
  const findShared = db.prepare('SELECT revision FROM community_documents WHERE id = ?');
  const listShared = db.prepare('SELECT id, revision, preview FROM community_documents ORDER BY shared_at DESC');
  const share = db.prepare(`
    INSERT INTO community_documents (id, revision, preview, shared_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, preview = excluded.preview,
      shared_at = excluded.shared_at
  `);
  const withdraw = db.prepare('DELETE FROM community_documents WHERE id = ? AND revision = ?');
  const ownVote = db.prepare('SELECT importance, suggestion FROM community_votes WHERE id = ? AND revision = ? AND voter = ?');
  const communityFeedback = db.prepare('SELECT importance, suggestion FROM community_votes WHERE id = ? AND revision = ?');
  const saveVote = db.prepare(`
    INSERT INTO community_votes (id, revision, voter, importance, suggestion)
    SELECT id, revision, ?, ?, ? FROM community_documents WHERE id = ? AND revision = ?
    ON CONFLICT (id, revision, voter) DO UPDATE SET importance = excluded.importance,
      suggestion = excluded.suggestion
  `);
  function setSession(response, token, maxAge) {
    response.setHeader('Set-Cookie', 'oriso_idea_session=' + token
      + '; Path=/ideas/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge + (previewMode ? '' : '; Secure'));
  }

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const bearer = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    const secret = bearer && hash(bearer);
    const session = request.headers.cookie?.match(/(?:^|;\s*)oriso_idea_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    const day = new Date().toISOString().slice(0, 10);
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = resolveIdentity ? url.pathname.replace(/^\/testmails(?=\/ideas\/)/, '') : url.pathname;
      if (request.method === 'GET' && Object.hasOwn(assets, path)) {
        const [file, mime] = assets[path];
        const content = readFileSync(new URL(file, import.meta.url), 'utf8');
        response.writeHead(200, {
          'Content-Type': mime + '; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        });
        if (resolveIdentity && path === '/ideas/') {
          return response.end(content.replace('<body>', '<body data-testmails="true">'));
        }
        return response.end(previewMode && path === '/ideas/'
          ? content.replace('id="preview-mode" hidden', 'id="preview-mode"')
            .replace('data-copy="fixture"', livePreview ? 'data-copy="livePreview"' : 'data-copy="fixture"')
          : content);
      }
      const principal = resolveIdentity ? await resolveIdentity(request.headers.cookie) : null;
      const identity = resolveIdentity ? principal?.identity ?? null : access.identity(session);
      const isReviewer = resolveIdentity ? principal?.reviewer === true : identity && secret
        && timingSafeEqual(Buffer.from(secret), Buffer.from(reviewerHash));
      if (resolveIdentity && request.method !== 'GET'
        && request.headers.origin && request.headers.origin !== 'https://dreambau.com') {
        return json(response, 403, { error: 'Invalid origin' });
      }
      if (path === '/ideas/api/system-prompt' && request.method === 'GET') {
        if (!identity) return json(response, 401, { error: 'Sign in required' });
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return response.end(instructions);
      }
      if (path === '/ideas/api/access' && request.method === 'GET') {
        return json(response, 200, { identity, ...(resolveIdentity && { reviewer: isReviewer }) });
      }
      if (access && path === '/ideas/api/access/code' && request.method === 'POST') {
        const body = await readBody(request);
        if (!reserve.run(day, 'access', 200).changes) return json(response, 429, { error: 'Daily limit reached' });
        const { status, challenge } = await access.request(body);
        return json(response, status, { challenge });
      }
      if (access && path === '/ideas/api/access/verify' && request.method === 'POST') {
        const verified = access.verify(await readBody(request));
        if (!verified) return json(response, 403, { error: 'Code invalid or expired' });
        setSession(response, verified, 8 * 60 * 60);
        return json(response, 200, { identity: access.identity(verified) });
      }
      if (access && path === '/ideas/api/access/logout' && request.method === 'POST') {
        await readBody(request);
        access.logout(session);
        setSession(response, '', 0);
        return json(response, 200, {});
      }
      if (access && path === '/ideas/api/domains' && isReviewer) {
        if (request.method === 'GET') return json(response, 200, { domains: access.domains() });
        if (request.method === 'POST') return json(response, 200, { domains: access.setDomains((await readBody(request)).domains) });
      }
      if (request.method === 'GET' && path === '/ideas/api/community' && identity) {
        return json(response, 200, listShared.all().map(({ id, revision, preview }) => ({
          id, revision, preview: JSON.parse(preview),
          vote: ownVote.get(id, revision, hash(identity.email.toLowerCase())) ?? null,
        })));
      }
      const voteRoute = path.match(/^\/ideas\/api\/community\/([0-9a-f-]{36})\/vote$/);
      if (voteRoute && request.method === 'POST' && identity) {
        const { revision, importance, suggestion = '' } = await readBody(request);
        if (typeof revision !== 'string' || !Number.isInteger(importance)
          || importance < 1 || importance > 5 || typeof suggestion !== 'string' || suggestion.length > 1000) {
          return json(response, 400, { error: 'Invalid vote' });
        }
        const vote = { importance, suggestion: suggestion.trim() };
        const saved = saveVote.run(hash(identity.email.toLowerCase()), vote.importance, vote.suggestion, voteRoute[1], revision);
        return saved.changes ? json(response, 200, vote) : json(response, 409, { error: 'Revision is no longer shared' });
      }
      if (request.method === 'GET' && path === '/ideas/api/review' && isReviewer) {
        return json(response, 200, submitted.all().map(row => {
          const proposal = JSON.parse(row.data);
          return { id: row.id, proposal, revisions: listDocuments(proposal) };
        }));
      }
      if (request.method === 'POST' && path === '/ideas/api/proposals') {
        const body = await readBody(request);
        if (!identity) return json(response, 401, { error: 'Verify your email first' });
        const proposal = { ...start(body.form, body.locale), author: identity };
        if (!reserve.run(day, 'proposals', dailyCalls).changes) return json(response, 429, { error: 'Daily limit reached' });
        const id = randomUUID();
        const token = randomBytes(32).toString('base64url');
        insert.run(id, hash(token), proposal.version, JSON.stringify(proposal));
        return json(response, 201, { id, token, proposal });
      }

      const match = path.match(/^\/ideas\/api\/proposals\/([0-9a-f-]{36})(?:\/(interview|submit|review|rating|document|community|refine|technical))?$/);
      if (!match) return json(response, 404, { error: 'Not found' });
      const [, id, action] = match;
      const row = find.get(id);
      if (!row || !identity) return json(response, 404, { error: 'Not found' });
      const proposal = JSON.parse(row.data);
      const allowed = ['review', 'rating', 'document', 'community', 'refine', 'technical'].includes(action) ? isReviewer : (resolveIdentity || row.secret === secret) && proposal.author?.email === identity.email;
      if (!allowed) return json(response, 404, { error: 'Not found' });
      if (request.method === 'GET' && action === 'document') {
        const document = getDocument(proposal, url.searchParams.get('revision'));
        if (!document) return json(response, 404, { error: 'Revision not found' });
        return json(response, 200, { document, author: proposal.author, markdown: documentMarkdown(document), sharedRevision: findShared.get(id)?.revision ?? null, proposalVersion: proposal.version,
          communityFeedback: communityFeedback.all(id, document.revision) });
      }
      if (request.method === 'GET' && !action) {
        const pending = findPending.get(id, proposal.version);
        return json(response, 200, pending ? { ...proposal, pendingAnswer: pending.answer } : proposal);
      }
      if (request.method !== 'POST' || !action || action === 'document') return json(response, 405, { error: 'Method not allowed' });
      const body = await readBody(request);
      if (body.version !== proposal.version) return json(response, 409, { error: 'Reload the current revision' });

      if (action === 'community') {
        if (body.action === 'withdraw') {
          if (!withdraw.run(id, body.revision).changes) return json(response, 409, { error: 'Revision is not shared' });
          return json(response, 200, { sharedRevision: null });
        }
        const document = getDocument(proposal, body.revision);
        if (body.action !== 'share' || !document || !['submitted', 'accepted-for-specification'].includes(document.status)) {
          return json(response, 409, { error: 'Revision cannot be shared' });
        }
        const { de, en, stories } = document.preview;
        share.run(id, document.revision, JSON.stringify({ de, en, ...(stories && { stories }) }), new Date().toISOString());
        return json(response, 200, { sharedRevision: document.revision });
      }

      let next;
      if (action === 'submit') {
        next = { ...confirm(proposal, body.version), submittedAt: new Date().toISOString() };
      } else if (action === 'refine') {
        const revision = proposal.revision ?? proposal.submittedAt;
        if (body.revision !== revision || !body.suggestion
          || !communityFeedback.all(id, revision).some(vote => vote.suggestion === body.suggestion)) {
          return json(response, 409, { error: 'Feedback is not part of this revision' });
        }
        next = reviseFromFeedback(proposal, body.version, body, identity);
      } else if (action === 'technical') {
        if (body.revision !== (proposal.revision ?? proposal.submittedAt)) {
          return json(response, 409, { error: 'Revision has changed' });
        }
        next = saveTechnicalReview(proposal, body.version, body, identity);
      } else if (action === 'rating') {
        next = rate(proposal, body.version, body, identity);
      } else if (action === 'review') {
        next = review(proposal, body.version, body.action, body.reason, identity);
      } else {
        const continueInterview = body.continueInterview === true;
        if (proposal.status !== 'draft' || Boolean(proposal.preview) !== continueInterview) {
          return json(response, 409, { error: 'Interview is closed' });
        }
        if (interviewing.has(id)) return json(response, 409, { error: 'Interview already running' });
        const locale = body.locale ?? proposal.locale;
        if (locale !== 'de' && locale !== 'en') throw new TypeError('Unsupported locale');
        const turns = proposal.turns ?? [];
        const question = proposal.interview?.question;
        if (question) {
          const pending = findPending.get(id, proposal.version);
          if (!pending) {
            if (typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 1000) {
              throw new TypeError('Answer required');
            }
            savePending.run(id, proposal.version, body.answer.trim());
          }
          turns.push({ question, answer: findPending.get(id, proposal.version).answer });
        }
        if (!reserve.run(day, 'model', dailyCalls).changes) {
          return json(response, 429, { error: 'Daily model limit reached; the draft was saved' });
        }
        interviewing.add(id);
        try {
          const output = await interview({ ...proposal, locale, turns, continueInterview });
          if (continueInterview && output.question === null) throw new Error('Expected another question');
          next = { ...advance({ ...proposal, locale }, output), locale, turns };
        } catch {
          return json(response, 502, { error: 'Interview unavailable; the draft was saved' });
        } finally {
          interviewing.delete(id);
        }
      }
      if (!update.run(next.version, JSON.stringify(next), id, proposal.version).changes) {
        return json(response, 409, { error: 'Reload the current revision' });
      }
      if (action === 'interview') clearPending.run(id, proposal.version);
      if (action === 'review' && next.status === 'rejected') {
        withdraw.run(id, proposal.revision ?? proposal.submittedAt);
      }
      return json(response, 200, next);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof TypeError) {
        return json(response, 400, { error: 'Invalid submission' });
      }
      return json(response, 409, { error: 'Action is unavailable for this revision' });
    }
  });
  server.on('close', () => db.close());
  return server;
}
