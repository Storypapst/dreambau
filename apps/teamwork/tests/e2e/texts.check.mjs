// texts (F14, spec 5.1): the page's words are the German texts of spec 5.1 and nothing else.
//  1. Region `texts` of site/teamwork.js holds every string of the table of spec 5.1 verbatim (the plain ones as
//     literals, the ones with a number or a name as small functions that give the spec's own examples).
//  2. index.html holds no text and no aria-label that is not one of those strings, and it holds the static ones.
//  3. On the rendered page every visible string is one of them or comes from the data files (zone names, program
//     names and purposes of the example list).
// The expected strings below are transcribed from the table of spec 5.1 and are the only source of truth here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST, SITE } from '../lib/paths.mjs';
import { regionBody } from '../lib/regions.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

// ---- the table of spec 5.1 ----
const PLAIN = {
  title: 'Teamwork',
  kicker: 'Einstieg zu den internen Programmen',
  back: 'Startseite',
  privacy: 'Datenschutz',
  footNote: 'Zeigt nur Programme, die bei der letzten Prüfung geantwortet haben. Fehlt eines, kommt es von selbst wieder.',
  statusUnknown: 'Status unbekannt',
  bannerText: 'Statusdatei fehlt oder ist alt. Es werden alle Programme gezeigt, auch solche, die gerade nicht antworten.',
  unknownMarker: '?',
  resting: 'ruht',
  restingNow: 'Gerade nichts erreichbar.',
  restingBack: 'Kommt von selbst wieder.',
  detailHint: 'Ein Programm anfahren oder mit Tab anspringen: hier erscheinen Beschreibung und Adresse.',
  loading: 'Lade Programme ...',
  unavailable: 'Die Programmliste ist gerade nicht erreichbar.',
  unavailableHint: 'Bitte in einigen Minuten noch einmal versuchen.',
  reload: 'Neu laden',
  empty: 'Noch keine Programme eingetragen.',
  noScript: 'Diese Seite braucht JavaScript.',
  reducedMotion: 'Bewegung reduziert: ruhiges Standbild.',
  ageUnknown: 'Stand: unbekannt',
  mapLabel: 'Programme, nach Zonen gruppiert',
  sideLabel: 'Übersicht',
  legendLabel: 'Zonen',
  newTabSuffix: ', öffnet in neuem Tab',
};
// The strings of the table that carry a number or a name: [what, function of the registry, arguments, the spec's example].
const AURORA = { name: 'Aurora', purpose: 'Zeigt Beispielzahlen' };
const INTERNAL = { name: 'internal', purpose: 'Beispiel für einen Link in die Verwaltung' };
const WITH_VALUES = [
  ['hub meta, four zones', 'zoneCount', [4], '4 Zonen'],
  ['hub meta, one zone', 'zoneCount', [1], '1 Zone'],
  ['hub meta, second line', 'innerZone', ['Verwaltung'], '+ Verwaltung'],
  ['age line below a minute', 'ageSeconds', [38], 'Stand: vor 38 s'],
  ['age line in minutes', 'ageMinutes', [12], 'Stand: vor 12 min'],
  ['age line in hours', 'ageHours', [2], 'Stand: vor 2 h'],
  ['count of several programs', 'programCount', [15], '15 Programme'],
  ['count of one program', 'programCount', [1], '1 Programm'],
  ['count of no program', 'programCount', [0], '0 Programme'],
  ['address in the detail card', 'detailAddress', ['https://aurora.example.test/'], '↳ aurora.example.test/'],
  ['accessible name of a tile', 'tileLabel', [AURORA], 'Aurora, Zeigt Beispielzahlen'],
  ['accessible name of a tile with unknown status', 'tileLabel', [AURORA, { unknown: true }], 'Aurora, Zeigt Beispielzahlen, Status unbekannt'],
  ['accessible name of a new-tab tile', 'tileLabel', [INTERNAL, { newTab: true }], 'internal, Beispiel für einen Link in die Verwaltung, öffnet in neuem Tab'],
  ['accessible name of a new-tab tile with unknown status', 'tileLabel', [INTERNAL, { unknown: true, newTab: true }], 'internal, Beispiel für einen Link in die Verwaltung, Status unbekannt, öffnet in neuem Tab'],
  ['zone count, accessible name', 'zoneCountLabel', [5], '5 erreichbar'],
  ['zone count with unknown status, accessible name', 'zoneCountLabel', [5, true], '5 Programme, Status unbekannt'],
];
// What the hub shows for the example list (spec 9, row C37: `4 Zonen`, second line `+ Verwaltung`).
const HUB_LINES = ['4 Zonen', '+ Verwaltung'];
// The static strings that index.html itself carries (ticket 1, point 3).
const STATIC_KEYS = ['title', 'kicker', 'back', 'privacy', 'footNote', 'noScript', 'loading', 'detailHint', 'reducedMotion', 'mapLabel', 'sideLabel', 'legendLabel'];

