// The Teamwork page: one ES module in banner-delimited regions (one or more per slice). A slice edits its own regions
// only and never a banner line. The logic is exported as plain functions, and the boot code runs only when a document
// exists, so that a test can import this file in Node or in the page without any hook. No library, no dynamic code,
// no inline style: the policy of the page allows scripts and styles from its own origin only.

// ==== region: texts ====
// Slice 1 fills this region: every German string of spec 5.1, the one place for the page's words. The static ones also
// stand in index.html (the check `texts` keeps both in step). A string with a number or a name is a small function.
export const TEXTS = Object.freeze({
  title: 'Teamwork',
  kicker: 'Einstieg zu den internen Programmen',
  back: 'Startseite',
  privacy: 'Datenschutz',
  footNote: 'Zeigt nur Programme, die bei der letzten Prüfung geantwortet haben. Fehlt eines, kommt es von selbst wieder.',
  reducedMotion: 'Bewegung reduziert: ruhiges Standbild.',
  noScript: 'Diese Seite braucht JavaScript.',
  loading: 'Lade Programme ...',
  unavailable: 'Die Programmliste ist gerade nicht erreichbar.',
  unavailableHint: 'Bitte in einigen Minuten noch einmal versuchen.',
  reload: 'Neu laden',
  empty: 'Noch keine Programme eingetragen.',
  statusUnknown: 'Status unbekannt',
  bannerText: 'Statusdatei fehlt oder ist alt. Es werden alle Programme gezeigt, auch solche, die gerade nicht antworten.',
  unknownMarker: '?',
  resting: 'ruht',
  restingNow: 'Gerade nichts erreichbar.',
  restingBack: 'Kommt von selbst wieder.',
  detailHint: 'Ein Programm anfahren oder mit Tab anspringen: hier erscheinen Beschreibung und Adresse.',
  ageUnknown: 'Stand: unbekannt',
  mapLabel: 'Programme, nach Zonen gruppiert',
  sideLabel: 'Übersicht',
  legendLabel: 'Zonen',
  newTabSuffix: ', öffnet in neuem Tab',
  zoneCount: (count) => (count === 1 ? '1 Zone' : `${count} Zonen`),
  ageSeconds: (seconds) => `Stand: vor ${seconds} s`,
  ageMinutes: (minutes) => `Stand: vor ${minutes} min`,
  ageHours: (hours) => `Stand: vor ${hours} h`,
  programCount: (count) => (count === 1 ? '1 Programm' : `${count} Programme`),
  detailAddress: (url) => `↳ ${url.replace(/^https:\/\//, '')}`,
  // The accessible name of a Kachel: "<Name>, <purpose>", then ", Status unbekannt" when the status is unknown, then
  // ", öffnet in neuem Tab" for a program that opens in a new tab (spec 5.1 and K2).
  tileLabel: (program, { unknown = false, newTab = false } = {}) => `${program.name}, ${program.purpose}${unknown ? `, ${TEXTS.statusUnknown}` : ''}${newTab ? TEXTS.newTabSuffix : ''}`,
  // The accessible name of a zone's count: "<n> erreichbar", or "<n> Programme, Status unbekannt" when unknown.
  zoneCountLabel: (count, unknown = false) => (unknown ? `${TEXTS.programCount(count)}, ${TEXTS.statusUnknown}` : `${count} erreichbar`),
});

// ==== end region: texts ====

// ==== region: contract ====
// Slice 6 fills this region: the full check of both data files (L3, L4, Z4), the limits of L1 and the age (L5, L6).
export const DATA_FILES = Object.freeze({ catalogue: '/teamwork/data/programs.json', status: '/teamwork/data/status.json' });
export const PALETTE_KEYS = Object.freeze(['cyan', 'amber', 'pink', 'violet', 'lime', 'slate']);
export const isPaletteKey = (value) => PALETTE_KEYS.includes(value);
const validId = (value) => typeof value === 'string' && value === value.trim() && /^[a-z0-9][a-z0-9-]{0,31}$/.test(value);
export function isHttpsAddress(value) {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && url.href === url.origin + url.pathname + url.search + url.hash; } catch { return false; }
}
export function usablePrograms(catalogue) {
  const known = new Set(catalogue.zones.map((zone) => zone.id));
  const seen = new Set();
  return catalogue.programs.filter((program) => {
    if (!program || !validId(program.id) || seen.has(program.id) || !known.has(program.zone) || !isHttpsAddress(program.url) || typeof program.name !== 'string' || !program.name || typeof program.purpose !== 'string' || !program.purpose || (program.color !== undefined && !isPaletteKey(program.color)) || (program.newTab !== undefined && typeof program.newTab !== 'boolean')) return false;
    seen.add(program.id); return true;
  });
}
export function validCatalogue(value) {
  if (!value || value.format !== 1 || !Array.isArray(value.zones) || value.zones.length < 1 || value.zones.length > 7 || !Array.isArray(value.programs) || value.programs.length > 60) return false;
  const ids = new Set();
  return value.zones.every((zone) => {
    if (!zone || !validId(zone.id) || ids.has(zone.id) || typeof zone.name !== 'string' || !zone.name || !isPaletteKey(zone.color) || (zone.ring !== undefined && zone.ring !== 'inner')) return false;
    ids.add(zone.id); return true;
  }) && value.zones.filter((zone) => zone.ring === 'inner').length <= 1 && value.zones.filter((zone) => zone.ring !== 'inner').length <= 6;
}
async function getJson(path, limit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    if (response.status !== 200) throw new Error('data unavailable');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error('data too large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const serverDate = Date.parse(response.headers.get('Date'));
    return { value: JSON.parse(new TextDecoder().decode(bytes)), serverTimeMs: Number.isFinite(serverDate) ? serverDate : Date.now(), receivedAt: performance.now() };
  } finally { clearTimeout(timeout); }
}
export async function loadData() {
  const [catalogue, status] = await Promise.all([getJson(DATA_FILES.catalogue, 32768), getJson(DATA_FILES.status, 8192).catch(() => null)]);
  if (!validCatalogue(catalogue.value)) throw new Error('catalogue unavailable');
  return { catalogue: catalogue.value, statusFetchFailed: status === null, status: status?.value ?? null, serverTimeMs: status?.serverTimeMs ?? catalogue.serverTimeMs, receivedAt: status?.receivedAt ?? catalogue.receivedAt };
}
function initContract(page) { page.load = loadData; }

