#!/usr/bin/env node
// End-to-end checks of the language mechanism (spec section 9, rows VER-7 to VER-28) in headless Chromium.
//
//   node tools/e2e-lang.mjs [--lang de,en] [--quick] [--only <text>] [--rotate] [--allow-missing] [--modules <dir>]
//
// It builds the drafts form of the apex build (dist/apex-drafts: every language file and the source form of the manifest, never
// published), serves it with serveBuild of tools/lib.mjs (the live headers and types, spec section 4), starts one browser with launch()
// (CHROMIUM_EXECUTABLE picks the Chromium), runs the modules of tools/e2e-lang/ one after the other and prints one PASS or FAIL line
// for each, with the rows of the spec it covers. Exit 0: all passed; 1: a module failed or the build failed; 2: a wrong request.
// The server and the browser it started are closed at the end.
//
//   --lang         only these languages (comma separated; each needs a file in site/i18n/); default: every language that has a file
//                  in site/i18n/ and a row in the source manifest
//   --quick        the sizes 390 x 844 and 320 x 568 only (the six sizes of SW-21 otherwise); never runs an optional module on its own
//   --only <text>  only the modules whose file name contains the text; an optional module runs when it is named this way
//   --rotate       only the rotate test (the module with the option "rotate"); answers "no rotate module" and exits 2 while there is none
//   --allow-missing  a language that this machine cannot draw is listed and skipped instead of failing the run (modules read ctx.allowMissing)
//   --modules      the folder of the modules (default tools/e2e-lang); for the tests of this runner
//
// A module is a file tools/e2e-lang/<name>.mjs (a file whose name begins with "_" is a helper and no module) that exports
//   rows       the rows of the spec that it covers, for example ['VER-9a']
//   default    an async function (ctx) that throws when a check fails; ctx = { base, browser, langs, sizes, quick, allowMissing, dir, info }
//              base: the address of the served drafts build; langs: the codes of the run; sizes: [{ w, h }]; dir: the folder of the build
//   byDefault  optional; false: the module runs only when --only names it or its own option is given, never in a plain or --quick run
//   option     optional; the name of a command line option that selects it, and only the modules with a given option run (for example 'rotate')
// A later piece of work adds a module and edits nothing here.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, SITE, launch, parseArgs, serveBuild } from './lib.mjs';
import { parseManifest } from './lib-languages.mjs';

const PREFIX = '/homepage-assets/';
const a = parseArgs(process.argv.slice(2));
const usage = msg => { console.error('e2e-lang: ' + msg); process.exit(2); };

// ---- the modules ----------------------------------------------------------------------------------------------------------------
const modDir = path.resolve(ROOT, typeof a.modules === 'string' ? a.modules : 'tools/e2e-lang');
const all = [];
for (const f of fs.readdirSync(modDir).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort()) {
  all.push({ name: f.replace(/\.mjs$/, ''), mod: await import(pathToFileURL(path.join(modDir, f)).href) });
}
const only = typeof a.only === 'string' ? a.only : null;
const byOption = all.filter(m => m.mod.option && a[m.mod.option]);          // the modules that a command line option of their own selects
if (a.rotate && !all.some(m => m.mod.option === 'rotate')) usage('no rotate module (the rotate test is not part of this build yet)');
let chosen;
if (byOption.length) chosen = only ? byOption.filter(m => m.name.includes(only)) : byOption;
else if (only) {
  chosen = all.filter(m => m.name.includes(only));
  if (!chosen.length) usage(`no module matches --only ${only}; the modules are: ${all.map(m => m.name).join(', ') || '(none)'}`);
} else chosen = all.filter(m => m.mod.byDefault !== false);

// ---- the languages and the sizes ------------------------------------------------------------------------------------------------
const manifestRows = parseManifest(fs.readFileSync(path.join(SITE, 'i18n', 'index.js'), 'utf8')).langs.map(l => l.c);
const withFile = c => fs.existsSync(path.join(SITE, 'i18n', c + '.js'));
const haveFile = manifestRows.filter(withFile);
let langs = haveFile;
if (typeof a.lang === 'string') {
  langs = a.lang.split(',').map(c => c.trim()).filter(Boolean);
  const missing = langs.filter(c => !haveFile.includes(c));
  if (missing.length) usage(`no language file and manifest row for: ${missing.join(', ')} (the languages with a file are: ${haveFile.join(', ')})`);
}
const sizes = (a.quick ? [[390, 844], [320, 568]] : [[1280, 720], [844, 390], [390, 844], [375, 667], [360, 640], [320, 568]]).map(([w, h]) => ({ w, h }));

// ---- build, serve, run ----------------------------------------------------------------------------------------------------------
const b = spawnSync(process.execPath, ['tools/build-apex.mjs', '--out', 'dist/apex-drafts', '--drafts', '--assets', PREFIX], { cwd: ROOT, encoding: 'utf8' });
if (b.status !== 0) { console.error('e2e-lang: the build of the drafts form failed (did you run `npm run build`?)\n' + (b.stdout || '') + (b.stderr || '')); process.exit(1); }
const dir = path.join(ROOT, 'dist', 'apex-drafts');
const served = await serveBuild({ dir, prefix: PREFIX });
let browser = null, failed = 0;
const t0 = Date.now();
try {
  browser = await launch();
  console.log(`e2e:lang  ${served.base}  languages ${langs.join(',') || '(none)'}  sizes ${sizes.map(s => s.w + 'x' + s.h).join(' ')}${a.quick ? '  (quick)' : ''}`);
  const ctx = { base: served.base, browser, langs, sizes, quick: !!a.quick, allowMissing: !!a['allow-missing'], dir, info: msg => console.log('  INFO  ' + msg) };
  for (const { name, mod } of chosen) {
    const t1 = Date.now();
    let err = null;
    try { await mod.default(ctx); } catch (e) { err = e; }
    const rows = (mod.rows || []).join(', ');
    console.log(`${err ? 'FAIL' : 'PASS'}  ${name}  ${rows}  ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    if (err) { failed++; console.log('      ' + String(err && err.message || err).split('\n').join('\n      ')); }
    const left = browser.contexts();                         // a module closes what it opened; what it forgot is closed here
    const pages = left.reduce((n, c) => n + c.pages().length, 0);
    for (const c of left) await c.close();
    if (left.length) console.log(`  INFO  closed ${pages} page(s) that ${name} left open`);
  }
  console.log(failed ? `\ne2e:lang: ${failed} of ${chosen.length} module(s) failed` : `\ne2e:lang: ${chosen.length} module(s) passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  if (browser) await browser.close();
  await new Promise(res => served.server.close(res));
}
process.exit(failed ? 1 : 0);
