// C28 (K1 to K4, A1, A5, A8, I3): the page with every Programm shown. Against the page server with the example list
// and a status file that names all 21 ids:
//   21 tiles in 5 zones; <html lang="de">, one <h1>, five <h2>, each zone's tiles in ul > li > a; each tile's accessible
//   name is "<Name>, <purpose>"; the detail card has aria-live="polite"; `internal` has target="_blank", a rel with
//   noopener noreferrer and a name ending ", öffnet in neuem Tab"; every other tile has no target; no tile has a
//   non-https: address; Enter on a focused tile and a click on it request its address; `Startseite` leads to `/`.
// Expected values come from the ticket's test text (zone names and counts), the spec's naming rules (5.1, 5.8) and the
// example list file itself, never from the page's own code.
import fs from 'node:fs';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
const NEW_TAB_SUFFIX = ', öffnet in neuem Tab'; // spec K2
// The ticket's manual test: five Zone panels in the order of the file, with 5, 5, 4, 4 and 3 Kacheln.
const TICKET_ZONES = [['Zone Nord', 5], ['Zone Ost', 5], ['Zone Süd', 4], ['Zone West', 4], ['Verwaltung', 3]];
const nameOf = (program) => `${program.name}, ${program.purpose}${program.newTab === true ? NEW_TAB_SUFFIX : ''}`;
const byZone = (zone) => list.programs.filter((program) => program.zone === zone.id);

const STUB_PAGE = '<!doctype html><title>Stand-in</title><p>Stand-in</p>';