// ==== end region: contract ====

// ==== region: state ====
// Slice 6 fills this region: which programs are shown (L7), the age line (T1), the count (T2) and the unknown state.
export function validStatus(status) {
  if (!status || status.format !== 1 || !Array.isArray(status.reachable) || !status.reachable.every((id) => typeof id === 'string') || typeof status.checkedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(status.checkedAt)) return false;
  const checked = Date.parse(status.checkedAt);
  return Number.isFinite(checked) && new Date(checked).toISOString().replace('.000Z', 'Z') === status.checkedAt;
}
export function deriveState(data, now = performance.now()) {
  if (!validCatalogue(data?.catalogue)) return { kind: 'unavailable', programs: [], unknown: false };
  const all = usablePrograms(data.catalogue);
  if (!data.catalogue.programs.length) return { kind: 'empty', catalogue: data.catalogue, programs: [], unknown: false };
  const status = data.status;
  const checked = validStatus(status) ? Date.parse(status.checkedAt) : NaN;
  const age = (data.serverTimeMs + Math.max(0, now - data.receivedAt) - checked) / 1000;
  const unknown = !status || status.format !== 1 || !Array.isArray(status.reachable) || !status.reachable.every((id) => typeof id === 'string') || !Number.isFinite(age) || age > 10800 || age < -300;
  const reachable = new Set(unknown ? [] : status.reachable);
  return { kind: 'normal', catalogue: data.catalogue, programs: unknown ? all : all.filter((p) => reachable.has(p.id)), unknown, age: Math.max(0, age) };
}
export function ageText(state) {
  if (state.unknown || !Number.isFinite(state.age)) return TEXTS.ageUnknown;
  if (state.age < 60) return TEXTS.ageSeconds(Math.floor(state.age));
  if (state.age < 3600) return TEXTS.ageMinutes(Math.floor(state.age / 60));
  return TEXTS.ageHours(Math.floor(state.age / 3600));
}
function initState(page) { page.state = { kind: 'loading', programs: [], unknown: false }; }

// ==== end region: state ====

// ==== region: render ====
// Slice 1 draws the Zone panels with their Kacheln. Slice 6 adds the state parts (marker, banner, count, resting zone)
// and slice 9 the constellation parts. Text from the data is always inserted as text, never as markup (Z1).

// P1, I4: the outer zones in the order of the file, the inner zone last.
export function zonesInOrder(zones) {
  return [...zones.filter((zone) => zone.ring !== 'inner'), ...zones.filter((zone) => zone.ring === 'inner')];
}

// An element with attributes (an undefined value leaves the attribute out) and children (a string becomes a text node).
function make(doc, tag, attributes = {}, ...children) {
  const element = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) if (value !== undefined) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

const colorOf = (item) => (isPaletteKey(item.color) ? item.color : undefined);

// One Kachel: a real link (K1), in the same tab unless the program asks for a new one (K2).
export function buildTile(doc, program, unknown = false) {
  const newTab = program.newTab === true;
  const link = make(doc, 'a', {
    class: 'tile',
    href: program.url,
    rel: 'noopener noreferrer',
    target: newTab ? '_blank' : undefined,
    'data-id': program.id,
    'data-color': colorOf(program),
    'aria-label': TEXTS.tileLabel(program, { newTab, unknown }),
  }, make(doc, 'span', { class: 'orb', 'aria-hidden': 'true' }),
  make(doc, 'span', { class: 'lb' }, make(doc, 'span', { class: 'nm', 'aria-hidden': 'true' }, program.name.slice(0, 40)), make(doc, 'span', { class: 'ds' }, program.purpose.slice(0, 120))));
  if (unknown) { link.querySelector('.orb').append(make(doc, 'span', { class: 'unknown', 'aria-hidden': 'true' }, TEXTS.unknownMarker)); link.querySelector('.lb').append(make(doc, 'span', { class: 'unknown-text', 'aria-hidden': 'true' }, TEXTS.statusUnknown)); }
  return make(doc, 'li', {}, link);
}

// One Zone panel: its name as an <h2> and its Kacheln in a list (A1).
export function buildZone(doc, zone, programs, unknown = false) {
  const id = `h-${zone.id}`;
  return make(doc, 'section', { class: 'zone', 'data-zone': zone.id, 'data-color': colorOf(zone), 'data-ring': zone.ring === 'inner' ? 'inner' : undefined, 'aria-labelledby': id },
    make(doc, 'div', { class: 'zl' }, make(doc, 'h2', { id, tabindex: '-1' }, zone.name), make(doc, 'span', { class: 'zc', 'aria-label': TEXTS.zoneCountLabel(programs.length, unknown) }, String(programs.length))),
    make(doc, 'ul', {}, ...programs.map((program) => buildTile(doc, { ...program, color: program.color || zone.color }, unknown))),
    ...(!programs.length ? [make(doc, 'div', { class: 'resting' }, make(doc, 'b', {}, TEXTS.resting), make(doc, 'p', {}, TEXTS.restingNow), make(doc, 'p', {}, TEXTS.restingBack))] : []));
}

