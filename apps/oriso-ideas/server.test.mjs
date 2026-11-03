import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createIntake } from './server.mjs';

test('public intake resumes after restart and requires review authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'intake-'));
  const reviewerToken = 'test-reviewer-token-long-enough-for-local-test';
  let emailCode;
  let cookie;
  let failNext = false;
  const options = { emailAccess: { password: 'shared test word', initialDomains: ['oriso.org'],
    sendCode: async ({ code }) => { emailCode = code; } }, database: join(directory, 'intake.db'), reviewerToken,
    interview: async ({ turns }) => {
      if (failNext) { failNext = false; throw new Error('Temporary failure'); }
      return turns.length < 11
        ? { question: 'Frage ' + (turns.length + 1), assumptions: [], decisions: ['Status'], de: '', en: '' }
        : { question: null, assumptions: [], decisions: [], de: 'Dev geprüft', en: 'Verified on Dev' };
    },
  };
  let app;
  let origin;
  async function launch() {
    app = createIntake(options);
    app.listen(0, '127.0.0.1');
    await once(app, 'listening');
    origin = 'http://127.0.0.1:' + app.address().port;
  }
  function call(path, body, token) {
    return fetch(origin + '/ideas/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...(token && { Authorization: 'Bearer ' + token }) },
      body: body && JSON.stringify(body),
    });
  }
  try {
    await launch();
    assert.equal((await call('/proposals', { form: {} })).status, 401);
    const challenge = await (await call('/access/code', {
      name: 'Test Author', email: 'author@oriso.org', password: 'shared test word',
    })).json();
    const verified = await call('/access/verify', { challenge: challenge.challenge, code: emailCode });
    assert.equal(verified.status, 200);
    cookie = verified.headers.get('set-cookie').split(';')[0];
    const created = await call('/proposals', { locale: 'de', form: {
      role: 'Produktleitung', situation: 'Vor der Release-Runde', problem: 'Was ist fertig?',
      solution: '', benefit: 'Status getrennt sichtbar',
    } });
    assert.equal(created.status, 201);
    const { id, token, proposal } = await created.json();
    assert.equal((await call('/proposals/' + id)).status, 404);
    const first = await (await call('/proposals/' + id + '/interview', { version: proposal.version }, token)).json();
    assert.equal(first.interview.question, 'Frage 1');
    failNext = true;
    const interviewPath = '/proposals/' + id + '/interview';
    const failed = await call(interviewPath, { version: first.version, answer: 'Gespeicherte Antwort' }, token);
    assert.equal(failed.status, 502);
    await new Promise(resolve => app.close(resolve));
    await launch();
    const resumed = await (await call('/proposals/' + id, null, token)).json();
    assert.equal(resumed.version, first.version);
    assert.equal(resumed.pendingAnswer, 'Gespeicherte Antwort');
    let preview = await (await call(interviewPath, { version: resumed.version }, token)).json();
    assert.equal(preview.turns[0].answer, 'Gespeicherte Antwort');
    for (let round = 2; round <= 11; round++) {
      assert.equal(preview.interview.question, 'Frage ' + round);
      preview = await (await call(interviewPath, { version: preview.version, answer: 'Antwort ' + round }, token)).json();
    }
    assert.equal(preview.turns.length, 11);
    assert.equal((await (await call('/proposals/' + id, null, token)).json()).pendingAnswer, undefined);
    assert.equal(preview.preview.en, 'Verified on Dev');
    const submitted = await (await call('/proposals/' + id + '/submit', { version: preview.version }, token)).json();
    assert.equal(submitted.status, 'submitted');
    const board = await (await call('/review', null, reviewerToken)).json();
    assert.deepEqual(board[0].proposal.author, { name: 'Test Author', email: 'author@oriso.org' });
    const community = '/proposals/' + id + '/community';
    const share = { version: submitted.version, revision: submitted.revision, action: 'share' };
    assert.deepEqual(await (await call('/community')).json(), []);
    assert.equal((await call(community, share, token)).status, 404);
    assert.equal((await call(community, { ...share, revision: 'invalid' }, reviewerToken)).status, 409);
    assert.equal((await call(community, share, reviewerToken)).status, 200);
    const shared = await (await call('/community')).json();
    assert.deepEqual(shared, [{ id, revision: submitted.revision, preview: submitted.preview, vote: null }]);
    const votePath = '/community/' + id + '/vote';
    const vote = { revision: submitted.revision, importance: 4, suggestion: 'Show the data age' };
    assert.equal((await call(votePath, { ...vote, importance: 6 })).status, 400);
    assert.equal((await call(votePath, { ...vote, revision: 'wrong' })).status, 409);
    assert.equal((await call(votePath, vote)).status, 200);
    assert.equal((await call(votePath, { ...vote, importance: 5 })).status, 200);
    const own = await (await call('/community')).json();
    assert.deepEqual(own[0].vote, { importance: 5, suggestion: 'Show the data age' });
    const document = '/proposals/' + id + '/document?revision=' + submitted.revision;
    assert.equal((await call(document, null, token)).status, 404);
    const feedback = await (await call(document, null, reviewerToken)).json();
    assert.deepEqual(feedback.communityFeedback, [{ importance: 5, suggestion: 'Show the data age' }]);
    assert.doesNotMatch(JSON.stringify(shared), /author@oriso.org/);
    assert.equal((await call(community, { ...share, action: 'withdraw' }, reviewerToken)).status, 200);
    assert.deepEqual(await (await call('/community')).json(), []);

    const decision = { version: submitted.version, action: 'reject', reason: 'Scope needs evidence' };
    assert.equal((await call('/proposals/' + id + '/review', decision, token)).status, 404);
    const rejected = await (await call('/proposals/' + id + '/review', decision, reviewerToken)).json();
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.review.reviewer.email, 'author@oriso.org');
    assert.equal((await call('/proposals/' + id + '/review', decision, reviewerToken)).status, 409);
    assert.equal((await call('/domains', { domains: ['example.org'] }, token)).status, 404);
    assert.deepEqual(await (await call('/domains', { domains: ['example.org'] }, reviewerToken)).json(), { domains: ['example.org'] });
    assert.equal((await call('/review', null, reviewerToken)).status, 404);
  } finally {
    if (app?.listening) await new Promise(resolve => app.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
