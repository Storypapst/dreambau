// C44 (X1 to X5, Q3): a clean first load. Against the page server with the example list and a status file that names
// all 21 ids: only requests to the own origin, at most 6, none for /favicon.ico, no cookie, empty storage, no
// policy-violation event, no console error and no page error.
//
// The observation proves itself first. It has two parts: `collect` watches a page, `judge` turns what was watched into
// a list of problems (empty = clean). Stand-in pages (answered by the browser's own routing, never by a network) break
// one rule each and must be flagged for it; a clean one must pass; `judge` itself is proved on made-up observations.
//
// Measured limit (Playwright 1.56.1, headless Chromium): neither the icon request of a page nor a request that the page
// makes for /favicon.ico itself shows in Playwright's request events (a local server saw it, the events did not). So
// that part of the rule cannot be watched here; it is kept in `judge` and proved there on a made-up request list, and
// X5 is enforced where it can be: the markup must carry the data address as the icon, so that no browser asks for one.
import { check, same, run } from '../lib/check.mjs';
import { launchBrowser, openObserved, storedByThePage } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

const LIMIT = 6;

// Loads a page and collects what the rules of the row ask about.
async function collect(browser, load) {
  const { context, page, seen, violations } = await openObserved(browser);
  try {
    await load(page, context);
    await page.waitForLoadState('networkidle');
    // A stand-in page sets window.__standInDone to false while its own work runs; any other page leaves it unset.
    await page.waitForFunction(() => window.__standInDone !== false, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300); // nothing more may happen after the first load
    return { requests: seen.requests.filter((request) => /^https?:/.test(request.url)).map((request) => request.url), stored: await storedByThePage(context, page), violations: await violations(), console: seen.console, pageErrors: seen.pageErrors };
  } finally {
    await context.close();
  }
}

// The rules of the row, as a list of problems.
function judge(observation, ownOrigin) {
  const problems = [];
  const { requests, stored } = observation;
  const foreign = requests.filter((url) => new URL(url).origin !== ownOrigin);
  if (foreign.length > 0) problems.push(`requests to other origins: ${foreign.map((url) => new URL(url).host).join(', ')}`);
  if (requests.length > LIMIT) problems.push(`${requests.length} requests, at most ${LIMIT} allowed`);
  if (requests.some((url) => new URL(url).pathname === '/favicon.ico')) problems.push('a request for /favicon.ico');
  if (stored.cookies.length > 0 || stored.documentCookie !== '') problems.push(`cookies: ${[...stored.cookies, stored.documentCookie].join(', ')}`);
  if (stored.localStorage > 0 || stored.sessionStorage > 0) problems.push(`web storage: ${stored.localStorage} local, ${stored.sessionStorage} session`);
  if (stored.indexedDB.length > 0) problems.push(`IndexedDB: ${stored.indexedDB.join(', ')}`);
  if (stored.caches.length > 0) problems.push(`Cache API: ${stored.caches.join(', ')}`);
  if (observation.violations.length > 0) problems.push(`policy violations: ${observation.violations.join(' | ')}`);
  const errors = observation.console.filter((message) => message.type === 'error');
  if (errors.length > 0) problems.push(`console errors: ${errors.map((message) => message.text).join(' | ').slice(0, 160)}`);
  if (observation.pageErrors.length > 0) problems.push(`page errors: ${observation.pageErrors.join(' | ').slice(0, 160)}`);
  return problems;
}

