// C36, C37, M1 to M9 for the real shape of the list (ticket "Show the Konstellation on desktop for the real list", Teamwork 20):
// an invented list of 3 / 5 / 2 / 2 programs in four outer zones plus 5 in the inner zone (the shape of the live list, none of its names)
// must show the constellation at 1920x1080, 1440x900 and 1280x720, with every invariant of M5 measured on the real page, and the hub
// must say `5 Zonen` and nothing else. Phones and lists that cannot fit keep the cluster layout (M8, Z5).
//  1. placePrograms in Node: the shape and the neighbouring shapes, the invariants, the same answer twice (M6), no error for any count (M7).
//  2. The page in real Chromium behind the real nginx: layout, boxes, labels, hub text, no horizontal scroll bar, no errors.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, same, run } from '../lib/check.mjs';
import { SITE } from '../lib/paths.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';
import { DESKTOP_SIZES, brokenInvariants, mapSize, syntheticList, tilesOf, boxGap } from '../lib/constellation.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sizeName = ([width, height]) => `${width}x${height}`;

// The same shape the live list has (nord 3, ost 5, sued 2, west 2, inner 5), and its neighbours.
const REAL_SHAPE = { outer: [3, 5, 2, 2], inner: 5 };
const MUST_PLACE = [
  ['real shape', REAL_SHAPE],
  ['example list shape 5 / 5 / 4 / 4 + 3', { outer: [5, 5, 4, 4], inner: 3 }],
  ['real shape without an inner zone', { outer: [3, 5, 2, 2], inner: -1 }],
  ['the zones of the real shape, one program each', { outer: [1, 1, 1, 1], inner: 1 }],
  ['one zone with no program', { outer: [3, 0, 2, 2], inner: 5 }],
  ['inner zone with no program shown', { outer: [3, 5, 2, 2], inner: 0 }],
  ['five outer zones', { outer: [2, 3, 2, 3, 2], inner: 3 }],
];

function inNode(placePrograms) {
  for (const [label, shape] of MUST_PLACE) {
    const list = syntheticList(shape);
    for (const size of DESKTOP_SIZES) {
      const map = mapSize(...size);
      const layout = placePrograms(list.zones, list.programs, map.width, map.height);
      check(`C36 M9 placePrograms gives a placement for ${label} at ${sizeName(size)}`, layout !== null && typeof layout === 'object');
      if (!layout) continue;
      same(`C36 M5 ${label} at ${sizeName(size)} holds every invariant`, brokenInvariants({ tiles: tilesOf(layout), zones: list.zones, width: map.width, height: map.height, hub: { cx: map.width / 2, cy: map.height / 2, radius: 56 }, labels: layout.reserved || [] }), []);
      same(`C36 M6 ${label} at ${sizeName(size)} gives the same positions twice`, placePrograms(list.zones, list.programs, map.width, map.height), layout);
    }
  }

  // M7: no count of programs raises an error, and whatever is returned holds the invariants; null is the fallback of M8.
  let placed = 0, fallback = 0, errors = [], broken = [];
  for (const [width, height] of [[918, 540], [1078, 720], [1558, 900], [818, 540], [852, 540]]) {
    for (let zones = 1; zones <= 6; zones += 1) for (const perZone of [0, 1, 2, 3, 4, 5, 6, 8, 12]) for (const inner of [-1, 0, 1, 3, 5, 6, 7]) {
      const list = syntheticList({ outer: Array.from({ length: zones }, (_, index) => (perZone === 5 ? [3, 5, 2, 2, 4, 1][index] : perZone)), inner });
      let layout;
      try { layout = placePrograms(list.zones, list.programs, width, height); } catch (error) { errors.push(`${zones}x${perZone}+${inner}@${width}: ${error.message}`); continue; }
      if (layout === null) { fallback += 1; continue; }
      placed += 1;
      const result = brokenInvariants({ tiles: tilesOf(layout), zones: list.zones, width, height, hub: { cx: width / 2, cy: height / 2, radius: 56 }, labels: layout.reserved || [] });
      if (layout.items.length !== list.programs.length) result.push('a program is missing');
      if (result.length) broken.push(`${zones}x${perZone}+${inner}@${width}: ${result.join(', ')}`);
    }
  }
  same('C36 M7 no shape raises an error', errors, []);
  same('C36 M5 M8 no shape that is placed breaks an invariant', broken.slice(0, 5), []);
  check('C36 M7 the rule places most shapes and falls back for the rest', placed > fallback, `${placed} placed, ${fallback} fallback`);
}

