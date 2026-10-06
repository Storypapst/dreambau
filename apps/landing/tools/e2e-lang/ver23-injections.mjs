// VER-23 (spec section 9, 7.12; FIL-8, FIL-9, FIL-10, ERR-2): failures of the language mechanism, injected with injectLangs. In every one
// the page stays German, shows no message and plays. The cases with the language files of other Sprachen come with the slices that load them.
//
// Timing. FIL-9: shell.js waits for Dream.i18n.ready after the Animation file has loaded and before it builds the first Tagline texture.
// FIL-8: ready resolves on registration, on a failure (the error event of the script ends the wait at once) or 3 s after i18n.js started.
// The page reports when it built that texture (the first texture upload, see _helpers.mjs); resource timing gives the end of each answer;
// everything is on the page's own clock. The page's own work between its Animation file and that texture (the raster of the Tagline) is
// about 0.1 s on the Mac of the first run, so the limits of the spec (1 s, and 3 s plus 0.5 s of slack) are measured on the delay between the two.
import { injectLangs } from '../lib.mjs';
import { checker, part, openPage, started, problems, state, resourceEnd, GERMAN_LINES } from './_helpers.mjs';

export const rows = ['VER-23'];

const PAGE = '/?anim=4k&test=1';
const MANIFEST_DE = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"de","n":"Deutsch","d":"ltr","s":"DE"}]});';
const MANIFEST_NO_DE = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"en","n":"English","d":"ltr","s":"EN"}]});';

// fallback: the expected Dream.state.langFallback; i18n: whether Dream.i18n exists afterwards; allow: what the browser prints by itself for the injected failure
// wait: how the wait for the language is expected to end
//   'none'     there is nothing to wait for
//   'at once'  a failure ends it (the error or load event, or a manifest that is plainly invalid): the texture comes within 1 s of the Animation file
//   'timer'    nothing ends it but the 3 s of FIL-8: the texture comes no earlier than 2.95 s after i18n.js arrived and within 3.5 s of the Animation file
//   'file'     the German file arrives late: the texture is built after it has arrived, and within 1 s of it
const CASES = [
  { name: 'the manifest is "{" (a script that does not parse)', spec: { manifest: '{' }, fallback: 'manifest', i18n: true, wait: 'timer',
    allow: [{ pageError: 'SyntaxError' }] },                                                  // the browser's own report of the broken script
  { name: 'the manifest answers 404', spec: { manifest: null }, fallback: 'manifest', i18n: true, wait: 'at once', allow: [{ url: '/i18n/index.js' }] },
  { name: 'the manifest parses but is invalid (no German)', spec: { manifest: MANIFEST_NO_DE }, fallback: 'manifest', i18n: true, wait: 'at once', allow: [] },
  { name: 'i18n.js answers 404 (the manifest then has no Dream to talk to)', spec: { runtime: null }, fallback: '', i18n: false, wait: 'none',
    allow: [{ url: '/i18n.js' }, { pageError: 'ReferenceError' }] },
  { name: 'the page is that of the previous Release (no #blind, no .sw, no language scripts)', spec: { page: 'previous' }, fallback: '', i18n: false, wait: 'none', allow: [], noSw: true },
  { name: 'i18n/de.js answers 404', spec: { manifest: MANIFEST_DE, files: { de: { status: 404 } } }, fallback: '', i18n: true, wait: 'at once', allow: [{ url: '/i18n/de.js' }] },
  { name: 'i18n/de.js loads but registers nothing', spec: { files: { de: { body: '/* empty */' } } }, fallback: '', i18n: true, wait: 'at once', allow: [] },
  { name: 'i18n/de.js answers after 1.5 s (the page waits for it, then starts)', spec: { files: { de: { delayMs: 1500 } } }, fallback: '', i18n: true, wait: 'file', allow: [] },
];

export default async function ({ base, browser, info }) {
  const check = checker();
  const ms = x => Math.round(x) + ' ms';

  for (const c of CASES) {
    await part(check, c.name, async () => {
      const t = await openPage(browser);
      try {
        await injectLangs(t.page, c.spec);
        await t.page.goto(base + PAGE);
        await started(t.page);
        const s = await state(t.page);
        const at = `${c.name}:`;
        check(`${at} the page is German`, s.lang === 'de' && s.htmlLang === 'de' && JSON.stringify(s.lines) === JSON.stringify(GERMAN_LINES), JSON.stringify([s.lang, s.htmlLang, s.lines]));
        check(`${at} langFallback is ${JSON.stringify(c.fallback)}`, s.langFallback === c.fallback, JSON.stringify(s.langFallback));
        check(`${at} the Animation plays, with no error and no static fallback`, s.mode === 'play' && s.ready && !s.error && !s.fallback, JSON.stringify([s.mode, s.ready, s.error, s.fallback]));
        check(`${at} Dream.i18n is ${c.i18n ? 'there' : 'absent'}`, (s.i18n === 'object') === c.i18n, s.i18n);
        check(`${at} no .sw is shown`, c.noSw ? s.sw === null : !!s.sw && s.sw.hidden && s.sw.display === 'none', JSON.stringify(s.sw));
        for (const p of await problems(t, c.allow)) check(`${at} nothing but the browser's own lines`, false, p);

        const anim = resourceEnd(s, '/p/4k.js'), runtime = resourceEnd(s, '/i18n.js'), de = resourceEnd(s, '/i18n/de.js'), { tex } = s.timing;
        if (anim === undefined || tex === undefined) { check(`${at} the page reports its timing`, false, JSON.stringify({ anim, tex })); return; }
        info(`${c.name}: the first Tagline texture comes ${ms(tex - anim)} after the Animation file`);
        if (c.wait === 'none' || c.wait === 'at once') check(`${at} the wait ends at once: the texture comes within 1 s of the Animation file`, tex - anim <= 1000, ms(tex - anim));
        if (c.wait === 'timer') {
          check(`${at} FIL-9: the first Tagline texture waits for the 3 s of FIL-8 (no earlier than 2.95 s after i18n.js came)`, runtime !== undefined && tex - runtime >= 2950, `built ${ms(tex - runtime)} after i18n.js came`);
          check(`${at} FIL-8: the wait is at most 3 s plus 0.5 s of slack after the Animation file`, tex - anim <= 3500, ms(tex - anim));
        }
        if (c.wait === 'file') {
          check(`${at} the German file was late indeed`, de - anim >= 800, `${ms(de - anim)} after the Animation file`);
          check(`${at} FIL-9: the first Tagline texture is built after the German file has arrived, and soon after it`, de !== undefined && tex >= de && tex - de <= 1000, `texture at ${ms(tex)}, file at ${ms(de)}`);
        }
      } finally { await t.close(); }
    });
  }
  check.done();
}
