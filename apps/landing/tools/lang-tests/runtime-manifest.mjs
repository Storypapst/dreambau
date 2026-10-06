// The manifest as the runtime (site/i18n.js) reads it, next to the manifest as the build reads it (tools/lib-languages.mjs): the rules of 7.6
// must be the same in both, because a manifest that the build publishes and the runtime refuses would give a page without languages (ERR-2).
// The runtime runs here in a bare sandbox (no browser): only what a visitor can observe is read, which is Dream.state.langFallback,
// the script that is inserted for the German file (FIL-7) and the codes that are registered.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SITE } from '../lib.mjs';
import { manifestProblems, parseManifest } from '../lib-languages.mjs';

const RUNTIME = fs.readFileSync(path.join(SITE, 'i18n.js'), 'utf8');
const de = { c: 'de', n: 'Deutsch', d: 'ltr', s: 'DE' };
const en = { c: 'en', n: 'English', d: 'ltr', s: 'EN' };
const ar = { c: 'ar', n: 'العربية', d: 'rtl', s: 'AR' };
const pub = (...langs) => ({ v: 1, dev: false, langs });                                    // the published form
const src = (...langs) => ({ v: 1, dev: true, langs: langs.map((l, i) => ({ ...l, o: i === 0 ? 1 : 0 })) });   // the source form

// the page, as far as the runtime touches it: a head that takes scripts, a way to make one, and the folder of the script itself
function load(manifest) {
  const inserted = [], sandbox = {
    document: { currentScript: { src: 'https://example.test/assets/i18n.js' }, head: { appendChild: el => inserted.push(el) }, createElement: () => ({}), addEventListener() {} },
    setTimeout: () => 0,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(RUNTIME, sandbox);
  if (manifest !== undefined) sandbox.Dream.i18n.manifest(manifest);
  return { D: sandbox.Dream, inserted };
}

const VALID = [
  ['the published example of 7.6: German only', pub(de)],
  ['the published form with three languages, one of them right to left', pub(de, en, ar)],
  ['the source form: every row with o, German offered, the others drafts', src(de, en, ar)],
  ['the source form that is in site/i18n/index.js', parseManifest(fs.readFileSync(path.join(SITE, 'i18n', 'index.js'), 'utf8'))],
];
const INVALID = [
  ['null', null], ['an array', []], ['a string', 'Dream'], ['a number', 5], ['an empty object', {}],
  ['v is not 1 (2)', { ...pub(de), v: 2 }], ['v is the string "1"', { ...pub(de), v: '1' }], ['dev is missing', { v: 1, langs: [de] }], ['dev is a string', { ...pub(de), dev: 'false' }],
  ['langs is missing', { v: 1, dev: false }], ['langs is not an array', { v: 1, dev: false, langs: de }], ['langs is empty', pub()],
  ['no German', pub(en)], ['a duplicate code', pub(de, en, en)], ['a row that is null', pub(de, null)], ['a row that is a string', pub(de, 'en')],
  ['an empty code', pub(de, { ...en, c: '' })], ['an empty native name', pub(de, { ...en, n: '' })], ['an empty short label', pub(de, { ...en, s: '' })],
  ['a name that is not a string', pub(de, { ...en, n: 5 })], ['d is neither ltr nor rtl', pub(de, { ...en, d: 'up' })], ['d is missing', pub(de, { c: 'en', n: 'English', s: 'EN' })],
  ['o in the published form', { ...pub(de), langs: [{ ...de, o: 1 }] }], ['the source form without o', { v: 1, dev: true, langs: [de] }],
  ['o is 2 in the source form', { v: 1, dev: true, langs: [{ ...de, o: 2 }] }], ['o is the string "1" in the source form', { v: 1, dev: true, langs: [{ ...de, o: '1' }] }],
];
const formOf = m => m && m.dev === true ? 'source' : 'published';

for (const [name, m] of VALID) test(`a valid manifest starts the loading of the German file at once, and the build agrees: ${name}`, () => {
  assert.deepEqual(manifestProblems(m, formOf(m)), []);
  const { D, inserted } = load(m);
  assert.equal(D.state.langFallback, '');
  assert.deepEqual(inserted.map(s => s.src), ['https://example.test/assets/i18n/de.js']);            // the folder of i18n.js plus i18n/de.js (FIL-5, FIL-7)
});

for (const [name, m] of INVALID) test(`an invalid manifest is refused, and the build agrees: ${name}`, () => {
  assert.notDeepEqual(manifestProblems(m, formOf(m)), []);
  const { D, inserted } = load(m);
  assert.equal(D.state.langFallback, 'manifest');                                                  // ERR-2
  assert.deepEqual(inserted, [], 'nothing is requested');
  assert.equal(D.state.lang, 'de');
});

test('a German file that is registered already is not requested again (FIL-11), and Dream.lang replaces a second call for the same code', () => {
  const sandbox = { document: { currentScript: null, head: { appendChild: () => assert.fail('requested') }, createElement: () => ({}), addEventListener() {} }, setTimeout: () => 0 };
  sandbox.window = sandbox;
  vm.runInNewContext(RUNTIME, sandbox);
  sandbox.Dream.lang('de', { 'tag.1': 'eins' });
  sandbox.Dream.lang('de', { 'tag.1': 'zwei' });
  assert.deepEqual([...sandbox.Dream.i18n.registered()], ['de']);                                   // spread: the array is from the sandbox's own realm
  sandbox.Dream.i18n.manifest(pub(de));                                                            // would request de.js if it were not registered
});

test('the runtime keeps the object Dream.state that already exists, and creates Dream and Dream.state when they are missing (7.11)', () => {
  const state = { id: 'x' }, sandbox = { Dream: { state, prods: {} }, document: { currentScript: null, head: {}, createElement: () => ({}), addEventListener() {} }, setTimeout: () => 0 };
  sandbox.window = sandbox;
  vm.runInNewContext(RUNTIME, sandbox);
  assert.equal(sandbox.Dream.state, state);
  assert.deepEqual(sandbox.Dream.prods, {});
  assert.deepEqual([state.id, state.lang, state.langSource, state.langFallback], ['x', 'de', 'fallback', '']);
  assert.equal(typeof load().D.state, 'object');
});