// The hub's second text: the number of zones in the catalogue, the inner zone counted like the others (spec M2, 5.1).
function hubLines(doc, zones) {
  return [make(doc, 'span', {}, TEXTS.zoneCount(zones.length))];
}

// Draws the whole catalogue again: the hub's lines and one panel per zone with the Kacheln of its programs, in file order.
export function renderCatalogue(page, catalogue) {
  const doc = page.doc;
  const zones = zonesInOrder(catalogue.zones);
  const programs = usablePrograms(catalogue);
  page.hubMeta.replaceChildren(...hubLines(doc, catalogue.zones));
  page.zones.replaceChildren(...zones.map((zone) => buildZone(doc, zone, programs.filter((program) => program.zone === zone.id))));
}

function initRender(page) {
  page.render = (data) => {
    const active = page.doc.activeElement?.closest?.('.tile');
    const activeId = active?.dataset.id; const activeZone = active?.closest('.zone')?.dataset.zone;
    const hadData = Boolean(page.data);
    const previous = new Set(page.state.programs.map((program) => program.id));
    page.state = deriveState(data); page.data = data;
    page.loading.hidden = true; page.message.hidden = true; page.messageHint.hidden = page.state.kind !== 'unavailable';
    page.banner.hidden = !page.state.unknown; page.banner.textContent = `${TEXTS.statusUnknown}. ${TEXTS.bannerText}`;
    page.stand.textContent = ageText(page.state); page.count.textContent = TEXTS.programCount(page.state.programs.length);
    page.zones.replaceChildren(); page.legend.replaceChildren();
    if (page.state.kind === 'unavailable') { page.message.hidden = false; page.messageText.textContent = TEXTS.unavailable; page.retry.hidden = false; return; }
    page.hubMeta.replaceChildren(...hubLines(page.doc, data.catalogue.zones));
    if (page.state.kind === 'empty') { page.message.hidden = false; page.messageText.textContent = TEXTS.empty; page.retry.hidden = true; page.arrange?.(); page.draw?.(page.reduced ? 4.6 : performance.now() / 1000); return; }
    for (const zone of zonesInOrder(data.catalogue.zones)) {
      const programs = page.state.programs.filter((program) => program.zone === zone.id);
      page.zones.append(buildZone(page.doc, zone, programs, page.state.unknown));
      page.legend.append(make(page.doc, 'li', { 'data-color': zone.color }, zone.name, make(page.doc, 'span', {}, programs.length ? String(programs.length) : TEXTS.resting)));
    }
    for (const tile of page.zones.querySelectorAll('.tile')) {
      if (hadData && !previous.has(tile.dataset.id)) tile.classList.add('returning');
    }
    page.arrange?.(); page.draw?.(page.reduced ? 4.6 : performance.now() / 1000);
    if (activeId) {
      const replacement = page.zones.querySelector(`[data-id="${activeId}"]`);
      const heading = page.zones.querySelector(`[data-zone="${activeZone}"] h2`);
      (replacement || heading || page.doc.querySelector('h1')).focus();
    }
  };
}

// ==== end region: render ====

// ==== region: layout ====
// Slice 7 fills this region: the cluster layout and which layout applies; slice 9 adds the constellation.
function initLayout(page) {
  page.arrange = () => {
    const width = page.root.clientWidth;
    page.root.dataset.layout = width >= 900 && page.state.kind === 'normal' ? 'constellation' : 'cluster';
    if (page.root.dataset.layout === 'constellation') {
      const layout = placePrograms(page.state.catalogue.zones, page.state.programs, page.map.clientWidth, page.map.clientHeight);
      if (!layout) page.root.dataset.layout = 'cluster';
      page.placement = layout;
      page.position?.(layout);
    } else page.placement = null;
    page.measure?.();
    page.draw?.(page.reduced ? 4.6 : performance.now() / 1000);
  };
  let timer;
  new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(page.arrange, 100); }).observe(page.root);
}

// ==== end region: layout ====