// Boxes in the map's own coordinates, measured on the page.
const measure = (page) => page.evaluate(() => {
  const map = document.getElementById('map').getBoundingClientRect();
  const local = (node) => { const r = node.getBoundingClientRect(); return { left: r.left - map.left, top: r.top - map.top, right: r.right - map.left, bottom: r.bottom - map.top, width: r.width, height: r.height }; };
  const hub = document.querySelector('.hub').getBoundingClientRect();
  const visible = (node) => node.getClientRects().length > 0;
  return {
    layout: document.getElementById('page').dataset.layout,
    width: map.width, height: map.height,
    overflow: document.documentElement.scrollWidth > innerWidth,
    hub: { cx: hub.left + hub.width / 2 - map.left, cy: hub.top + hub.height / 2 - map.top, radius: hub.width / 2 },
    hubText: document.querySelector('.hub').innerText.trim(),
    hubSpans: [...document.querySelectorAll('#hubn span')].map((span) => span.textContent),
    tiles: [...document.querySelectorAll('.tile')].map((tile) => { const orb = local(tile.querySelector('.orb')); return { id: tile.dataset.id, zone: tile.closest('[data-zone]').dataset.zone, ...local(tile), orb: { cx: (orb.left + orb.right) / 2, cy: (orb.top + orb.bottom) / 2 } }; }),
    labels: [...document.querySelectorAll('.zl, .resting')].filter(visible).map(local),
  };
});

