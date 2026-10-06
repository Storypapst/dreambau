// The manifest functions of tools/lib-languages.mjs (spec 7.6): read the source form, check it, write the published form.
// Expected values are the example line and the sizes that 7.6 gives, and the invalid cases it lists, not values computed by the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib.mjs';
import { parseManifest, manifestProblems, publishedManifest } from '../lib-languages.mjs';

const DE = { c: 'de', n: 'Deutsch', d: 'ltr', s: 'DE' };
const EXAMPLE = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"de","n":"Deutsch","d":"ltr","s":"DE"}]});\n';   // 7.6: "Example"
const src = (...langs) => ({ v: 1, dev: true, langs });
const row = (c, o = 1, extra = {}) => ({ c, n: c.toUpperCase() + '-name', d: 'ltr', s: c.toUpperCase(), o, ...extra });

test('the published form of a German-only manifest is the example line of 7.6, byte for byte, and 96 bytes', () => {
  const text = publishedManifest(src({ ...DE, o: 1 }));
  assert.equal(text, EXAMPLE);
  assert.equal(Buffer.byteLength(text), 96);                      // 7.6 "Size": 96 bytes with German only (measured)
});

test('the published form keeps the offered rows in table order, drops the drafts and the "o" field', () => {
  const text = publishedManifest(src({ ...DE, o: 1 }, row('en', 0), row('tr', 1), row('ru', 0), row('ar', 1, { d: 'rtl' })));
  const m = parseManifest(text);
  assert.deepEqual(m.langs.map(l => l.c), ['de', 'tr', 'ar']);
  assert.ok(m.langs.every(l => !('o' in l)));
  assert.equal(m.dev, false);
  assert.equal(m.v, 1);
  assert.equal(text.split('\n').length, 2);                       // one statement, one final newline
  assert.deepEqual(m.langs[2], { c: 'ar', n: 'AR-name', d: 'rtl', s: 'AR' });   // key order c, n, d, s as in the example
});

test('German is always published, whatever its "o" says', () => {
  assert.deepEqual(parseManifest(publishedManifest(src({ ...DE, o: 0 }, row('en', 1)))).langs.map(l => l.c), ['de', 'en']);
});

test('a valid source form and a valid published form have no problems', () => {
  assert.deepEqual(manifestProblems(src({ ...DE, o: 1 }, row('en', 0)), 'source'), []);
  assert.deepEqual(manifestProblems({ v: 1, dev: false, langs: [DE, { c: 'ar', n: 'ar', d: 'rtl', s: 'AR' }] }, 'published'), []);
});

// The invalid manifests of 7.6 ("Valid"): each one must be refused, and the problem names what is wrong.
const INVALID = [
  ['no de',                                  'source',    src(row('en'))],
  ['a duplicate code',                       'source',    src({ ...DE, o: 1 }, row('en'), row('en'))],
  ['v is not 1',                             'source',    { ...src({ ...DE, o: 1 }), v: 2 }],
  ['v is the string "1"',                    'source',    { ...src({ ...DE, o: 1 }), v: '1' }],
  ['an empty n',                             'source',    src({ ...DE, n: '', o: 1 })],
  ['an empty c',                             'source',    src({ ...DE, o: 1 }, row('', 1))],
  ['an empty s',                             'source',    src({ ...DE, s: '', o: 1 })],
  ['d is neither ltr nor rtl',               'source',    src({ ...DE, d: 'auto', o: 1 })],
  ['dev is not a boolean',                   'source',    { ...src({ ...DE, o: 1 }), dev: 'true' }],
  ['langs is empty',                         'source',    src()],
  ['langs is not an array',                  'source',    { v: 1, dev: true, langs: DE }],
  ['o in the published form',                'published', { v: 1, dev: false, langs: [{ ...DE, o: 1 }] }],
  ['o missing in the source form',           'source',    src(DE)],
  ['o is neither 1 nor 0 in the source form', 'source',   src({ ...DE, o: 2 })],
  ['the manifest is null',                   'source',    null],
  ['the manifest is an array',               'published', []],
];
for (const [what, form, m] of INVALID) {
  test(`refused: ${what}`, () => {
    assert.ok(manifestProblems(m, form).length > 0, `${what} was accepted`);
    if (form === 'source') assert.throws(() => publishedManifest(m), /manifest/i);
  });
}

test('the manifest file must be exactly one Dream.i18n.manifest(...) statement and one final newline', () => {
  assert.deepEqual(parseManifest(EXAMPLE), { v: 1, dev: false, langs: [DE] });
  for (const bad of ['{}', 'Dream.i18n.manifest({"v":1});', EXAMPLE + EXAMPLE, EXAMPLE + '\n', 'x;' + EXAMPLE, EXAMPLE.replace('});', '}); alert(1);'), 'Dream.i18n.manifest({"v":);\n']) {
    assert.throws(() => parseManifest(bad), /manifest/i, JSON.stringify(bad));
  }
});

test('the committed source manifest of the page is valid, offers German and publishes as the example line', () => {
  const text = fs.readFileSync(path.join(SITE, 'i18n', 'index.js'), 'utf8');
  const m = parseManifest(text);
  assert.equal(m.dev, true);                                      // the source form (7.6 "Shape")
  assert.deepEqual(manifestProblems(m, 'source'), []);
  assert.ok(m.langs.some(l => l.c === 'de' && l.o === 1));
  assert.equal(publishedManifest(m), EXAMPLE);                    // until slice 2 generates the real one: German only
});