// ==== region: place ====
// Slice 8 fills this region: the placement function of the constellation (spec M2 to M9, Appendix D).
// The rule starts from the mockup's fan. Every outer zone owns a sector of equal size around its axis (the first at the top,
// then clockwise). Its programs sit in a fan around the axis, in turn on the outer ellipse B and on a middle ellipse A
// (a "zigzag", which lets neighbours overlap in height) or, when that does not fit, all on B. The inner zone sits on a small
// ring around the hub whose size grows with its count. The rule places the inner ring first, then the outer zones in file
// order, each with the widest fan that clears everything placed so far, and it proves M5a to M5f on every tile it places.
// When some setting of the whole ladder holds, that placement is the answer; when none does, the answer is null and the page
// uses the cluster layout (M8). A pure function of its four arguments (M6): no random number, no clock, no measurement.
const TILE_W = 120, TILE_H = 46, ORB_R = 22, HUB_R = 56;
const EDGE_X = 32, EDGE_Y = 30;   // a tile keeps this far from the map's edge, where the zone names stand
const TILE_GAP = 3;               // M5a asks for 2 px; one more pixel is the margin for rounding in the browser
const RING_A = [.76, .7, .82, .66, .88];   // the middle ring as a share of the outer ring (the mockup's is .76)
const RING_B = [1, .92, .84];              // the outer ring as a share of the widest one (zones on a diagonal need it smaller: their name stands on it)
const SECTOR_MARGIN = [6, 10, 14, 18];     // degrees kept free at both edges of a sector, so that neighbouring zones keep apart
const FAN_STEP = [30, 26, 22, 18, 14, 10]; // the widest angle between two neighbours of a fan, in degrees (the mockup's is about 27)
const INNER_START = [[116, 108], [96, 92]]; // the inner ring starts outside the turning glyph rings, or tighter when the map is full
const INNER_STEPS = 13;                    // and grows by 14 x 12 px per step
const rad = (degrees) => degrees * Math.PI / 180;
const wrap = (degrees) => ((degrees + 540) % 360) - 180;
const gapBetween = (a, b) => Math.hypot(Math.max(a.left - b.right, b.left - a.right, 0), Math.max(a.top - b.bottom, b.top - a.bottom, 0));
const boxAround = (x, y, width, height) => ({ left: x - width / 2, top: y - height / 2, right: x + width / 2, bottom: y + height / 2 });

// A tile at an orb centre; the name goes to the left of the orb on the left half of the map, else to the right.
function tileAt(x, y, degrees, id, zone) {
  const leftLabel = Math.cos(rad(degrees)) < -.001;
  const left = leftLabel ? x - (TILE_W - ORB_R) : x - ORB_R;
  return { id, zone, x, y, left, top: y - TILE_H / 2, leftLabel, right: left + TILE_W, bottom: y + TILE_H / 2 };
}

// The angles of the programs of the inner ring, clockwise from the top; the lower middle stays free for the zone's name.
function innerAngles(count) {
  if (count === 1) return [-90];
  if (count === 2) return [-135, -45];
  const start = count % 2 ? -90 : -90 + 180 / count;
  return Array.from({ length: count }, (_, index) => start + index * 360 / count);
}

// The zone name at the map's edge (an estimate of its size: 11.5 px monospace capitals with a letter space, then the count).
function zoneName(zone, count, axis, cx, cy) {
  const long = zone.name.length * 10 + 8 + String(count).length * 8 + 6;
  const vertical = Math.abs(Math.cos(rad(axis))) > .7;
  const x = cx + Math.cos(rad(axis)) * (cx - 18), y = cy + Math.sin(rad(axis)) * (cy - 14);
  return { zone: zone.id, x, y, vertical, flip: vertical && Math.cos(rad(axis)) < 0, ...boxAround(x, y, vertical ? 18 : long, vertical ? long : 18) };
}

// The fans to try for a zone with `count` programs, widest first: [{ offset, ring }] per program, `ring` 1 = B, else the share of A.
function fansFor(count, usable, ringA) {
  if (count === 1) return [[{ offset: 0, ring: ringA }], [{ offset: 0, ring: 1 }]];
  const fans = [], seen = new Set();
  for (const maxStep of FAN_STEP) {
    const step = Math.min(maxStep, 2 * usable / (count - 1));
    if (seen.has(step)) continue;
    seen.add(step);
    const offset = (number) => (number - (count - 1) / 2) * step;
    fans.push(Array.from({ length: count }, (_, number) => ({ offset: offset(number), ring: number % 2 ? ringA : 1 })));
    fans.push(Array.from({ length: count }, (_, number) => ({ offset: offset(number), ring: 1 })));
  }
  return fans;
}

