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
  innerZone: (name) => `+ ${name}`,
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
// Slice 1 only reads both files and keeps the programs that can be a Kachel (K1).
export const DATA_FILES = Object.freeze({ catalogue: '/teamwork/data/programs.json', status: '/teamwork/data/status.json' });
export const PALETTE_KEYS = Object.freeze(['cyan', 'amber', 'pink', 'violet', 'lime', 'slate']);

export const isPaletteKey = (value) => PALETTE_KEYS.includes(value);

// K1: only an https: address becomes a Kachel.
export function isHttpsAddress(value) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// The programs of the catalogue that get a Kachel: an https: address and a Zone that exists, in the order of the file.
export function usablePrograms(catalogue) {
  const known = new Set(catalogue.zones.map((zone) => zone.id));
  return catalogue.programs.filter((program) => isHttpsAddress(program.url) && known.has(program.zone));
}

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

// L1: both files are asked for at the same moment, from the own origin, never from a cache. The catalogue is needed;
// the status is kept for slice 6 and is null when it cannot be read.
export async function loadData() {
  const catalogue = getJson(DATA_FILES.catalogue);
  const status = getJson(DATA_FILES.status).catch(() => null);
  const data = { catalogue: await catalogue, status: await status };
  const valid = data.catalogue && data.catalogue.format === 1 && Array.isArray(data.catalogue.zones) && Array.isArray(data.catalogue.programs);
  if (!valid) throw new Error('the catalogue is not valid');
  return data;
}

function initContract(page) {
  page.load = loadData;
}

// ==== end region: contract ====

// ==== region: state ====
// Slice 6 fills this region: which programs are shown (L7), the age line (T1), the count (T2) and the unknown state.
function initState(page) {}

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
export function buildTile(doc, program) {
  const newTab = program.newTab === true;
  const link = make(doc, 'a', {
    class: 'tile',
    href: program.url,
    rel: 'noopener noreferrer',
    target: newTab ? '_blank' : undefined,
    'data-id': program.id,
    'data-color': colorOf(program),
    'aria-label': TEXTS.tileLabel(program, { newTab }),
  }, make(doc, 'span', { class: 'orb', 'aria-hidden': 'true' }),
  make(doc, 'span', { class: 'lb' }, make(doc, 'span', { class: 'nm' }, program.name), make(doc, 'span', { class: 'ds' }, program.purpose)));
  return make(doc, 'li', {}, link);
}

// One Zone panel: its name as an <h2> and its Kacheln in a list (A1).
export function buildZone(doc, zone, programs) {
  const id = `h-${zone.id}`;
  return make(doc, 'section', { class: 'zone', 'data-zone': zone.id, 'data-color': colorOf(zone), 'data-ring': zone.ring === 'inner' ? 'inner' : undefined, 'aria-labelledby': id },
    make(doc, 'div', { class: 'zl' }, make(doc, 'h2', { id }, zone.name)),
    make(doc, 'ul', {}, ...programs.map((program) => buildTile(doc, program))));
}

// The hub's second text: the number of outer zones, and the inner zone's name on a second line when there is one.
function hubLines(doc, zones) {
  const inner = zones.find((zone) => zone.ring === 'inner');
  const lines = [make(doc, 'span', {}, TEXTS.zoneCount(zones.filter((zone) => zone.ring !== 'inner').length))];
  if (inner) lines.push(make(doc, 'span', { class: 'inner', 'data-color': colorOf(inner) }, TEXTS.innerZone(inner.name)));
  return lines;
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
  page.render = (data) => renderCatalogue(page, data.catalogue);
}

// ==== end region: render ====

// ==== region: layout ====
// Slice 7 fills this region: the cluster layout and which layout applies; slice 9 adds the constellation.
function initLayout(page) {}

// ==== end region: layout ====

// ==== region: place ====
// Slice 8 fills this region: the placement function of the constellation.
function initPlace(page) {}

// ==== end region: place ====

// ==== region: canvas ====
// Slice 10 fills this region: the character field.
function initCanvas(page) {}

// ==== end region: canvas ====

// ==== region: motion ====
// Slice 10 fills this region: the animation loop and reduced motion.
function initMotion(page) {}

// ==== end region: motion ====

// ==== region: interact ====
// Slice 11 fills this region: pointer, focus, the detail card and the decode effect (by event delegation on the map).
function initInteract(page) {}

// ==== end region: interact ====

// ==== region: refresh ====
// Slice 12 fills this region: the periodic refresh, the age line and the switch to the unknown state.
function initRefresh(page) {}

// ==== end region: refresh ====

// ==== region: boot ====
// Slice 1 fills this region; slice 6 may add wiring inside the existing calls. The call list is fixed: one function
// per later region, in the order of the regions. A later slice replaces the body of its function and nothing here.

// The places of the page that the script fills, found once. Each region adds its own members to this object.
export function findPage(doc) {
  const part = (id) => doc.getElementById(id);
  return {
    doc,
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
function start(page) {
  page.loading.hidden = false;
  return page.load().then(
    (data) => {
      page.loading.hidden = true;
      page.render(data);
    },
    () => {
      page.loading.textContent = TEXTS.unavailable;
    },
  );
}

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
