// tools/e2e-lang.mjs (npm run e2e:lang): how the runner finds and runs the browser modules of tools/e2e-lang/ (plan, slice 1).
// The runner is started as a command, as the gate does. The modules here are throw-away fakes in a scratch folder (--modules <dir>),
// so that the rules are proven without depending on any real module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib.mjs';

const run = (...args) => spawnSync(process.execPath, ['tools/e2e-lang.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
const lines = r => (r.stdout || '').split('\n').filter(l => /^(PASS|FAIL)\s/.test(l));

// ---- fake modules ---------------------------------------------------------------------------------------------------------------
const mods = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-lang-mods-'));
const out = path.join(mods, 'ran.txt');
const body = (name, extra = '', work = '') => `import fs from 'node:fs';
${extra}
export const rows = ['ROW-${name}'];
export default async function (ctx) {
  fs.appendFileSync(${JSON.stringify(out)}, ${JSON.stringify(name)} + ' ' + (ctx && ctx.quick ? 'quick' : 'full') + '\\n');
  ${work}
}
`;
fs.writeFileSync(path.join(mods, 'a-pass.mjs'), body('a-pass', '', `
  if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(ctx.base)) throw new Error('base: ' + ctx.base);
  const r = await fetch(ctx.base + '/'); if (r.status !== 200) throw new Error('the served build answers ' + r.status);
  const page = await ctx.browser.newPage(); await page.goto('data:text/html,<p>x</p>');         // a page that the module leaves open
  if (!ctx.langs.includes('de')) throw new Error('langs: ' + ctx.langs);
  if (!Array.isArray(ctx.sizes) || !ctx.sizes.every(s => s.w > 0 && s.h > 0)) throw new Error('sizes');
  fs.appendFileSync(${JSON.stringify(out)}, 'sizes ' + ctx.sizes.map(s => s.w + 'x' + s.h).join(',') + '\\n');
  fs.appendFileSync(${JSON.stringify(out)}, 'langs ' + ctx.langs.join(',') + '\\n');
  fs.appendFileSync(${JSON.stringify(out)}, 'dir ' + ctx.dir + '\\n');`));
fs.writeFileSync(path.join(mods, 'b-fail.mjs'), body('b-fail', '', "throw new Error('boom: the second line\\nand a third');"));
fs.writeFileSync(path.join(mods, '_helper.mjs'), body('_helper'));                              // a helper, not a module
fs.writeFileSync(path.join(mods, 'c-optional.mjs'), body('c-optional', 'export const byDefault = false;'));
fs.writeFileSync(path.join(mods, 'd-extra.mjs'), body('d-extra', "export const byDefault = false; export const option = 'extra';"));
fs.writeFileSync(path.join(mods, 'notes.txt'), 'not a module');
test.after(() => fs.rmSync(mods, { recursive: true, force: true }));
const ran = () => fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean) : [];
const reset = () => fs.rmSync(out, { force: true });

test('--rotate without a rotate module says so and exits 2, before it builds anything', () => {
  const r = run('--modules', mods, '--rotate');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no rotate module/);
});

test('--only with a text that no module name contains exits 2 and lists the modules', () => {
  const r = run('--modules', mods, '--only', 'no-such-module-zz');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no module/i);
  assert.match(r.stderr, /a-pass/);
});

test('--lang with a language that has no file exits 2', () => {
  const r = run('--modules', mods, '--lang', 'xx');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /xx/);
});

test('a plain run: one PASS or FAIL line per module with its rows, the failure with its message, exit 1; helpers and optional modules do not run', () => {
  reset();
  const r = run('--modules', mods);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const l = lines(r);
  assert.deepEqual(l.map(x => x.split(/\s+/).slice(0, 3).join(' ')), ['PASS a-pass ROW-a-pass', 'FAIL b-fail ROW-b-fail']);
  assert.match(r.stdout, /boom: the second line\s+and a third/);
  assert.deepEqual(ran().filter(x => !/^(sizes|langs|dir) /.test(x)), ['a-pass full', 'b-fail full']);
  assert.ok(ran().includes('langs de'));
  assert.ok(ran().some(x => /^sizes 1280x720,844x390,390x844,375x667,360x640,320x568$/.test(x)), 'the six sizes of SW-21');
  assert.ok(ran().some(x => /^dir .*dist.apex-drafts$/.test(x)), 'the module gets the folder of the drafts build');
});

test('--quick: the two phone sizes only, no optional module', () => {
  reset();
  const r = run('--modules', mods, '--quick');
  assert.equal(r.status, 1);
  assert.deepEqual(ran().filter(x => !/^(langs|dir) /.test(x)), ['a-pass quick', 'sizes 390x844,320x568', 'b-fail quick']);
});

test('--only runs the modules whose file name contains the text, an optional one included, and --quick does not stop it', () => {
  reset();
  let r = run('--modules', mods, '--only', 'c-opt', '--quick');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(lines(r).map(x => x.split(/\s+/)[1]), ['c-optional']);
  assert.deepEqual(ran(), ['c-optional quick']);
  reset();
  r = run('--modules', mods, '--only', 'a-');
  assert.deepEqual(lines(r).map(x => x.split(/\s+/)[1]), ['a-pass']);
  assert.equal(r.status, 0);
});

test('a module with its own option runs when that option is given', () => {
  reset();
  const r = run('--modules', mods, '--extra');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(ran(), ['d-extra full']);
});

test('the runner leaves no server and no browser behind: it returns, and the pages a module left open are closed', () => {
  reset();
  const t0 = Date.now();
  const r = run('--modules', mods, '--only', 'a-pass');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(Date.now() - t0 < 120000);
  assert.match(r.stdout, /closed 1 page/i);                      // the page that a-pass left open is reported and closed
});
