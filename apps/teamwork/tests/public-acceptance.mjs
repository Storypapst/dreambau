// Read-only acceptance on a published origin. Never prints program values or browser URLs.
// The private publisher calls this before declaring success and rolls back on any nonzero exit.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { validCatalogue, usablePrograms, validStatus, deriveState } from '../site/teamwork.js';
export async function publicAcceptance(origin) {
  const base = new URL(origin); assert(['https:', 'http:'].includes(base.protocol));
  const root = base.origin; let count = 0;
  const require = (condition, rule) => { assert(condition, rule); count++; };
  const request = (path, options = {}) => fetch(root + path, { ...options, signal: AbortSignal.timeout(10000), cache: 'no-store' });
  const redirect = await request('/teamwork', { redirect: 'manual' });
  require(redirect.status === 308 && new URL(redirect.headers.get('location'), root).pathname === '/teamwork/', 'C52 canonical redirect');
  const files = ['/teamwork/', '/teamwork/teamwork.js', '/teamwork/teamwork.css', '/teamwork/datenschutz.html', '/teamwork/data/programs.json', '/teamwork/data/status.json'];
  const responses = await Promise.all(files.map((path) => request(path)));
  for (const response of responses) {
    require(response.status === 200, 'C52 published file response');
    require(/no-store/.test(response.headers.get('cache-control') || ''), 'C52 uncached files');
    require(/noindex/.test(response.headers.get('x-robots-tag') || ''), 'C52 robot exclusion');
    require(response.headers.get('x-content-type-options') === 'nosniff', 'C52 MIME protection');
    const policy = response.headers.get('content-security-policy') || '';
    const directives = new Map();
    for (const entry of policy.split(';').map((value) => value.trim()).filter(Boolean)) {
      const [name, ...values] = entry.split(/\s+/); const key = name.toLowerCase();
      require(!directives.has(key), 'C52 duplicate policy directive'); directives.set(key, values.sort().join(' '));
    }
    const expected = { 'default-src': "'none'", 'script-src': "'self'", 'style-src': "'self'", 'img-src': "'self' data:", 'connect-src': "'self'", 'base-uri': "'none'", 'form-action': "'none'", 'frame-ancestors': "'none'" };
    require(directives.size === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => directives.get(key) === value), 'C52 exact own-origin policy');
    require(response.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'C52 referrer privacy');
    require(!response.headers.has('set-cookie') && !response.headers.has('access-control-allow-origin'), 'C52 no cookies or cross-origin access');
  }
  const catalogueText = await responses[4].text(), statusText = await responses[5].text();
  require(Buffer.byteLength(catalogueText) <= 32768 && Buffer.byteLength(statusText) <= 8192, 'C53 public data bounds');
  const catalogue = JSON.parse(catalogueText), status = JSON.parse(statusText);
  require(validCatalogue(catalogue), 'C53 catalogue contract');
  require(usablePrograms(catalogue).length === catalogue.programs.length, 'C53 valid program entries');
  require(catalogue.zones.every((zone) => Object.keys(zone).every((key) => ['id','name','color','ring'].includes(key))) && catalogue.programs.every((program) => Object.keys(program).every((key) => ['id','name','purpose','url','zone','color','newTab'].includes(key))), 'C53 public field whitelist');
  require(Object.keys(status).sort().join(',') === 'checkedAt,format,reachable' && status.reachable.every((id) => typeof id === 'string'), 'C53 exact status shape');
  const serverTimeMs = Date.parse(responses[5].headers.get('Date'));
  require(Number.isFinite(serverTimeMs), 'C53 server clock');
  const state = deriveState({ catalogue, status, serverTimeMs, receivedAt: 0 }, 0);
  require(validStatus(status) && serverTimeMs - Date.parse(status.checkedAt) < 7200000 && serverTimeMs - Date.parse(status.checkedAt) >= -300000, 'C53 fresh status contract');
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage(), errors = [], requests = [];
        page.on('pageerror', () => errors.push('page'));
        page.on('console', (message) => { if (message.type() === 'error') errors.push('console'); });
        page.on('request', (request) => requests.push(request.url()));
        await page.goto(root + '/teamwork/', { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.getElementById('loading').hidden);
        require(await page.locator('.tile').count() === state.programs.length, 'C54 visible catalogue projection');
        require(await page.locator('h1').textContent() === 'Teamwork', 'C54 page title');
        require(await page.locator('#banner').isVisible() === state.unknown, 'C54 truthful status banner');
        if (state.kind === 'empty') require(await page.locator('#message-text').textContent() === 'Noch keine Programme eingetragen.', 'C54 genuine empty state');
        require(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'C54 no horizontal overflow');
        require(await page.evaluate(() => [...document.querySelectorAll('a,button')].filter((node) => node.getClientRects().length).every((node) => { const r = node.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })), 'C54 touch target sizes');
        await page.keyboard.press('Tab'); require(await page.locator('#back').evaluate((node) => node === document.activeElement), 'C54 first keyboard target');
        require(errors.length === 0, 'C54 browser errors');
        require(requests.length <= 6 && requests.every((url) => new URL(url).origin === root), 'C54 bounded own-origin requests');
        require(await page.evaluate(async () => !document.cookie && !localStorage.length && !sessionStorage.length && !(await caches.keys()).length && !(await indexedDB.databases()).length), 'C54 no browser storage');
        await page.locator('#privacy').click(); await page.waitForURL('**/teamwork/datenschutz.html');
        require(await page.locator('html').getAttribute('lang') === 'de' && await page.locator('h2').count() === 5, 'C55 static privacy notice');
        await page.getByRole('link', { name: 'Teamwork', exact: true }).click(); await page.waitForURL('**/teamwork/');
        await page.locator('#back').click(); await page.waitForURL(root + '/');
        require(errors.length === 0, 'C55 browser navigation');
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return { ok: true, assertions: count, catalogue: state.kind, visiblePrograms: state.programs.length, viewports: 2 };
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  publicAcceptance(process.argv[2]).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(JSON.stringify({ ok: false, error: /^C\d+ /.test(error.message) ? error.message : 'Public acceptance failed; no catalogue values logged.' })); process.exitCode = 1; });
}
