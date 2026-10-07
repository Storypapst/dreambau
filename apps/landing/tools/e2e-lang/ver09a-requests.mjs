// VER-9, part a (spec section 9; FIL-4 to FIL-9, FIL-11, FIL-13, SCR-1): what a German visitor requests, the hold-back of FIL-7, a clean
// console, the language file read correctly although the answer carries no charset, and the single-file build.
// Parts b to d of VER-9 (a visitor of another Sprache, the first Tagline from the chosen file, a switch) come with the slices that build them.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, mkdir } from '../lib.mjs';
import { checker, part, openPage, started, problems, state, sleep, GERMAN_LINES } from './_helpers.mjs';

export const rows = ['VER-9a'];

const PRE = '/homepage-assets/';
const pathOf = u => new URL(u).pathname;
const isLangPath = p => /\/i18n\.js$/.test(p) || /\/i18n\/[^/]+$/.test(p);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default async function ({ base, browser }) {
  const check = checker();

  // --- a German visitor on the served build (the live headers and types)
  await part(check, 'a German visitor', async () => {
    const t = await openPage(browser, { spyLang: true });
    try {
      await t.page.goto(`${base}/?anim=4k&test=1`);
      await started(t.page);
      const s = await state(t.page);
      const langPaths = t.seen.requests.map(r => pathOf(r.url)).filter(isLangPath);
      check('FIL-4: the language requests are i18n.js, i18n/index.js and i18n/de.js, once each, and no other language file',
        same([...langPaths].sort(), [PRE + 'i18n.js', PRE + 'i18n/de.js', PRE + 'i18n/index.js']), langPaths.join(', '));
      check('FIL-5: the three are scripts, and the page makes no fetch or XHR request', t.seen.requests.filter(r => isLangPath(pathOf(r.url))).every(r => r.type === 'script')
        && t.seen.requests.every(r => r.type !== 'fetch' && r.type !== 'xhr'), t.seen.requests.map(r => r.type + ' ' + pathOf(r.url)).join(', '));
      check('SCR-1: no font is requested', t.seen.requests.every(r => r.type !== 'font' && !/\.(woff2?|ttf|otf|eot)(\?|$)/i.test(r.url)));
      check('FIL-4: German is registered and nothing else', same(s.registered, ['de']), JSON.stringify(s.registered));
      check('the page is German, plays, and shows no error', s.lang === 'de' && s.htmlLang === 'de' && s.mode === 'play' && s.ready && !s.fallback && !s.error, JSON.stringify(s).slice(0, 300));
      check('the Tagline is built from the markup (a German page)', same(s.lines, GERMAN_LINES), JSON.stringify(s.lines));
      check('SW-3: switch is not visible/focusable before the closing line',await t.page.locator('#lang').evaluate(el=>getComputedStyle(el).visibility==='hidden'));
      await t.page.evaluate(()=>Dream.test.seek(Dream.test.def().cta));
      check('SW-3: switch appears with the closing line',await t.page.locator('#lang').evaluate(el=>getComputedStyle(el).visibility==='visible'));
      const de = t.seen.responses.find(r => pathOf(r.url) === PRE + 'i18n/de.js');
      check('FIL-13: the answer for i18n/de.js carries no charset', !!de && de.status === 200 && de.type === 'application/javascript', JSON.stringify(de));
      const reg = await t.page.evaluate(() => window.__probe.lang);
      check('FIL-13: the non-ASCII German text is read correctly (UTF-8 from the page, not from the answer)',
        reg.length === 1 && reg[0][0] === 'de' && reg[0][1]['tag.1'] === 'Jeht nich…' && reg[0][1]['skip.label'] === 'überspringen' && reg[0][1]['blind.4k'].includes('„{tag1}“'), JSON.stringify(reg).slice(0, 200));
      for (const p of await problems(t)) check('a clean console', false, p);
    } finally { await t.close(); }
  });

  // --- FIL-7: the request for the language file leaves while the answer for shell.js is held back
  await part(check, 'FIL-7', async () => {
    const t = await openPage(browser);
    let heldAt = 0, releasedAt = 0;
    try {
      await t.page.route('**/shell.js', async route => { heldAt = Date.now(); await sleep(1000); releasedAt = Date.now(); await route.continue(); });
      await t.page.goto(`${base}/?anim=4k&test=1`);
      await started(t.page);
      const de = t.seen.requests.find(r => pathOf(r.url) === PRE + 'i18n/de.js');
      check('FIL-7: shell.js was held back for 1 s', heldAt > 0 && releasedAt - heldAt >= 1000, `${releasedAt - heldAt} ms`);
      check('FIL-7: the request for i18n/de.js leaves during that hold (the manifest starts the loading at once)', !!de && de.at < releasedAt,
        de ? `${de.at - heldAt} ms after the hold began, the hold ended after ${releasedAt - heldAt} ms` : 'no request for i18n/de.js');
      const s = await state(t.page);
      check('FIL-7: the page still starts, German', s.lang === 'de' && s.mode === 'play' && !s.error, JSON.stringify(s).slice(0, 200));
      for (const p of await problems(t)) check('FIL-7: a clean console', false, p);
    } finally { await t.close(); }
  });

  // --- FIL-11: the single-file build (npm run bundle) requests no language file
  await part(check, 'FIL-11', async () => {
    const file = path.join(mkdir(path.join(ROOT, 'dist', 'e2e-lang')), 'single-file.html');
    execFileSync(process.execPath, ['tools/bundle.mjs', '--out', file], { cwd: ROOT, stdio: 'pipe' });
    const t = await openPage(browser);
    try {
      await t.page.goto(pathToFileURL(file).href + '?anim=4k&test=1');
      await started(t.page);
      const s = await state(t.page);
      check('FIL-11: the single-file page requests no language file', t.seen.requests.filter(r => isLangPath(pathOf(r.url))).length === 0, t.seen.requests.map(r => r.url).join(', '));
      check('FIL-11: Dream.i18n exists and German is registered', s.i18n === 'object' && s.registered.includes('de') && s.registered.length===47, `${s.i18n} ${JSON.stringify(s.registered)}`);
      check('FIL-11: the single-file page plays, German', s.lang === 'de' && s.mode === 'play' && s.ready && !s.error && !s.fallback, JSON.stringify(s).slice(0, 200));
      for (const p of await problems(t)) check('FIL-11: a clean console', false, p);
    } finally { await t.close(); }
  });

  check.done();
}
