// Helpers shared by the modules of tools/e2e-lang/ (a file whose name begins with "_" is no module, see tools/e2e-lang.mjs).
// A later module that needs a helper of its own adds a new _<topic>.mjs and edits none of the existing ones.

const GL_NOISE = /GPU stall|GL Driver Message/;        // the graphics driver's one-time messages: the harness, not the page (as in tools/lib.mjs)
export const sleep = ms => new Promise(res => setTimeout(res, ms));

// Collects failed checks, so that a module reports every one of them at once. check(name, ok, detail) returns ok; check.done() throws when any failed.
export function checker() {
  const failed = [];
  const check = (name, ok, detail = '') => { if (!ok) failed.push(detail ? `${name} (${detail})` : name); return !!ok; };
  check.done = () => { if (failed.length) throw new Error(failed.map(f => '- ' + f).join('\n')); };
  return check;
}

// Runs one part of a module. An exception inside it (a page that does not load, a file that is missing) is recorded as a failed check
// instead of ending the module, so that one run reports every failure of the module at once.
export async function part(check, name, fn) {
  try { await fn(); } catch (e) { check(`${name}: could not be run`, false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
}

// What an init script records in every page of these modules (window.__probe): securitypolicyviolation events, the time of the first
// texture upload (shell.js: the Tagline, uploadText), the time at which <html> gets the class "ready", and, when spyLang is on, every call
// of Dream.lang(code, object): the language files are public (spec 7.11), so what they register can be read without touching the runtime.
// spyLang creates window.Dream early, so leave it off where a missing runtime must behave as it does for a visitor.
function probes(spyLang) {
  const p = window.__probe = { csp: [], tex: undefined, ready: undefined, lang: [] };
  document.addEventListener('securitypolicyviolation', e => p.csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  const texImage2D = WebGL2RenderingContext.prototype.texImage2D;
  WebGL2RenderingContext.prototype.texImage2D = function (...args) { if (p.tex === undefined) p.tex = performance.now(); return texImage2D.apply(this, args); };
  new MutationObserver(() => { if (p.ready === undefined && document.documentElement.classList.contains('ready')) p.ready = performance.now(); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (spyLang) {
    let lang;
    Object.defineProperty(window.Dream = window.Dream || {}, 'lang', { configurable: true, enumerable: true, get: () => lang, set: f => { lang = (code, obj) => { p.lang.push([code, obj]); return f(code, obj); }; } });
  }
}

// A page in its own context, with everything a "clean console" needs (spec 9, test setup): console errors and warnings, page errors,
// failed requests, HTTP statuses of 400 and more, policy violations; plus the requests and responses it made.
export async function openPage(browser, { w = 320, h = 180, javaScript = true, spyLang = false, contextOptions = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, javaScriptEnabled: javaScript, locale: "de-DE", ...contextOptions });
  const page = await context.newPage();
  const seen = { console: [], pageErrors: [], failed: [], http: [], requests: [], responses: [] };
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !GL_NOISE.test(m.text())) seen.console.push({ text: m.text(), url: m.location().url || '' }); });
  page.on('pageerror', e => seen.pageErrors.push({ name: e.name, message: e.message }));
  page.on('requestfailed', r => seen.failed.push({ url: r.url(), why: (r.failure() || {}).errorText || '' }));
  page.on('response', r => {
    seen.responses.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] || '' });
    if (r.status() >= 400) seen.http.push({ url: r.url(), status: r.status() });
  });
  page.on('request', r => seen.requests.push({ url: r.url(), type: r.resourceType(), at: Date.now() }));
  if (javaScript) await page.addInitScript(probes, spyLang);
  return { context, page, seen, close: () => context.close() };
}

// Waits until the page has started (test mode: Dream.test exists) or has failed (Dream.state.error).
export const started = (page, timeout = 90000) => page.waitForFunction(() => window.Dream && window.Dream.state && (window.Dream.test || window.Dream.state.error), null, { timeout });

// Everything on the console that a clean page does not have, as a list of lines. allow lists what a row names as expected:
//   { url }                  any console message, failed request or HTTP error that mentions this text (the browser's own lines for an injected failure)
//   { pageError: 'Name' }    one page error of this kind (the browser's own report of an injected script)
export async function problems(t, allow = []) {
  const probe = await t.page.evaluate(() => window.__probe && window.__probe.csp).catch(() => null);
  const out = [];
  const byUrl = (text, url = '') => allow.some(a => a.url && (text.includes(a.url) || url.includes(a.url)));
  for (const c of t.seen.console) if (!byUrl(c.text, c.url)) out.push(`console: ${c.text.slice(0, 200)}`);
  for (const f of t.seen.failed) if (!byUrl(f.url)) out.push(`request failed: ${f.url} ${f.why}`);
  for (const h of t.seen.http) if (!byUrl(h.url)) out.push(`HTTP ${h.status}: ${h.url}`);
  const left = allow.filter(a => a.pageError).map(a => a.pageError);
  for (const e of t.seen.pageErrors) {
    const i = left.indexOf(e.name);
    if (i >= 0) left.splice(i, 1); else out.push(`page error: ${e.name}: ${e.message}`);
  }
  for (const v of probe || []) out.push(`policy violation: ${v}`);
  return out;
}

// The states of a started page that the checks read.
export const state = page => page.evaluate(() => {
  const D = window.Dream, sw = document.querySelector('.sw'), html = document.documentElement;
  return {
    htmlLang: html.lang, lang: D.state.lang, langSource: D.state.langSource, langFallback: D.state.langFallback, error: D.state.error, mode: D.state.mode,
    ready: html.classList.contains('ready'), fallback: html.classList.contains('static'), i18n: typeof D.i18n,
    registered: D.i18n && D.i18n.registered ? D.i18n.registered() : null, lines: D.text && D.text.lines ? D.text.lines.map(l => l.text) : null,
    sw: sw ? { hidden: sw.hidden, display: getComputedStyle(sw).display } : null,
    timing: { tex: window.__probe && window.__probe.tex, ready: window.__probe && window.__probe.ready,
      resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, end: r.responseEnd })) },
  };
});
export const resourceEnd = (s, suffix) => { const r = s.timing.resources.find(x => x.name.endsWith(suffix)); return r ? r.end : undefined; };

export const GERMAN_LINES = ['Jeht nich…', 'jibs nich…', 'dreambau.com'];
