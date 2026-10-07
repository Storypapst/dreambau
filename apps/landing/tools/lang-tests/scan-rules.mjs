// The static scan of the shipped files (spec VER-5, FIL-5): fourteen patterns that must not occur in the page, its scripts and the
// language files. tools/verify.mjs applies these rules; here they are applied to strings, to a scratch site and to the real site/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SITE } from '../lib.mjs';
import { IDS } from '../budget.mjs';
import { SCAN_RULES, scanText, scanTargets, scanSite } from '../scan-rules.mjs';

// one sample for each of the 14 patterns of VER-5: the twelve that verify.mjs had before this piece, and eval( and new Function
const SAMPLES = [
  ['absolute http(s) URL', 'var u = "https://example.test/x";'], ['fetch()', 'fetch("a")'], ['XMLHttpRequest', 'new XMLHttpRequest()'], ['WebSocket', 'new WebSocket(u)'],
  ['Image()', 'new Image()'], ['<img>', '<img src="a">'], ['<iframe>', '<iframe></iframe>'], ['<video>', '<video></video>'], ['<audio>', '<audio></audio>'],
  ['dynamic import()', 'import("./a.js")'], ['sendBeacon', 'navigator.sendBeacon(u)'], ['cookies', 'document.cookie = "a=1"'],
  ['eval()', 'eval(1)'], ['new Function', "new Function('')"],
];

test('there are fourteen rules and each sample is found by its own rule', () => {
  assert.equal(SCAN_RULES.length, 14);
  for (const [what, sample] of SAMPLES) assert.ok(scanText(sample).includes(what), `${what}: not found in ${sample}`);
});

test('eval(1) and new Function(\'\') are caught (FIL-5), including a space before the bracket', () => {
  assert.deepEqual(scanText('eval(1)'), ['eval()']);
  assert.deepEqual(scanText("new Function('')"), ['new Function']);
  assert.deepEqual(scanText('x = eval (y)'), ['eval()']);
  assert.deepEqual(scanText('x = new  Function("a", "return a")'), ['new Function']);
});

test('ordinary words are not caught: evaluate(, retrieval(, Function.prototype, the word function', () => {
  assert.deepEqual(scanText('page.evaluate(() => 1); retrieval(2); Function.prototype.call; function f() {} // new function'), []);
});

test('the scan covers the page, the runtime, the Animations, the manifest and every language file', () => {
  const targets = scanTargets(SITE, IDS);
  for (const f of ['index.html', 'shell.js', 'i18n.js', 'i18n/index.js', 'i18n/de.js', ...IDS.map(id => `p/${id}.js`)]) assert.ok(targets.includes(f), `${f} is not scanned`);
});

test('a language file that is added later is scanned too, and a violation in it is reported with its name', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-site-'));
  try {
    fs.mkdirSync(path.join(site, 'i18n')); fs.mkdirSync(path.join(site, 'p'));
    for (const f of ['index.html', 'shell.js', 'i18n.js', 'i18n/index.js', 'i18n/de.js', 'i18n/xx.js', 'p/4k.js']) fs.writeFileSync(path.join(site, f), f === 'i18n/xx.js' ? 'Dream.lang("xx", {}); eval(1);' : '// clean');
    assert.ok(scanTargets(site, ['4k']).includes('i18n/xx.js'));
    assert.deepEqual(scanSite(site, ['4k']), ['xx.js: eval()']);
    fs.writeFileSync(path.join(site, 'i18n.js'), "var f = new Function('');");
    assert.deepEqual(scanSite(site, ['4k']), ['i18n.js: new Function', 'xx.js: eval()']);
  } finally { fs.rmSync(site, { recursive: true, force: true }); }
});

test('none of the files of site/ matches any rule', () => {
  assert.deepEqual(scanSite(SITE, IDS), []);
});
