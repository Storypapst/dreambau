/*! dreambau.com landing page – language mechanism. A classic script that runs before the manifest (i18n/index.js) and shell.js: it loads
 * i18n/<code>.js by inserting <script src> and tells shell.js when the first tagline may be drawn (Dream.i18n.ready). Without it, the
 * manifest or a file the page stays the German page of index.html. Seven sections with end markers: one piece of work edits one section. */
(() => {
'use strict';

// ---- state ----
const D = (window.Dream = window.Dream || {}), S = (D.state = D.state || {}), I = (D.i18n = {}), reg = {};   // reg: code -> texts
S.lang = 'de'; S.langSource = 'fallback'; S.langFallback = '';
I.registered = () => Object.keys(reg);
I.fam = '"Inter","SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",Arial,"Liberation Sans","DejaVu Sans",system-ui,sans-serif';   // = fam in shell.js
// ---- end state ----

// ---- choice ----
// ---- end choice ----

// ---- load ----
const cs = document.currentScript, base = cs && cs.src ? cs.src.replace(/[^/]*$/, '') : '';   // the folder of this file; '' in the single-file build
let done, got = false;                            // got: the manifest has arrived, valid or not
I.ready = new Promise(res => { done = res; });    // never rejects: it ends when German is registered, a script fails or 3 s are over
const stop = why => { if (why) S.langFallback = why; done(); };
D.lang = (code, texts) => { reg[code] = texts; if (reg.de) done(); };
function load(code) {
  if (reg[code]) return;                          // registered already: the single-file build requests nothing
  const s = document.createElement('script');
  s.src = base + 'i18n/' + code + '.js';
  document.head.appendChild(s);
}
// the manifest of 7.6; o (1 or 0) is on each row of the source form (dev) and on none of the published one
function valid(m) {
  if (!m || m.v !== 1 || typeof m.dev !== 'boolean' || !Array.isArray(m.langs)) return false;
  const seen = new Set();
  for (const l of m.langs) {
    if (!l || ['c', 'n', 's'].some(k => typeof l[k] !== 'string' || !l[k]) || (l.d !== 'ltr' && l.d !== 'rtl') || seen.has(l.c)) return false;
    if ('o' in l ? !m.dev || (l.o !== 0 && l.o !== 1) : m.dev) return false;
    seen.add(l.c);
  }
  return seen.has('de');
}
I.manifest = m => {
  got = true;
  if (!valid(m)) return stop('manifest');
  load('de');                                     // the request leaves now, while shell.js is still on its way
};
// a failed script ends the wait at once; index.html has no handler attributes, so the events are caught on the way down
const own = e => e.target.tagName === 'SCRIPT' && /\/i18n\/([^/]+)\.js$/.exec(e.target.src);
document.addEventListener('error', e => { const f = own(e); if (f) stop(f[1] === 'index' ? 'manifest' : ''); }, true);
document.addEventListener('load', e => { const f = own(e); if (f && f[1] !== 'index' && !reg[f[1]]) stop(); }, true);   // loaded, but registered nothing
setTimeout(() => { if (!got) S.langFallback = 'manifest'; done(); }, 3000);   // at most 3 s after this file started
// ---- end load ----

// ---- apply ----
// ---- end apply ----

// ---- glyphs ----
// ---- end glyphs ----

// ---- switch ----
// ---- end switch ----

// ---- sheet ----
// ---- end sheet ----
})();