// The strings of an HTML text: every text node and every aria-label.
function stringsOf(html) {
  const bare = html.replace(/<!--[\s\S]*?-->/g, '');
  return [...[...bare.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim()).filter(Boolean), ...[...bare.matchAll(/\baria-label="([^"]*)"/g)].map((match) => match[1])];
}

const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
const FROM_DATA = [...list.zones.map((zone) => zone.name), ...list.programs.flatMap((program) => [program.name, program.purpose])];

let browser;
let server;
try {
  await run(async () => {
    const script = fs.readFileSync(path.join(SITE, 'teamwork.js'), 'utf8');
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

    // ---- 1. the registry in region texts ----
    const { TEXTS } = await import(pathToFileURL(path.join(SITE, 'teamwork.js')).href);
    const body = regionBody(script, 'script', 'texts') || '';
    for (const [key, expected] of Object.entries(PLAIN)) {
      same(`texts the registry has ${key}: ${JSON.stringify(expected).slice(0, 56)}`, TEXTS[key], expected);
      check(`texts region texts holds the string of ${key} verbatim`, body.includes(expected));
    }
    for (const [what, fn, args, expected] of WITH_VALUES) {
      same(`texts ${what}: ${JSON.stringify(expected).slice(0, 56)}`, typeof TEXTS[fn] === 'function' ? TEXTS[fn](...args) : `no function ${fn}`, expected);
    }

    // ---- 2. index.html ----
    const spec = new Set(Object.values(PLAIN));
    const inHtml = stringsOf(html);
    same('texts index.html has no text and no aria-label that is not a string of spec 5.1', inHtml.filter((text) => !spec.has(text)), []);
    for (const key of STATIC_KEYS) check(`texts index.html carries the static string ${key}`, inHtml.includes(PLAIN[key]));

    // ---- 3. the rendered page ----
    browser = await launchBrowser();
    server = await startPageServer();
    const { context, page } = await openObserved(browser);
    await page.goto(server.url);
    await page.waitForFunction(() => document.querySelectorAll('ul > li > a').length >= 21, null, { timeout: 15000 }).catch(() => {});
    const visible = await page.evaluate(() => {
      const found = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim();
        const element = node.parentElement;
        if (text === '' || !element || element.closest('script, style, noscript')) continue;
        if (element.checkVisibility({ checkVisibilityCSS: true })) found.push(text);
      }
      return found;
    });
    const allowed = new Set([...spec, ...HUB_LINES, ...FROM_DATA]);
    same('texts F14 every visible string of the page is a string of spec 5.1 or comes from the data files', [...new Set(visible.filter((text) => !allowed.has(text)))], []);
    for (const text of new Set([PLAIN.title, PLAIN.kicker, PLAIN.back, PLAIN.privacy, PLAIN.footNote, ...HUB_LINES, ...FROM_DATA])) {
      check(`texts the page shows ${JSON.stringify(text).slice(0, 56)}`, visible.includes(text));
    }
    await context.close();
  });
} finally {
  if (browser) await browser.close();
  if (server) await server.stop();
}