async function inBrowser() {
  let browser, server;
  try {
    browser = await launchBrowser();
    server = await startPageServer({ list: syntheticList(REAL_SHAPE) });
    const { context, page, seen } = await openObserved(browser);
    for (const size of [...DESKTOP_SIZES, [1180, 720], [1024, 768], [900, 700]]) {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.goto(server.url); await page.locator('.tile').first().waitFor(); await pause(250);
      const geometry = await measure(page);
      const required = DESKTOP_SIZES.some(([width]) => width === size[0]);
      check(`C36 M9 ${sizeName(size)} shows 17 tiles and no horizontal scroll bar`, geometry.tiles.length === 17 && !geometry.overflow);
      if (required) same(`C36 M9 ${sizeName(size)} shows the constellation for the real shape`, geometry.layout, 'constellation');
      if (geometry.layout === 'constellation') {
        same(`C36 M5 ${sizeName(size)} holds every invariant measured on the page`, brokenInvariants({ tiles: geometry.tiles, zones: syntheticList(REAL_SHAPE).zones, width: geometry.width, height: geometry.height, hub: geometry.hub, labels: geometry.labels }), []);
        const inner = geometry.tiles.filter((tile) => tile.zone === 'verwaltung'), outer = geometry.tiles.filter((tile) => tile.zone !== 'verwaltung');
        const distance = (tile) => Math.hypot(tile.orb.cx - geometry.hub.cx, tile.orb.cy - geometry.hub.cy);
        check(`C36 M2 ${sizeName(size)} keeps the 5 inner programs on a ring around the hub, nearer to it than every outer program`, inner.length === 5 && Math.max(...inner.map(distance)) < Math.min(...outer.map(distance)), `inner up to ${Math.max(...inner.map(distance)).toFixed(0)} px, outer from ${Math.min(...outer.map(distance)).toFixed(0)} px`);
        check(`C36 M5 ${sizeName(size)} no tile box touches the hub circle's box`, geometry.tiles.every((tile) => Math.hypot(Math.max(tile.left - (geometry.hub.cx + 56), geometry.hub.cx - 56 - tile.right, 0), Math.max(tile.top - (geometry.hub.cy + 56), geometry.hub.cy - 56 - tile.bottom, 0)) > 0));
      }
      same(`C37 ${sizeName(size)} hub counts every zone: one line, 5 Zonen`, geometry.hubSpans, ['5 Zonen']);
      check(`C37 ${sizeName(size)} hub has no "+ Verwaltung" line`, !geometry.hubText.includes('Verwaltung') && !geometry.hubText.includes('+'), geometry.hubText);
    }

    // Phones and widths under 900 px keep the cluster layout.
    for (const size of [[899, 700], [768, 1024], [390, 844], [360, 740]]) {
      await page.setViewportSize({ width: size[0], height: size[1] }); await pause(250);
      const geometry = await measure(page);
      same(`C36 M1 ${sizeName(size)} keeps the cluster layout`, geometry.layout, 'cluster');
      check(`C36 ${sizeName(size)} has no horizontal scroll bar and no intersecting tile boxes`, !geometry.overflow && geometry.tiles.every((tile, index) => geometry.tiles.slice(index + 1).every((other) => boxGap(tile, other) > 0)));
      same(`C37 ${sizeName(size)} hub counts every zone: 5 Zonen`, geometry.hubSpans, ['5 Zonen']);
    }

    // A resize across 900 px changes the layout without a reload.
    await page.setViewportSize({ width: 1440, height: 900 }); await pause(300);
    same('C36 M8 a resize to 1440x900 switches to the constellation', (await measure(page)).layout, 'constellation');
    await page.setViewportSize({ width: 390, height: 844 }); await pause(300);
    same('C36 M8 a resize to 390x844 switches back to the cluster layout', (await measure(page)).layout, 'cluster');
    same('C44 no console error', seen.console.filter((message) => message.type === 'error'), []);
    same('C44 no uncaught error', seen.pageErrors, []);
    await context.close();
  } finally {
    if (server) await server.stop();
    if (browser) await browser.close();
  }
}

// Z5, C34: 60 programs. The constellation may be used only where every invariant holds, the cluster layout is always allowed.
async function sixtyPrograms() {
  let browser, server;
  try {
    browser = await launchBrowser();
    const list = syntheticList({ outer: [12, 12, 12, 12], inner: 12 });
    server = await startPageServer({ list });
    const { context, page, seen } = await openObserved(browser);
    for (const size of [...DESKTOP_SIZES, [390, 844]]) {
      await page.setViewportSize({ width: size[0], height: size[1] });
      await page.goto(server.url); await page.locator('.tile').first().waitFor(); await pause(250);
      const geometry = await measure(page);
      check(`Z5 C34 ${sizeName(size)} shows 60 tiles without a horizontal scroll bar`, geometry.tiles.length === 60 && !geometry.overflow);
      check(`Z5 ${sizeName(size)} has no tile boxes that intersect`, geometry.tiles.every((tile, index) => geometry.tiles.slice(index + 1).every((other) => boxGap(tile, other) > 0)));
      if (geometry.layout === 'constellation') same(`Z5 ${sizeName(size)} uses the constellation only with every invariant`, brokenInvariants({ tiles: geometry.tiles, zones: list.zones, width: geometry.width, height: geometry.height, hub: geometry.hub, labels: geometry.labels }), []);
      else same(`Z5 ${sizeName(size)} falls back to the cluster layout`, geometry.layout, 'cluster');
    }
    same('Z5 no uncaught error with 60 programs', seen.pageErrors, []);
    await context.close();
  } finally {
    if (server) await server.stop();
    if (browser) await browser.close();
  }
}

await run(async () => {
  const { placePrograms } = await import(pathToFileURL(path.join(SITE, 'teamwork.js')).href);
  inNode(placePrograms);
  await inBrowser();
  await sixtyPrograms();
});
