import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProjectContext, interviewInput } from './project-context.mjs';

test('the server reads its ORISO glossary and supplies graph and test guidance automatically', () => {
  const context = loadProjectContext();
  assert.match(context, /Counselling centre/);
  assert.match(context, /Beratungsstelle/);
  assert.match(context, /metadata.sources/);
  assert.match(context, /calls_unconfirmed/);
  assert.match(context, /tools\/planning-map\/test/);
  assert.match(context, /grill-with-docs/);
});

test('the model receives review feedback without review and author contact details', () => {
  const input = interviewInput({
    answers: { role: 'Product lead' }, locale: 'en', turns: [], stakeholders: [],
    author: { email: 'author@example.test' },
    review: { action: 'revise', reason: 'Describe stale data', reviewer: { email: 'reviewer@example.test' } },
  });
  assert.deepEqual(input.review, { action: 'revise', reason: 'Describe stale data' });
  assert.doesNotMatch(JSON.stringify(input), /@example\.test/);
});
