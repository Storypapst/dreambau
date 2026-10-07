// What the builds write for the language mechanism (spec 7.11, 7.13, FIL-6, FIL-11, FIL-13, LST-5): the apex build for the start page, its drafts
// form for the tests, the single-file build, and the script tags of the source page. The tests run the tools as a person does and read what they wrote.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseManifest, publishedManifest } from '../lib-languages.mjs';
import { ROOT, SITE } from '../lib.mjs';

const PRE = '/homepage-assets/';
const SCRATCH = 'dist/lang-tests/build-outputs';                  // dist/ is ignored by git; every test file of this folder has a folder of its own
const abs = rel => path.join(ROOT, rel);
const tool = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
// the scripts of a page, in order, each as { attrs, body }; the text inside a script is never read for tags (a comment may mention <script src>)
const scripts = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ attrs: m[1].trim(), body: m[2] }));

const EXAMPLE_MANIFEST = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"de","n":"Deutsch","d":"ltr","s":"DE"}]});\n';   // 7.6, the first Release
const SOURCE=fs.readFileSync(path.join(SITE,'i18n/index.js'),'utf8'),CODES=parseManifest(SOURCE).langs.map(l=>l.c);
let apex, apexHtml, drafts, single;

before(() => {
  fs.rmSync(abs(SCRATCH), { recursive: true, force: true });
  const a = tool('tools/build-apex.mjs', '--assets', PRE, '--out', `${SCRATCH}/apex`);
  assert.equal(a.status, 0, a.stderr || a.stdout);
  apex = JSON.parse(fs.readFileSync(abs(`${SCRATCH}/apex.json`), 'utf8'));
  apexHtml = fs.readFileSync(abs(`${SCRATCH}/apex/index.html`), 'utf8');
  const d = tool('tools/build-apex.mjs', '--assets', PRE, '--out', `${SCRATCH}/drafts`, '--drafts');
  assert.equal(d.status, 0, d.stderr || d.stdout);
  drafts = JSON.parse(fs.readFileSync(abs(`${SCRATCH}/drafts.json`), 'utf8'));
  const b = tool('tools/bundle.mjs', '--out', `${SCRATCH}/single.html`);
  assert.equal(b.status, 0, b.stderr || b.stdout);
  single = fs.readFileSync(abs(`${SCRATCH}/single.html`), 'utf8');
});

test('the apex build lists i18n.js, i18n/index.js and i18n/de.js: all approved languages', () => {
  const names = apex.files.map(f => f.path);
  for (const f of ['i18n.js', 'i18n/index.js', 'i18n/de.js']) assert.ok(names.includes(f), `${f} is not in apex.json`);
  assert.equal(new Set(names).size,names.length,'no duplicate release files');
  assert.deepEqual(names.filter(n=>n.startsWith('i18n/')&&n!=='i18n/index.js').sort(),CODES.map(c=>'i18n/'+c+'.js').sort());
  for(const file of ['navigation.css','navigation.js','source-view.js','referenzen/index.html','glossar/index.html'])assert.ok(names.includes(file),file);
  assert.deepEqual(apex.languages, CODES);
  assert.ok(!('drafts' in apex));
});

test('every file of the apex build is what apex.json says, and the language files are byte for byte those of site/i18n/', () => {
  for (const f of apex.files) {
    const buf = fs.readFileSync(abs(`${SCRATCH}/apex/${f.path}`));
    assert.equal(buf.length, f.bytes, f.path);
    assert.equal(sha(buf), f.sha256, f.path);
  }
  assert.ok(fs.readFileSync(abs(`${SCRATCH}/apex/i18n/de.js`)).equals(fs.readFileSync(path.join(SITE, 'i18n/de.js'))));
  assert.ok(fs.readFileSync(abs(`${SCRATCH}/apex/i18n.js`)).equals(fs.readFileSync(path.join(SITE, 'i18n.js'))));
});

