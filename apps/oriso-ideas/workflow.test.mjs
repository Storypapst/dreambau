import assert from 'node:assert/strict';
import { test } from 'node:test';
import { start, advance, confirm, review, rate } from './workflow.mjs';

const form = { role: 'Produktleitung', situation: 'Vor der Release-Runde',
  problem: 'Der Status ist unklar', solution: '', benefit: 'Status je Teilaufgabe sichtbar' };
const resolved = { question: null, assumptions: [], decisions: [],
  de: 'Dev-Prüfung und Abnahme getrennt anzeigen.',
  en: 'Show Dev verification and client acceptance separately.' };

test('an accepted proposal remains a proposal for specification', () => {
  const draft = start(form, 'de');
  assert.throws(() => confirm(draft, draft.version));
  const ready = advance(draft, resolved);
  assert.throws(() => confirm(ready, draft.version));
  const submitted = confirm(ready, ready.version);
  assert.equal(submitted.status, 'submitted');
  const accepted = review(submitted, submitted.version, 'accept', '');
  assert.equal(accepted.status, 'accepted-for-specification');
  assert.throws(() => review(accepted, accepted.version, 'reject', 'Changed my mind'));
});

test('rejection requires a reason and ends that revision', () => {
  const ready = advance(start(form, 'de'), resolved);
  const submitted = confirm(ready, ready.version);
  assert.throws(() => review(submitted, submitted.version, 'reject', ' '));
  const rejected = review(submitted, submitted.version, 'reject', 'Dev is not acceptance');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.review.reason, 'Dev is not acceptance');
  assert.throws(() => advance(rejected, resolved));
});

test('revision keeps the prior review and requires a new interview and preview', () => {
  const ready = advance(start(form, 'en'), resolved);
  const submitted = confirm(ready, ready.version);
  const returned = review(submitted, submitted.version, 'revise', 'Add stale-data handling');
  assert.equal(returned.status, 'draft');
  assert.equal(returned.preview, null);
  assert.equal(returned.history[0].preview.en, resolved.en);
  assert.throws(() => confirm(returned, returned.version));
});

test('open decisions and single-language previews cannot be submitted', () => {
  const draft = start(form, 'de');
  const open = advance(draft, { ...resolved, question: 'Wer prüft das?', decisions: ['QA'] });
  assert.equal(open.preview, null);
  assert.throws(() => advance(draft, { ...resolved, decisions: ['QA'] }));
  assert.throws(() => advance(draft, { ...resolved, en: '' }));
});

test('stakeholders are optional and story drafts cover exactly the selected roles', () => {
  const draft = start({ ...form, stakeholders: ['counsellors', 'legal'], storyNotes: 'Show the verified status' }, 'en');
  assert.deepEqual(draft.stakeholders, ['counsellors', 'legal']);
  assert.equal(draft.storyNotes, 'Show the verified status');
  assert.throws(() => start({ ...form, stakeholders: ['unknown'] }, 'de'));
  assert.throws(() => advance(draft, resolved));
  const stories = draft.stakeholders.map(role => ({ role, de: 'Deutscher Entwurf', en: 'English draft' }));
  assert.deepEqual(advance(draft, { ...resolved, stories }).preview.stories, stories);
  assert.throws(() => advance(draft, { ...resolved, stories: [stories[0], stories[0]] }));
});

test('ratings belong to reviewers and stay with the submitted revision', () => {
  const ready = advance(start(form, 'de'), resolved);
  const submitted = confirm(ready, ready.version);
  const alex = { name: 'Alex', email: 'alex@example.test' };
  const sam = { name: 'Sam', email: 'sam@example.test' };
  const rated = rate(submitted, submitted.version, { clarity: 2, importance: 5 }, alex);
  assert.equal(rated.status, 'submitted');
  assert.throws(() => rate(rated, submitted.version, { clarity: 3, importance: 4 }, sam));
  assert.throws(() => rate(rated, rated.version, { clarity: 0, importance: 4 }, sam));
  const both = rate(rated, rated.version, { clarity: 4, importance: 3 }, sam);
  const updated = rate(both, both.version, { clarity: 3, importance: 5 }, alex);
  assert.equal(updated.ratings.length, 2);
  assert.equal(updated.ratings.find(item => item.reviewer.email === alex.email).clarity, 3);
  const returned = review(updated, updated.version, 'revise', 'Clarify the impact', sam);
  assert.deepEqual(returned.history[0].ratings, updated.ratings);
  assert.deepEqual(returned.ratings, []);
});

test('a document keeps its stable revision after ratings and return', async () => {
  const { getDocument, documentMarkdown } = await import('./workflow.mjs');
  const first = confirm(advance(start(form, 'de'), resolved), 2);
  const reviewer = { name: 'Reviewer', email: 'reviewer@example.test' };
  const rated = rate(first, first.version, { clarity: 2, importance: 5 }, reviewer);
  const returned = review(rated, rated.version, 'revise', 'Clarify the impact', reviewer);
  const edited = advance(returned, { ...resolved, de: 'Neue Fassung' });
  const second = confirm(edited, edited.version);
  assert.notEqual(second.revision, first.revision);
  const old = getDocument(second, first.revision);
  assert.equal(old.preview.de, resolved.de);
  assert.equal(old.status, 'returned');
  assert.equal(old.ratings[0].clarity, 2);
  assert.equal(getDocument(second, second.revision).preview.de, 'Neue Fassung');
  assert.equal(getDocument(second, 'missing'), null);
  assert.match(documentMarkdown(old), /## Deutsch[\s\S]+## English/);
  assert.doesNotMatch(documentMarkdown(old), /reviewer@example.test/);
});

test('community feedback creates a new submission and the PM spec stays on that revision', async () => {
  const { reviseFromFeedback, saveTechnicalReview, getDocument } = await import('./workflow.mjs');
  const first = confirm(advance(start(form, 'de'), resolved), 2);
  const pm = { name: 'PM', email: 'pm@example.test' };
  const second = reviseFromFeedback(first, first.version, {
    suggestion: 'Show last sync', de: 'Letzte Synchronisierung anzeigen', en: 'Show last sync',
  }, pm);
  assert.equal(getDocument(second, first.revision).status, 'superseded');
  assert.equal(getDocument(second, first.revision).preview.en, resolved.en);
  assert.notEqual(second.revision, first.revision);
  const technical = saveTechnicalReview(second, second.version, {
    findings: 'Existing map reads syncedAt.',
    decisions: 'Show the timestamp in the epic view.',
    tests: 'Verify missing and valid timestamps.',
    open: 'Confirm whether a stale threshold is needed.',
    story: 'As a product lead, I want to see data age so I can interpret the status.',
  }, pm);
  assert.match(technical.technical.spec, /## User Stories/);
  assert.match(technical.technical.spec, /Existing map reads syncedAt/);
  assert.equal(technical.status, 'submitted');
  assert.equal(technical.technical.revision, second.revision);
});

test('multiple authored stories persist independently, including two for one role', () => {
  const userStories = [
    { role: 'counsellors', text: 'See changes in a case.' },
    { role: 'counsellors', text: 'Explain the status to a colleague.' },
    { role: 'qa', text: 'Find the latest evidence.' },
  ];
  const draft = start({ ...form, userStories }, 'en');
  assert.deepEqual(draft.userStories, userStories);
  assert.deepEqual(confirm(advance(draft, resolved), 2).userStories, userStories);
  assert.throws(() => start({ ...form, userStories: [{ role: 'qa', text: '' }] }, 'en'));
});