function tryPlace(ordered, byZone, width, height, ringB, ringA, margin, innerStart) {
  const cx = width / 2, cy = height / 2;
  const rx = cx - EDGE_X - (TILE_W - ORB_R), ry = cy - EDGE_Y - TILE_H / 2;
  if (rx < 120 || ry < 120) return null;
  const outer = ordered.filter((zone) => zone.ring !== 'inner'), inner = ordered.find((zone) => zone.ring === 'inner');
  const items = [], obstacles = [], names = [], rests = {}, spokes = [], links = [];
  const hub = boxAround(cx, cy, HUB_R * 2, HUB_R * 2);
  const inside = (box) => box.left >= 0 && box.top >= 0 && box.right <= width && box.bottom <= height;
  const scaled = (tile) => Math.atan2((tile.y - cy) / cy, (tile.x - cx) / cx) * 180 / Math.PI;
  const at = (ring, degrees) => ({ x: cx + ring * ringB * rx * Math.cos(rad(degrees)), y: cy + ring * ringB * ry * Math.sin(rad(degrees)) });

  // The proof for the tiles of one zone: inside the map, clear of the hub, of each other, of everything placed before and of
  // every zone name and empty-zone box (M5a to M5c), in list order clockwise (M5e) and, for an outer zone, inside its sector (M5d).
  const fits = (tiles, sector) => {
    if (!tiles.every(inside)) return false;
    if (tiles.some((tile) => Math.hypot(tile.x - cx, tile.y - cy) - ORB_R - HUB_R < 13 || gapBetween(tile, hub) < 4)) return false;
    for (const [index, tile] of tiles.entries()) {
      if (tiles.slice(index + 1).some((other) => gapBetween(tile, other) < TILE_GAP)) return false;
      if (items.some((other) => gapBetween(tile, other) < TILE_GAP) || obstacles.some((box) => gapBetween(tile, box) < 2)) return false;
    }
    if (tiles.slice(1).some((tile, number) => wrap(scaled(tile) - scaled(tiles[number])) < 1)) return false;
    return !sector || tiles.every((tile) => Math.abs(wrap(scaled(tile) - sector.axis)) <= sector.half);
  };

  // The zone names and the boxes of the empty outer zones are fixed by their axes; they are obstacles for every tile.
  const sectors = outer.map((zone, index) => {
    const axis = -90 + index * 360 / outer.length, list = byZone.get(zone.id);
    const name = zoneName(zone, list.length, axis, cx, cy);
    names.push(name); obstacles.push(name);
    if (!list.length) { const point = at(ringA, axis); rests[zone.id] = point; obstacles.push(boxAround(point.x, point.y, 160, 80)); spokes.push({ zone: zone.id, x: point.x, y: point.y, trim: 0 }); }
    return { zone, axis, list, half: outer.length === 1 ? 181 : 180 / outer.length - margin, usable: outer.length === 1 ? 168 : 180 / outer.length - margin };
  });
  if (!obstacles.every(inside)) return null;
  // The inner ring comes before the outer fans: the smallest ring on which its programs fit, then its name under it.
  let innerLabel = null;
  if (inner) {
    const list = byZone.get(inner.id), labelWidth = 160;
    if (list.length) {
      let tiles = null;
      for (let step = 0; step < INNER_STEPS && !tiles; step += 1) {
        const rxi = innerStart[0] + 14 * step, ryi = innerStart[1] + 12 * step;
        const candidate = innerAngles(list.length).map((degrees, number) => tileAt(cx + rxi * Math.cos(rad(degrees)), cy + ryi * Math.sin(rad(degrees)), degrees, list[number].id, inner.id));
        if (fits(candidate, null)) tiles = candidate;
      }
      if (!tiles) return null;
      items.push(...tiles);
      for (const tile of tiles) spokes.push({ zone: inner.id, x: tile.x, y: tile.y, trim: ORB_R + 4 });
      const below = tiles.filter((tile) => tile.right > cx - labelWidth / 2 && tile.left < cx + labelWidth / 2).map((tile) => tile.bottom);
      innerLabel = { zone: inner.id, x: cx, top: Math.max(cy + HUB_R + 10, ...below) + 4 };
    } else {
      innerLabel = { zone: inner.id, x: cx, top: cy + HUB_R + 8 };
      rests[inner.id] = { x: cx, y: cy + HUB_R + 8 + 16 + 6 + 40 }; obstacles.push(boxAround(rests[inner.id].x, rests[inner.id].y, 160, 80));
    }
    const labelBox = { left: cx - labelWidth / 2, top: innerLabel.top, right: cx + labelWidth / 2, bottom: innerLabel.top + 16 };
    if (!inside(labelBox) || obstacles.some((box) => gapBetween(labelBox, box) < 2)) return null;
    obstacles.push(labelBox);
  }

  for (const sector of sectors) {
    if (!sector.list.length) continue;
    let placed = null;
    for (const fan of fansFor(sector.list.length, sector.usable, ringA)) {
      const tiles = fan.map((slot, number) => { const degrees = sector.axis + slot.offset, point = at(slot.ring, degrees); return tileAt(point.x, point.y, degrees, sector.list[number].id, sector.zone.id); });
      if (fits(tiles, outer.length > 1 ? sector : null)) { placed = tiles; break; }
    }
    if (!placed) return null;
    items.push(...placed);
    for (let number = 1; number < placed.length; number += 1) links.push({ zone: sector.zone.id, x1: placed[number - 1].x, y1: placed[number - 1].y, x2: placed[number].x, y2: placed[number].y });
    const middle = (placed.length - 1) / 2, nearest = placed.reduce((best, tile, number) => (Math.abs(number - middle) < Math.abs(best.number - middle) ? { tile, number } : best), { tile: placed[0], number: 0 }).tile;
    spokes.push({ zone: sector.zone.id, x: nearest.x, y: nearest.y, trim: ORB_R + 4 });
  }
  return { width, height, cx, cy, rx: rx * ringB, ry: ry * ringB, ringA, items: items.map(({ id, zone, x, y, left, top, leftLabel }) => ({ id, zone, x, y, left, top, leftLabel })), outer, names, rests, innerLabel, spokes, links, reserved: obstacles.map(({ left, top, right, bottom }) => ({ left, top, right, bottom })) };
}

