// site/i18n/de.js (spec 7.2 the format, 7.3 the 16 keys of the start page): the German source file.
// The keys, their order, the verbatim German of the first nine and the size of 1,552 bytes are those that 7.3 gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib.mjs';
import { parseLangFile } from '../lib-languages.mjs';

const KEYS = ['tag.1', 'tag.2', 'cta.words', 'snd.aria', 'snd.on_label', 'snd.hint_off', 'snd.hint_on', 'skip.label', 'play.label',
  'lang.aria', 'lang.title', 'lang.close', 'lang.error', 'blind.4k', 'blind.16k', 'blind.64k'];
const LIVE = { 'tag.1': 'Jeht nich…', 'tag.2': 'jibs nich…', 'cta.words': '(nich warten, quatschen)', 'snd.aria': 'Ton', 'snd.on_label': 'Ton an',
  'snd.hint_off': 'Ton aus (M)', 'snd.hint_on': 'Ton an (M)', 'skip.label': 'überspringen', 'play.label': 'Animation abspielen' };   // as the live page has them

const raw = fs.readFileSync(path.join(SITE, 'i18n', 'de.js'));
const text = raw.toString('utf8');
const { code, texts: obj } = parseLangFile(text);

test('exactly one Dream.lang("de", { ... }); statement and one final newline, UTF-8 without BOM, LF only, NFC', () => {
  assert.match(text, /^Dream\.lang\("de", \{\n[\s\S]*\n\}\);\n$/);
  assert.notEqual(raw[0], 0xEF);                                   // no byte order mark
  assert.ok(!text.includes('\r'));
  assert.equal(text, text.normalize('NFC'));
  assert.ok(!/[\u0000-\u0009\u000b-\u001f]/.test(text), 'a control character');
});

test('parseLangFile reads the file and refuses what is not exactly one statement with strict JSON', () => {
  assert.equal(code, 'de');
  for (const bad of ['', 'Dream.lang("de", {});', 'Dream.lang("de", {});\nDream.lang("en", {});\n', 'Dream.lang("de", {"a": "b",});\n', "Dream.lang('de', {});\n", 'Dream.lang("de", {"a": 1 + 1});\n'])
    assert.throws(() => parseLangFile(bad), /language file/, JSON.stringify(bad));
  assert.deepEqual(parseLangFile('Dream.lang("xx", {\n  "a": "b"\n});\n'), { code: 'xx', texts: { a: 'b' } });
});

test('the 16 keys of 7.3, in that order, one per line with two spaces of indent', () => {
  assert.deepEqual(Object.keys(obj), KEYS);
  const body = text.split('\n').slice(1, -2);
  assert.equal(body.length, KEYS.length);
  body.forEach((l, i) => assert.match(l, new RegExp(`^  "${KEYS[i].replace('.', '\\.')}": ".*"${i === body.length - 1 ? '' : ','}$`), l.slice(0, 40)));
});

test('the size is the 1,552 bytes that 7.3 measured for these 16 keys', () => {
  assert.equal(raw.length, 1552);
});

test('the first nine texts are those of the live page, verbatim', () => {
  for (const [k, v] of Object.entries(LIVE)) assert.equal(obj[k], v, k);
});

test('values: strings, one paragraph, no markup, no URL; placeholders as in 7.3 and 7.5', () => {
  for (const [k, v] of Object.entries(obj)) {
    assert.equal(typeof v, 'string', k);
    assert.ok(v.length > 0 && !/[<>]/.test(v) && !v.includes('://') && !/\n/.test(v), k);
  }
  assert.ok(!obj['tag.1'].includes('|') && !obj['tag.2'].includes('|'));
  assert.deepEqual(obj['lang.aria'].match(/\{[a-z0-9]+\}/g), ['{code}', '{name}']);
  assert.ok(obj['lang.aria'].startsWith('{code}'));                // SW-5: the accessible name starts with the visible label
  for (const id of ['4k', '16k', '64k']) for (const p of ['{tag1}', '{tag2}', '{brand}']) assert.ok(obj['blind.' + id].includes(p), `blind.${id} lacks ${p}`);
  assert.ok(!Object.values(obj).some(v => /\d/.test(v.replace(/\{[a-z0-9]+\}/g, ''))), 'a digit in a German value');   // none of the 16 texts has one: LST-9
});