// Opens the page and waits until all tiles are drawn: 21 links in lists. The wait does not look at how a tile is nested or
// what its address is, so that a page that gets those wrong fails the assertions below at once and not after a time-out per tile.
async function openPage(browser, server, count = 21) {
  const observed = await openObserved(browser);
  // The programs are on invented hosts: every request to one is answered here and never leaves the machine.
  await observed.context.route('https://*.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: STUB_PAGE }));
  await observed.page.goto(server.url);
  await observed.page.waitForFunction((n) => document.querySelectorAll('ul a').length >= n, count, { timeout: 15000 }).catch(() => {});
  return observed;
}

// One assertion that cannot end the whole check: an error while trying (a Kachel that is not there) is a FAIL line.
async function attempt(name, body) {
  try {
    return check(name, await body());
  } catch (error) {
    return check(name, false, String(error.message).split('\n')[0]);
  }
}

let browser;
let server;
try {
  await run(async () => {
    // The ticket's numbers and the example file agree (the file is pinned by its checksum, the ticket text is the second source).
    same('C28 the example list has the zones and Kachel counts of the ticket (Zone Nord 5, Zone Ost 5, Zone Süd 4, Zone West 4, Verwaltung 3)',
      list.zones.map((zone) => [zone.name, byZone(zone).length]), TICKET_ZONES);

    browser = await launchBrowser();
    server = await startPageServer();
    const { context, page } = await openPage(browser, server);

    // ---- structure: A1 ----
    const dom = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h2')];
      const zoneOf = (element) => {
        let found = null;
        for (const heading of headings) if (heading.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) found = heading;
        return found ? found.textContent.trim() : null;
      };
      return {
        lang: document.documentElement.getAttribute('lang'),
        title: document.title,
        h1: [...document.querySelectorAll('h1')].map((heading) => heading.textContent.trim()),
        h2: headings.map((heading) => heading.textContent.trim()),
        tiles: [...document.querySelectorAll('ul > li > a')].map((a) => ({
          href: a.getAttribute('href'),
          target: a.getAttribute('target'),
          rel: a.getAttribute('rel'),
          zone: zoneOf(a),
          directlyInItem: a.parentElement.tagName === 'LI' && a.parentElement.parentElement.tagName === 'UL',
        })),
        links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        liveRegions: [...document.querySelectorAll('[aria-live]')].map((element) => ({ live: element.getAttribute('aria-live'), id: element.id })),
        banner: (() => { const element = document.getElementById('banner'); return element ? element.getAttribute('role') : null; })(),
      };
    });
    same('C28 A1 the document language is German', dom.lang, 'de');
    same('C28 A1 F1 the title and the only <h1> read Teamwork', [dom.title, dom.h1], ['Teamwork', ['Teamwork']]);
    same('C28 A1 each zone name is an <h2>, five of them, in the order of the file', dom.h2, TICKET_ZONES.map(([name]) => name));
    check('C28 A1 every Kachel is an <a> directly in an <li> of a <ul>', dom.tiles.length > 0 && dom.tiles.every((tile) => tile.directlyInItem), `${dom.tiles.filter((tile) => !tile.directlyInItem).length} are not`);
    same('C28 21 tiles in 5 zones: each <h2> is followed by its own Kacheln (5, 5, 4, 4, 3)',
      TICKET_ZONES.map(([name]) => [name, dom.tiles.filter((tile) => tile.zone === name).length]), TICKET_ZONES);
    same('C28 the Kacheln are the Programs of the file, in file order, zone by zone',
      dom.tiles.map((tile) => tile.href), list.zones.flatMap((zone) => byZone(zone).map((program) => program.url)));

    // ---- accessible names: A8 ----
    for (const program of list.programs) {
      const expected = nameOf(program);
      const count = await page.getByRole('link', { name: expected, exact: true }).count();
      check(`C28 A8 the Kachel ${program.id} has the accessible name "${expected}"`, count === 1, `${count} links with that name`);
    }

    // ---- links: K1, K2, K3, K4 ----
    const byHref = new Map(dom.tiles.map((tile) => [tile.href, tile]));
    check('C28 K1 every Kachel has an https: address and rel with noopener and noreferrer',
      dom.tiles.length === 21 && dom.tiles.every((tile) => /^https:\/\//.test(tile.href) && (tile.rel || '').split(/\s+/).includes('noopener') && (tile.rel || '').split(/\s+/).includes('noreferrer')),
      dom.tiles.filter((tile) => !/^https:\/\//.test(tile.href) || !/noopener/.test(tile.rel || '') || !/noreferrer/.test(tile.rel || '')).map((tile) => `${tile.href} rel=${tile.rel}`).join('; '));
    for (const program of list.programs) {
      const tile = byHref.get(program.url);
      const expectedTarget = program.newTab === true ? '_blank' : null;
      check(`C28 K2 K3 ${program.id}: target is ${expectedTarget === null ? 'absent' : '_blank'}`, Boolean(tile) && tile.target === expectedTarget, `target=${tile && tile.target}`);
    }
    const internal = list.programs.find((program) => program.id === 'internal');
    same('C28 K3 `internal` is a Kachel in the zone Verwaltung (an ordinary link, not a button)', byHref.get(internal.url) && byHref.get(internal.url).zone, 'Verwaltung');
    same('C28 K4 the page has no links but Startseite, the 21 Kacheln and Datenschutz',
      [...dom.links].sort(), ['/', ...list.programs.map((program) => program.url), '/teamwork/datenschutz.html'].sort());

    // ---- live regions: A5 ----
    same('C28 A5 the detail card is the one aria-live="polite" element', dom.liveRegions.filter((region) => region.live === 'polite').map((region) => region.id), ['detail']);
    same('C28 A5 the banner place has role="status"', dom.banner, 'status');

    // ---- following a Kachel: I3 ----
    // Without the Kacheln there is nothing to follow: one FAIL line instead of 40 waits for a page that shows nothing.
    const drawn = await page.locator('ul a').count();
    check('C28 I3 the Kacheln are drawn, so that they can be followed', drawn >= 21, `${drawn} links in lists, 21 needed`);
    for (const program of drawn >= 21 ? list.programs : []) {
      if (program.newTab === true) continue;
      for (const way of ['Enter', 'click']) {
        await attempt(`C28 I3 ${way === 'Enter' ? 'Enter on' : 'a click on'} the Kachel ${program.id} requests ${new URL(program.url).host}`, async () => {
          const { page: fresh, context: freshContext } = await openPage(browser, server);
          try {
            const tile = fresh.getByRole('link', { name: nameOf(program), exact: true });
            const requested = fresh.waitForRequest((request) => request.isNavigationRequest() && request.url() === program.url, { timeout: 5000 }).then(() => true, () => false);
            if (way === 'Enter') {
              await tile.focus();
              await fresh.keyboard.press('Enter');
            } else {
              await tile.click();
            }
            return await requested;
          } finally {
            await freshContext.close();
          }
        });
      }
    }
    for (const way of drawn >= 21 ? ['Enter', 'click'] : []) {
      await attempt(`C28 I3 K2 ${way === 'Enter' ? 'Enter on' : 'a click on'} the Kachel internal opens a new tab that requests its address`, async () => {
        const { page: fresh, context: freshContext } = await openPage(browser, server);
        try {
          const tile = fresh.getByRole('link', { name: nameOf(internal), exact: true });
          const asked = freshContext.waitForEvent('request', { predicate: (request) => request.url() === internal.url, timeout: 5000 }).then(() => true, () => false);
          const opened = freshContext.waitForEvent('page', { timeout: 5000 }).then(() => true, () => false);
          if (way === 'Enter') {
            await tile.focus();
            await fresh.keyboard.press('Enter');
          } else {
            await tile.click();
          }
          return (await opened) && (await asked);
        } finally {
          await freshContext.close();
        }
      });
    }

    // ---- Startseite: K4 ----
    const home = page.getByRole('link', { name: 'Startseite', exact: true }).first();
    await attempt('C28 K4 Startseite is a link with the address /', async () => (await home.getAttribute('href')) === '/');
    await attempt('C28 K4 a click on Startseite leads to / of the own origin', async () => {
      await Promise.all([page.waitForURL(`${server.origin}/`, { timeout: 5000 }).catch(() => {}), home.click()]);
      return page.url() === `${server.origin}/`;
    });
    await context.close();
  });
} finally {
  if (browser) await browser.close();
  if (server) await server.stop();
}