export function placePrograms(zones, programs, width, height) {
  if (width < 650 || height < 470) return null;
  const ordered = zonesInOrder(zones);
  const outer = ordered.filter((zone) => zone.ring !== 'inner'), inner = ordered.find((zone) => zone.ring === 'inner');
  const byZone = new Map(ordered.map((zone) => [zone.id, programs.filter((program) => program.zone === zone.id)]));
  if (outer.length > 6 || (inner && byZone.get(inner.id).length > 6)) return null;
  if (programs.length * TILE_W * TILE_H > width * height * .4) return null;   // far too many for the map: do not even try
  for (const margin of SECTOR_MARGIN) for (const ringB of RING_B) for (const ringA of RING_A) for (const innerStart of INNER_START) {
    const layout = tryPlace(ordered, byZone, width, height, ringB, ringA, margin, innerStart);
    if (layout) return layout;
  }
  return null;
}
function initPlace(page) {
  const sheet = [...page.doc.styleSheets].find((value) => value.href?.endsWith('teamwork.css'));
  let rules = [];
  page.position = (layout) => {
    for (const index of rules.reverse()) sheet.deleteRule(index); rules = [];
    page.lines.replaceChildren();
    if (!layout) return;
    const rule = (text) => { rules.push(sheet.cssRules.length); sheet.insertRule(text, sheet.cssRules.length); };
    for (const item of layout.items) {
      rule(`[data-layout="constellation"] .tile[data-id="${item.id}"]{left:${item.left.toFixed(2)}px;top:${item.top.toFixed(2)}px}`);
      page.zones.querySelector(`[data-id="${item.id}"]`).classList.toggle('left-label', item.leftLabel);
    }
    const ns = page.lines.namespaceURI;
    page.lines.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    const svg = (tag, values) => { const node = page.doc.createElementNS(ns, tag); for (const [key, value] of Object.entries(values)) node.setAttribute(key, String(value)); page.lines.append(node); };
    for (const scale of [1, layout.ringA]) svg('ellipse', { cx: layout.cx, cy: layout.cy, rx: layout.rx * scale, ry: layout.ry * scale, class: 'orbit' });
    const colourOf = (zoneId) => page.state.catalogue.zones.find((zone) => zone.id === zoneId)?.color;
    // A dotted line between two points, shortened at both ends so that it starts and ends at the edge of a circle (an orb or the hub).
    const segment = (zoneId, from, to, startTrim, endTrim) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1, ux = (to.x - from.x) / length, uy = (to.y - from.y) / length;
      if (length <= startTrim + endTrim) return;
      svg('line', { x1: from.x + ux * startTrim, y1: from.y + uy * startTrim, x2: to.x - ux * endTrim, y2: to.y - uy * endTrim, 'data-color': colourOf(zoneId), class: 'spoke', 'data-zone': zoneId });
    };
    for (const name of layout.names) {
      rule(`[data-layout="constellation"] [data-zone="${name.zone}"] .zl{left:${name.x}px;top:${name.y}px;width:auto;writing-mode:${name.vertical ? 'vertical-rl' : 'horizontal-tb'};transform:translate(-50%,-50%)${name.flip ? ' rotate(180deg)' : ''}}`);
    }
    for (const [zoneId, point] of Object.entries(layout.rests)) rule(`[data-layout="constellation"] [data-zone="${zoneId}"] .resting{left:${point.x}px;top:${point.y}px}`);
    if (layout.innerLabel) rule(`[data-layout="constellation"] [data-zone="${layout.innerLabel.zone}"] .zl{left:${layout.innerLabel.x}px;top:${layout.innerLabel.top}px;transform:translateX(-50%)}`);
    for (const link of layout.links) segment(link.zone, { x: link.x1, y: link.y1 }, { x: link.x2, y: link.y2 }, ORB_R + 4, ORB_R + 4);
    for (const spoke of layout.spokes) segment(spoke.zone, { x: layout.cx, y: layout.cy }, spoke, HUB_R + 4, spoke.trim);
  };
}

// ==== end region: place ====