// ---- the stand-in pages ----
const STAND_IN = 'https://stand-in.example.test';
const OTHER = 'https://other.example.test';
const work = (body) => `<script>window.__standInDone = false; (async () => { ${body} })().finally(() => { window.__standInDone = true; });</script>`;
const markup = (body = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stand-in</title></head><body><p>Stand-in</p>${body}</body></html>`;

// [what the case is called, the problem that must be among the findings, its markup, its headers]
const BREAKS = [
  ['a request to another origin', 'requests to other origins', markup(work(`await fetch('${OTHER}/data', { mode: 'no-cors' });`))],
  ['seven more requests', 'at most 6 allowed', markup(Array.from({ length: 7 }, (_, index) => `<img src="/i${index}.png" alt="">`).join(''))],
  ['a cookie', 'cookies', markup(work(`document.cookie = 'visit=1';`))],
  ['local storage', 'web storage', markup(work(`localStorage.setItem('a', '1');`))],
  ['session storage', 'web storage', markup(work(`sessionStorage.setItem('b', '2');`))],
  ['an IndexedDB database', 'IndexedDB', markup(work(`await new Promise((resolve) => { const request = indexedDB.open('stand-in-db'); request.onsuccess = resolve; request.onerror = resolve; });`))],
  ['a Cache API entry', 'Cache API', markup(work(`await caches.open('stand-in-cache');`))],
  ['an inline script under a policy that forbids it', 'policy violations', markup(work('window.ran = true;')), { 'content-security-policy': "script-src 'self'" }],
  ['a console error', 'console errors', markup(work(`console.error('a console error');`))],
  ['an uncaught error', 'page errors', markup(work(`setTimeout(() => { throw new Error('an uncaught error'); }, 0);`))],
];

// Serves a stand-in page at its invented address; every other address answers 200 with nothing in it.
const standIn = (html, headers = {}) => async (page, context) => {
  await context.route('https://**/*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await context.route(`${STAND_IN}/`, (route) => route.fulfill({ status: 200, contentType: 'text/html', headers, body: html }));
  await page.goto(`${STAND_IN}/`);
};

const NOTHING = { requests: [`${STAND_IN}/`], stored: { cookies: [], documentCookie: '', localStorage: 0, sessionStorage: 0, indexedDB: [], caches: [] }, violations: [], console: [], pageErrors: [] };

let browser;
let server;
try {
  await run(async () => {
    // ---- `judge` on made-up observations ----
    same('C44 judge passes an observation in which nothing happened', judge(NOTHING, STAND_IN), []);
    check('C44 judge flags a request for /favicon.ico', judge({ ...NOTHING, requests: [...NOTHING.requests, `${STAND_IN}/favicon.ico`] }, STAND_IN).includes('a request for /favicon.ico'));
    check('C44 judge flags exactly 7 requests and lets 6 pass',
      judge({ ...NOTHING, requests: Array.from({ length: 7 }, (_, index) => `${STAND_IN}/${index}`) }, STAND_IN).some((problem) => problem.includes('at most 6 allowed'))
      && judge({ ...NOTHING, requests: Array.from({ length: 6 }, (_, index) => `${STAND_IN}/${index}`) }, STAND_IN).length === 0);

    // ---- the collection proves itself on stand-in pages ----
    browser = await launchBrowser();
    same('C44 the observation passes a clean stand-in page', judge(await collect(browser, standIn(markup())), STAND_IN), []);
    for (const [what, rule, html, headers] of BREAKS) {
      const problems = judge(await collect(browser, standIn(html, headers)), STAND_IN);
      check(`C44 the observation flags ${what}`, problems.some((problem) => problem.includes(rule)), `problems: ${problems.map((problem) => problem.slice(0, 60)).join(' | ') || 'none'}`);
    }

    // ---- the real page ----
    server = await startPageServer();
    const observation = await collect(browser, async (page) => {
      await page.goto(server.url);
      await page.waitForFunction(() => document.querySelectorAll('ul > li > a').length > 0, null, { timeout: 15000 }).catch(() => {});
    });
    same('C44 X1 X2 X3 X4 X5 Q3 a clean first load: own origin only, at most 6 requests, no favicon request, no cookie, empty storage, no policy violation, no console error, no page error', judge(observation, server.origin), []);
    same('C44 Q3 the requests are the page, its stylesheet, its script and the two data files', observation.requests.map((url) => new URL(url).pathname).sort(),
      ['/teamwork/', '/teamwork/data/programs.json', '/teamwork/data/status.json', '/teamwork/teamwork.css', '/teamwork/teamwork.js']);
    check('C44 X5 the favicon is a data address in the markup', (await (await fetch(server.url)).text()).includes('<link rel="icon" href="data:,">'));
  });
} finally {
  if (browser) await browser.close();
  if (server) await server.stop();
}
