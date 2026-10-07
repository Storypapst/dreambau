// VER-23 (spec section 9, 7.12; FIL-8, FIL-9, FIL-10, ERR-2): failures of the language mechanism, injected with injectLangs. In every one
// the page stays German, shows no message and plays. The cases with the language files of other Sprachen come with the slices that load them.
//
// Timing. FIL-9: shell.js waits for Dream.i18n.ready after the Animation file has loaded and before it builds the first Tagline texture.
// FIL-8: ready resolves on registration, on a failure (the error event of the script ends the wait at once) or 3 s after i18n.js started.
// Capture script load events and Promise settlement on the page's monotonic clock. Texture upload is a separate FIL-9 ordering check:
// WebGL setup and Tagline rasterization happen after readiness and must not count as language-loading time.
import { injectLangs } from '../lib.mjs';
import { checker, part, openPage, started, problems, state, resourceEnd, GERMAN_LINES } from './_helpers.mjs';

export const rows = ['VER-23'];

const PAGE = '/?anim=4k&test=1';
const MANIFEST_DE = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"de","n":"Deutsch","d":"ltr","s":"DE"}]});';
const MANIFEST_NO_DE = 'Dream.i18n.manifest({"v":1,"dev":false,"langs":[{"c":"en","n":"English","d":"ltr","s":"EN"}]});';

// fallback: the expected Dream.state.langFallback; i18n: whether Dream.i18n exists afterwards; allow: what the browser prints by itself for the injected failure
// wait: how the wait for the language is expected to end
//   'none'     there is nothing to wait for
//   'at once'  a failure ends readiness (the error or load event, or a manifest that is plainly invalid) within 1 s of the Animation file
//   'timer'    nothing ends readiness but the 3 s of FIL-8: no earlier than 2.95 s after i18n.js ran and within 3.5 s of the Animation file
//   'file'     the German file arrives late: the texture is built after it has arrived, and within 1 s of it
const CASES = [
  { name: 'the manifest is "{" (a script that does not parse)', spec: { manifest: '{' }, fallback: 'manifest', i18n: true, wait: 'timer',
    allow: [{ pageError: 'SyntaxError' }] },                                                  // the browser's own report of the broken script
  { name: 'the manifest answers 404', spec: { manifest: null }, fallback: 'manifest', i18n: true, wait: 'at once', allow: [{ url: '/i18n/index.js' }] },
  { name: 'the manifest parses but is invalid (no German)', spec: { manifest: MANIFEST_NO_DE }, fallback: 'manifest', i18n: true, wait: 'at once', allow: [] },
  { name: 'i18n.js answers 404 (the manifest then has no Dream to talk to)', spec: { runtime: null }, fallback: '', i18n: false, wait: 'none',
    allow: [{ url: '/i18n.js' }, { pageError: 'ReferenceError' }] },
  { name: 'the page is that of the previous Release (no #blind, no .sw, no language scripts)', spec: { page: 'previous' }, fallback: '', i18n: false, wait: 'none', allow: [], noSw: true },
  { name: 'i18n/de.js answers 404', spec: { manifest: MANIFEST_DE, files: { de: { status: 404 } } }, fallback: 'load', i18n: true, wait: 'at once', allow: [{ url: '/i18n/de.js' }] },
  { name: 'i18n/de.js loads but registers nothing', spec: { files: { de: { body: '/* empty */' } } }, fallback: 'load', i18n: true, wait: 'at once', allow: [] },
  { name: 'i18n/de.js answers after 1.5 s (the page waits for it, then starts)', spec: { files: { de: { delayMs: 1500 } } }, fallback: '', i18n: true, wait: 'file', allow: [] },
];

export default async function ({ base, browser, info }) {
  const check = checker();
  const ms = x => Math.round(x) + ' ms';

  for (const c of CASES) {
    await part(check, c.name, async () => {
      const t = await openPage(browser);
      try {
        await t.page.addInitScript(() => {
          const timing = window.__languageReadiness = {};
          document.addEventListener('load', event => {
            const src = event.target.src || '';
            if (src.endsWith('/i18n.js')) {
              timing.runtime = performance.now();
              window.Dream.i18n.ready.then(() => { timing.settled = performance.now(); });
            }
            if (src.endsWith('/p/4k.js')) timing.animation = performance.now();
          }, true);
        });
        await injectLangs(t.page, c.spec);
        await t.page.goto(base + PAGE);
        await started(t.page);
        const s = await state(t.page);
        const at = `${c.name}:`;
        check(`${at} the page is German`, s.lang === 'de' && s.htmlLang === 'de' && JSON.stringify(s.lines) === JSON.stringify(GERMAN_LINES), JSON.stringify([s.lang, s.htmlLang, s.lines]));
        check(`${at} langFallback is ${JSON.stringify(c.fallback)}`, s.langFallback === c.fallback, JSON.stringify(s.langFallback));
        check(`${at} the Animation plays, with no error and no static fallback`, s.mode === 'play' && s.ready && !s.error && !s.fallback, JSON.stringify([s.mode, s.ready, s.error, s.fallback]));
        check(`${at} Dream.i18n is ${c.i18n ? 'there' : 'absent'}`, (s.i18n === 'object') === c.i18n, s.i18n);
        if(c.noSw||c.spec.manifest!==undefined||c.spec.runtime===null)check(`${at} no .sw is shown`,c.noSw?s.sw===null:!!s.sw&&s.sw.hidden&&s.sw.display==='none',JSON.stringify(s.sw));
        for (const p of await problems(t, c.allow)) check(`${at} nothing but the browser's own lines`, false, p);

        const anim = resourceEnd(s, '/p/4k.js'), runtime = resourceEnd(s, '/i18n.js'), de = resourceEnd(s, '/i18n/de.js'), { tex } = s.timing;
        if (anim === undefined || tex === undefined) { check(`${at} the page reports its timing`, false, JSON.stringify({ anim, tex })); return; }
        info(`${c.name}: the first Tagline texture comes ${ms(tex - anim)} after the Animation file`);
        const timing = await t.page.evaluate(() => window.__languageReadiness);
        if (c.i18n) {
          info(`${c.name}: readiness settles ${ms(timing.settled - timing.animation)} after the Animation load event; texture work takes ${ms(tex - timing.settled)} afterwards`);
          check(`${at} readiness and script load events were observed`, ['runtime', 'animation', 'settled'].every(key => Number.isFinite(timing[key])), JSON.stringify(timing));
          check(`${at} FIL-9: the first Tagline texture is built after language readiness`, tex >= timing.settled, JSON.stringify({ tex, settled: timing.settled }));
        }
        if (c.wait === 'none') check(`${at} without a language runtime the texture comes within 1 s of the Animation file`, tex - anim <= 1000, ms(tex - anim));
        if (c.wait === 'at once') check(`${at} the wait ends at once: readiness comes within 1 s of the Animation file`, timing.settled - timing.animation <= 1000, ms(timing.settled - timing.animation));
        if (c.wait === 'timer') {
          check(`${at} FIL-8: readiness waits for the timer (no earlier than 2.95 s after i18n.js ran)`, runtime !== undefined && timing.settled - timing.runtime >= 2950, `settled ${ms(timing.settled - timing.runtime)} after i18n.js ran`);
          check(`${at} FIL-8: readiness is at most 3 s plus 0.5 s of slack after the Animation file`, timing.settled - timing.animation <= 3500, ms(timing.settled - timing.animation));
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