// ==== region: canvas ====
// Slice 10 fills this region: the character field.
export const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFXZ<>{}[]/=+*:;#$%&¦';
export function noise(a, b, c) {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296;
}
const RGB = { cyan: '56,214,255', amber: '255,178,62', pink: '255,94,200', violet: '169,139,255', lime: '198,242,58', slate: '200,208,224' };
// Outer zones start at north and occupy equal sectors centred on their axes.
// For four zones this is the mockup's dominant-axis N/E/S/W division.
const sectorIndex = (angle, count) => count ? Math.floor((((angle + Math.PI / 2 + Math.PI / count) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * count) : 0;
function initCanvas(page) {
  const context = page.canvas.getContext('2d');
  const discs = page.doc.getElementById('orb-glyphs'), discContext = discs.getContext('2d');
  const field = page.doc.createElement('canvas'), fieldContext = field.getContext('2d');
  let fieldKey = '', cells = [], geometry;
  // Layout is read only after render/resize, never inside an animation frame.
  // Measuring the actual circles also covers the phone and dense-list fallback.
  page.measure = () => {
    const map = page.map.getBoundingClientRect(), hub = page.doc.querySelector('.hub').getBoundingClientRect();
    geometry = { width: page.map.clientWidth, height: page.map.clientHeight, dpr: Math.min(devicePixelRatio || 1, 2),
      cx: hub.x + hub.width / 2 - map.x, cy: hub.y + hub.height / 2 - map.y, radius: hub.width / 2,
      nodes: [...page.zones.querySelectorAll('.tile')].map(tile => {
        const orb = tile.querySelector('.orb').getBoundingClientRect();
        let seed = 7;
        for (const letter of tile.dataset.id) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) | 0;
        return { tile, seed, x: orb.x + orb.width / 2 - map.x, y: orb.y + orb.height / 2 - map.y,
          scale: orb.width / 44, colour: RGB[tile.dataset.color] || RGB.slate };
      }) };
  };
  page.measure();
  page.draw = (time) => {
    if (page.doc.hidden) return;
    const { width, height, dpr, cx, cy, radius, nodes } = geometry;
    const pw = Math.round(width * dpr), ph = Math.round(height * dpr);
    if (page.canvas.width !== pw || page.canvas.height !== ph) { page.canvas.width = pw; page.canvas.height = ph; }
    if (discs.width !== pw || discs.height !== ph) { discs.width = pw; discs.height = ph; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, height);
    discContext.setTransform(dpr, 0, 0, dpr, 0, 0); discContext.clearRect(0, 0, width, height);
    const cluster = page.root.dataset.layout !== 'constellation', cw = cluster ? 15 : 16, ch = cluster ? 19 : 20;
    const colours = page.state.catalogue?.zones.filter((zone) => zone.ring !== 'inner').map((zone) => RGB[zone.color]) || [];
    context.font = '12px ui-monospace, monospace'; context.textAlign = 'center';
    // Most field glyphs do not change between frames. Retain their bitmap and
    // repaint only changed cells; their value still depends solely on time.
    const nextKey = [width, height, dpr, cw, ch, ...colours].join('|');
    if (nextKey !== fieldKey) {
      fieldKey = nextKey; field.width = pw; field.height = ph; cells = [];
      fieldContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      fieldContext.font = context.font; fieldContext.textAlign = 'center';
      for (let row = 0; row < height / ch; row++) for (let col = 0; col < width / cw; col++) {
        const x = col * cw, y = row * ch;
        const angle = Math.atan2(y - height / 2, x - width / 2);
        const colour = colours[sectorIndex(angle, colours.length)] || RGB.slate;
        cells.push({ col, row, x, y, rate: .15 + noise(col, row, 7), colour: `rgba(${colour},${.035 + .015 * noise(col, row, 3)})`, tick: null });
      }
    }
    for (const cell of cells) {
      const tick = Math.floor(time * cell.rate);
      if (tick === cell.tick) continue;
      cell.tick = tick;
      fieldContext.clearRect(cell.x - cw / 2, cell.y - 14, cw, ch);
      fieldContext.fillStyle = cell.colour;
      fieldContext.fillText(GLYPHS[Math.floor(noise(cell.col, cell.row, tick) * GLYPHS.length)], cell.x, cell.y);
    }
    context.drawImage(field, 0, 0, width, height);
    // Approved mockup: two coloured rings, including on the stacked layout.
    context.font = `${cluster ? 11 : 12}px ui-monospace, monospace`; context.textBaseline = 'middle';
    const rings = cluster ? [[radius + 12, 26, .22, 1], [radius + 26, 34, .16, -1]] : [[radius + 14, 30, .22, 1], [radius + 30, 40, .16, -1]];
    for (const [ring, [r, count, speed, direction]] of rings.entries()) for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + (page.reduced ? .35 : time * speed * direction), hv = noise(i, ring, 41);
      const alpha = page.reduced ? .5 + .25 * hv : .42 + .4 * (.5 + .5 * Math.sin(time * 1.6 + i * .8 + ring));
      const tick = page.reduced ? Math.floor(hv * 30) : Math.floor(time * (1 + 3 * hv) + hv * 30);
      context.fillStyle = `rgba(${colours[sectorIndex(angle, colours.length)] || RGB.slate},${ring ? alpha * .8 : alpha})`;
      context.fillText(GLYPHS[Math.floor(noise(i + ring * 50, 3, tick) * GLYPHS.length)], cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    }
    // An overlay above the card fills keeps the 31-glyph discs visible. The
    // unknown-state marker intentionally replaces them, as in the mockup.
    discContext.textAlign = 'center'; discContext.textBaseline = 'middle';
    if (page.state.kind !== 'normal' || page.state.unknown) return;
    for (const node of nodes) {
      const hot = node.tile.classList.contains('hot');
      discContext.font = `${Math.max(8, 9.5 * node.scale).toFixed(1)}px ui-monospace, monospace`;
      for (const [ring, [r, count]] of [[0, 1], [6.5, 5], [12.5, 10], [18, 15]].entries()) for (let i = 0; i < count; i++) {
        const hv = noise(node.seed + ring, i, 3), angle = count === 1 ? 0 : i / count * 6.2832 + ring * .7 + (page.reduced ? 0 : time * .35 * (ring % 2 ? 1 : -1));
        const alpha = page.reduced ? .55 + .3 * hv : .45 + .45 * (.5 + .5 * Math.sin(time * (2 + 3 * hv) + i));
        const head = hot ? hv > .45 : hv > .88;
        const tick = page.reduced ? Math.floor(hv * 30) : Math.floor(time * (1.5 + 5 * hv) + hv * 30);
        discContext.fillStyle = `rgba(${head ? '240,246,255' : node.colour},${Math.min(1, alpha + (head ? .3 : hot ? .2 : 0))})`;
        discContext.fillText(GLYPHS[Math.floor(noise(node.seed + ring, i, tick) * GLYPHS.length)], node.x + Math.cos(angle) * r * node.scale, node.y + Math.sin(angle) * r * node.scale);
      }
    }
  };
}

// ==== end region: canvas ====

// ==== region: motion ====
// Slice 10 fills this region: the animation loop and reduced motion.
function initMotion(page) {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let frame, last = 0;
  const tick = (time) => {
    if (!page.reduced && !page.doc.hidden) { if (time - last >= 50) { page.draw(time / 1000); last = time; } frame = requestAnimationFrame(tick); }
  };
  const update = () => {
    cancelAnimationFrame(frame); page.reduced = preference.matches; page.root.classList.toggle('reduced', page.reduced);
    page.reducedNote.hidden = !page.reduced; if (!page.doc.hidden) page.draw(page.reduced ? 4.6 : performance.now() / 1000);
    if (!page.reduced && !page.doc.hidden) frame = requestAnimationFrame(tick);
  };
  preference.addEventListener('change', update); page.doc.addEventListener('visibilitychange', update); update();
}

// ==== end region: motion ====

// ==== region: interact ====
// Slice 11 fills this region: pointer, focus, the detail card and the decode effect (by event delegation on the map).
function initInteract(page) {
  let decoded, selected;
  const show = (tile) => {
    clearTimeout(decoded);
    if (selected) { selected.classList.remove('hot'); const previous = page.state.programs.find((p) => p.id === selected.dataset.id); if (previous) selected.querySelector('.nm').textContent = previous.name.slice(0, 40); }
    page.zones.querySelectorAll('.zone').forEach((zone) => zone.classList.remove('hot-zone'));
    page.lines.querySelectorAll('.spoke').forEach((line) => line.classList.remove('hot-line'));
    selected = tile;
    if (!tile) { page.detail.replaceChildren(TEXTS.detailHint); page.detail.classList.add('hint'); return; }
    const program = page.state.programs.find((p) => p.id === tile.dataset.id); if (!program) return;
    const zone = page.state.catalogue.zones.find((z) => z.id === program.zone);
    tile.classList.add('hot'); tile.closest('.zone').classList.add('hot-zone');
    page.lines.querySelectorAll(`[data-zone="${zone.id}"]`).forEach((line) => line.classList.add('hot-line'));
    page.detail.classList.remove('hint'); page.detail.setAttribute('data-color', program.color || zone.color);
    page.detail.replaceChildren(make(page.doc, 'p', { class: 'detail-zone' }, zone.name), make(page.doc, 'h2', {}, program.name), make(page.doc, 'p', {}, program.purpose), make(page.doc, 'p', { class: 'address' }, TEXTS.detailAddress(program.url)), ...(page.state.unknown ? [make(page.doc, 'p', {}, TEXTS.statusUnknown)] : []));
    if (!page.reduced && page.root.dataset.layout === 'constellation') {
      const label = tile.querySelector('.nm'), start = performance.now(), name = program.name.slice(0, 40);
      const decode = () => {
        const elapsed = page.reduced || page.doc.hidden ? 520 : performance.now() - start;
        label.textContent = [...name].map((letter, i) => i < elapsed / 520 * name.length ? letter : GLYPHS[Math.floor(noise(i, name.length, Math.floor(elapsed / 45)) * GLYPHS.length)]).join('');
        if (elapsed < 520) decoded = setTimeout(decode, 45); else label.textContent = name;
      }; decode();
    }
  };
  page.map.addEventListener('pointerover', (event) => { const tile = event.target.closest('.tile'); if (tile && tile !== selected) show(tile); });
  page.map.addEventListener('pointerleave', () => show(page.doc.activeElement?.closest('.tile')));
  page.map.addEventListener('focusin', (event) => show(event.target.closest('.tile')));
  page.map.addEventListener('focusout', (event) => { if (!event.relatedTarget?.closest('.tile')) show(null); });
}

// ==== end region: interact ====

// ==== region: refresh ====
// Slice 12 fills this region: the periodic refresh, the age line and the switch to the unknown state.
function initRefresh(page) {
  let busy = false, hiddenAt = null;
  const refresh = async (initial = false) => {
    if (busy || page.doc.hidden) return;
    busy = true;
    try { const data = await page.load(); if (!initial && page.data && (data.statusFetchFailed || !validStatus(data.status))) return; page.render(data); }
    catch { if (initial || !page.data) page.render(null); }
    finally { busy = false; }
  };
  page.start = () => { page.loading.hidden = false; return refresh(true); };
  page.retry.addEventListener('click', page.start);
  setInterval(() => { if (!page.doc.hidden) refresh(); }, 600000);
  setInterval(() => {
    if (page.doc.hidden) return;
    const now = performance.now();
    if (page.data) {
      const state = deriveState(page.data, now);
      if (state.unknown !== page.state.unknown) page.render(page.data);
      else { page.state.age = state.age; page.stand.textContent = ageText(state); }
    }
  }, 30000);
  page.doc.addEventListener('visibilitychange', () => {
    if (page.doc.hidden) hiddenAt = performance.now();
    else if (hiddenAt !== null && performance.now() - hiddenAt > 300000) { refresh(); }
  });
}

// ==== end region: refresh ====

// ==== region: boot ====
// Slice 1 fills this region; slice 6 may add wiring inside the existing calls. The call list is fixed: one function
// per later region, in the order of the regions. A later slice replaces the body of its function and nothing here.

// The places of the page that the script fills, found once. Each region adds its own members to this object.
export function findPage(doc) {
  const part = (id) => doc.getElementById(id);
  return {
    doc,
    root: part('page'), map: part('map'), canvas: part('characters'), lines: part('lines'), top: part('top'), side: part('side'), navigation: part('navigation'), back: part('back'), privacy: part('privacy'), message: part('message'), messageText: part('message-text'), messageHint: part('message-hint'), retry: part('retry'),
    loading: part('loading'),
    banner: part('banner'),
    stand: part('stand'),
    count: part('count'),
    hubMeta: part('hubn'),
    zones: part('zones'),
    legend: part('legend'),
    detail: part('detail'),
    reducedNote: part('rmnote'),
  };
}

// L2: while the files are on their way the page shows the loading text. Slice 6 turns the failure into a full state.
function start(page) { return page.start(); }

export function boot(doc) {
  const page = findPage(doc);
  initContract(page);
  initState(page);
  initRender(page);
  initLayout(page);
  initPlace(page);
  initCanvas(page);
  initMotion(page);
  initInteract(page);
  initRefresh(page);
  start(page);
  return page;
}

if (typeof document !== 'undefined') boot(document);

// ==== end region: boot ====