test('the published manifest of the apex build is, byte for byte, the approved published manifest, no "o", no draft', () => {
  const buf = fs.readFileSync(abs(`${SCRATCH}/apex/i18n/index.js`));
  assert.equal(buf.toString('utf8'),publishedManifest(parseManifest(SOURCE)));
  assert.equal(parseManifest(buf.toString('utf8')).langs.length,47);
});

test('the apex page loads i18n.js, i18n/index.js and shell.js in this order, under the asset prefix, as classic scripts (FIL-6)', () => {
  assert.deepEqual(scripts(apexHtml), ['i18n.js', 'i18n/index.js', 'shell.js', 'navigation.js'].map(f => ({ attrs: `src="${PRE}${f}"`, body: '' })));
});

test('the apex page has no inline style, no style attribute and no event handler attribute: the live policy refuses them', () => {
  assert.doesNotMatch(apexHtml, /<style[\s>]/i);
  assert.doesNotMatch(apexHtml, /\sstyle\s*=/i);
  assert.doesNotMatch(apexHtml, /\son[a-z]+\s*=/i);
  assert.match(apexHtml, /^<!doctype html>\n<html lang="de" dir="ltr">\n<head>\n<meta charset="utf-8">/);           // FIL-13: the charset comes first
});

test('the source page: the same three scripts in the same order with no async, no defer and no type="module" (FIL-6), no hreflang and no alternate link (CHO-10)', () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  assert.deepEqual(scripts(html), ['i18n.js', 'i18n/index.js', 'shell.js', 'navigation.js'].map(f => ({ attrs: `src="${f}"`, body: '' })));
  assert.doesNotMatch(html, /hreflang|rel\s*=\s*["']alternate/i);
});

test('the drafts form is only written with --out, holds the source manifest and every language file, and says so in its json', () => {
  const none = tool('tools/build-apex.mjs', '--drafts');
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /--drafts needs --out/);
  assert.equal(drafts.drafts, true);
  assert.deepEqual(drafts.languages, CODES);
  const manifest = fs.readFileSync(abs(`${SCRATCH}/drafts/i18n/index.js`), 'utf8');
  assert.equal(manifest, fs.readFileSync(path.join(SITE, 'i18n/index.js'), 'utf8'));
  assert.match(manifest, /"dev":true/);
  const have = fs.readdirSync(path.join(SITE, 'i18n')).filter(f => f !== 'index.js').sort();
  assert.deepEqual(fs.readdirSync(abs(`${SCRATCH}/drafts/i18n`)).filter(f => f !== 'index.js').sort(), have);
});

test('the single-file build runs boot, i18n.js, the language files, the manifest, the Animations and shell.js, in this order, all inline (FIL-11, 7.11)', () => {
  const all = scripts(single);
  assert.ok(all.length >= 8, `${all.length} scripts`);
  assert.ok(all.every(x => x.attrs === '' && x.body.length > 0), 'every script is inline: no src, no other attribute');
  assert.doesNotMatch(single, /<script[^>]*\ssrc\s*=/i);
  const bodies = all.map(x => x.body);
  const at = needle => bodies.findIndex(b => b.includes(needle));
  const order = [at('window.Dream={prods:{}'), at('I.ready=new Promise'), at('Dream.lang("de"'), at('Dream.i18n.manifest({'), at('Dream.add({id:"4k"'), at('landing page – runtime')];
  assert.ok(order.every(i => i >= 0), JSON.stringify(order));
  assert.deepEqual([...order].sort((x, y) => x - y), order, 'the order of the scripts: ' + JSON.stringify(order));
  assert.equal(order[0], 0, 'the boot script is first: it assigns window.Dream');
  assert.ok(bodies[order[3]].includes('"dev":false') && !bodies[order[3]].includes('"o"'), 'the manifest of the single-file build is the published form');
});

test('standalone website menu points to published pages, never missing sibling routes',()=>{for(const route of ['/','/referenzen/','/teamwork/','/glossar/','/bildungshaus/'])assert.ok(single.includes('href="https://dreambau.com'+route+'"'),route);assert.doesNotMatch(single,/<a\b[^>]*href="\//);});
