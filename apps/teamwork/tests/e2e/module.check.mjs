// module: site/teamwork.js is one ES module whose logic is exported as plain functions, and its boot code runs only
// when a document exists, so that a test can import it in Node, or in the page, without any test hook (ticket 1, point 3).
//  1. Imported in Node (no document, no window): it loads, starts nothing, and exports the functions that later slices use.
//  2. Two of those functions are pure and are tried on small inputs whose answers come from the spec: only https:
//     addresses become Kacheln (K1); the outer zones come first and the inner zone last (P1, I4).
//  3. Imported again inside the loaded page: the same module answers, and the page is not drawn a second time.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, same, run } from '../lib/check.mjs';
import { SITE } from '../lib/paths.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

const EXPORTS = ['TEXTS', 'loadData', 'usablePrograms', 'zonesInOrder', 'renderCatalogue', 'findPage', 'boot'];

const program = (id, url, zone = 'a') => ({ id, name: `Name ${id}`, purpose: `Zweck ${id}`, url, zone });

let browser;
let server;
try {
  await run(async () => {
    // ---- 1. in Node ----
    check('module there is no document and no window in this process (the import below is the test)', typeof document === 'undefined' && typeof window === 'undefined');
    const mod = await import(pathToFileURL(path.join(SITE, 'teamwork.js')).href);
    check('module site/teamwork.js imports in Node without a document and starts nothing', typeof mod === 'object');
    for (const name of EXPORTS) check(`module it exports ${name}`, name in mod, `exports: ${Object.keys(mod).join(', ')}`);

    // ---- 2. the pure functions ----
    const catalogue = {
      zones: [{ id: 'a', name: 'A', color: 'cyan' }],
      programs: [
        program('ok', 'https://ok.example.test/'),
        program('plain', 'http://plain.example.test/'),
        program('script', 'javascript:void(0)'),
        program('data', 'data:text/html,x'),
        program('relative', '/teamwork/'),
        program('elsewhere', 'https://elsewhere.example.test/', 'no-such-zone'),
      ],
    };
    same('module K1 only a program with an https: address in a known zone becomes a Kachel', mod.usablePrograms(catalogue).map((item) => item.id), ['ok']);
    const outer1 = { id: 'n', name: 'N', color: 'cyan' };
    const inner = { id: 'v', name: 'V', color: 'lime', ring: 'inner' };
    const outer2 = { id: 'o', name: 'O', color: 'pink' };
    same('module P1 the outer zones keep the order of the file and the inner zone comes last', mod.zonesInOrder([outer1, inner, outer2]).map((zone) => zone.id), ['n', 'o', 'v']);

    // ---- 3. in the page ----
    browser = await launchBrowser();
    server = await startPageServer();
    const { context, page, seen } = await openObserved(browser);
    await page.goto(server.url);
    await page.waitForFunction(() => document.querySelectorAll('ul > li > a').length >= 21, null, { timeout: 15000 }).catch(() => {});
    const inPage = await page.evaluate(async () => {
      const again = await import('/teamwork/teamwork.js');
      return { kicker: again.TEXTS.kicker, names: Object.keys(again), tiles: document.querySelectorAll('ul > li > a').length, zones: document.querySelectorAll('h2').length };
    });
    same('module imported again in the page it answers with the same exports', inPage.names.sort(), Object.keys(mod).sort());
    same('module imported again in the page it draws nothing a second time (21 Kacheln, 5 zones)', [inPage.tiles, inPage.zones], [21, 5]);
    same('module the import in the page raised no console error', seen.console.filter((message) => message.type === 'error'), []);
    await context.close();
  });
} finally {
  if (browser) await browser.close();
  if (server) await server.stop();
}
