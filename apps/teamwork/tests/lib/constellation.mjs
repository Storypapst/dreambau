// Shared helpers for the checks of the constellation (spec M1 to M9, C36): invented lists of a given shape, the size of
// the map for a window, and the invariants of M5 measured on boxes. Nothing here knows the real program list.

// A list with the shape `outer` (one count per outer zone, in the order nord, ost, sued, west, ...) plus `inner` programs in
// the inner zone. Every name, purpose and address is invented; every host ends in example.test.
const ZONES = [
  { id: 'nord', name: 'Zone Nord', color: 'cyan' },
  { id: 'ost', name: 'Zone Ost', color: 'pink' },
  { id: 'sued', name: 'Zone Süd', color: 'amber' },
  { id: 'west', name: 'Zone West', color: 'violet' },
  { id: 'mitte', name: 'Zone Mitte', color: 'slate' },
  { id: 'rand', name: 'Zone Rand', color: 'lime' },
];
const LABELS = ['Nord', 'Ost', 'Süd', 'West', 'Mitte', 'Rand'];

export function syntheticList({ outer = [3, 5, 2, 2], inner = 5, innerName = 'Verwaltung' } = {}) {
  const zones = outer.map((_, index) => ZONES[index]);
  if (inner >= 0) zones.push({ id: 'verwaltung', name: innerName, color: 'lime', ring: 'inner' });
  const programs = [];
  outer.forEach((count, zoneIndex) => {
    for (let number = 1; number <= count; number += 1) {
      programs.push({ id: `${ZONES[zoneIndex].id}-${number}`, name: `${LABELS[zoneIndex]} ${number}`, purpose: 'Erfundenes Beispielprogramm', url: `https://${ZONES[zoneIndex].id}-${number}.example.test/`, zone: ZONES[zoneIndex].id });
    }
  });
  for (let number = 1; number <= inner; number += 1) {
    programs.push({ id: `verwaltung-${number}`, name: `Verw ${number}`, purpose: 'Erfundenes Verwaltungsbeispiel', url: `https://verwaltung-${number}.example.test/`, zone: 'verwaltung' });
  }
  return { format: 1, zones, programs };
}

// The size of the map for a window (spec M3, M4): 24 px of padding on each side of the page, the side column of
// 296 px and its gap of 18 px from 1180 px, a height of the window minus 180 px, at least 470 px.
export function mapSize(viewportWidth, viewportHeight) {
  return { width: viewportWidth >= 1180 ? viewportWidth - 48 - 314 : viewportWidth - 48, height: Math.max(470, viewportHeight - 180) };
}

export const DESKTOP_SIZES = [[1920, 1080], [1440, 900], [1280, 720]];

export const boxGap = (a, b) => Math.hypot(Math.max(a.left - b.right, b.left - a.right, 0), Math.max(a.top - b.bottom, b.top - a.bottom, 0));
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const half = (values) => { const hull = []; for (const point of values) { while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop(); hull.push(point); } return hull; };
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function hullsIntersect(a, b) {
  if (!a.length || !b.length) return false;
  const onSegment = (point, start, end) => Math.abs(cross(start, end, point)) < .001 && point.x >= Math.min(start.x, end.x) - .001 && point.x <= Math.max(start.x, end.x) + .001 && point.y >= Math.min(start.y, end.y) - .001 && point.y <= Math.max(start.y, end.y) + .001;
  const contains = (hull, point) => hull.length === 1 ? Math.hypot(hull[0].x - point.x, hull[0].y - point.y) < .001 : hull.length === 2 ? onSegment(point, ...hull) : hull.every((start, index) => cross(start, hull[(index + 1) % hull.length], point) >= -.001);
  if (a.some((point) => contains(b, point)) || b.some((point) => contains(a, point))) return true;
  for (const [i, start] of a.entries()) for (const [j, other] of b.entries()) {
    const end = a[(i + 1) % a.length], otherEnd = b[(j + 1) % b.length];
    if (cross(start, end, other) * cross(start, end, otherEnd) < 0 && cross(other, otherEnd, start) * cross(other, otherEnd, end) < 0) return true;
  }
  return false;
}

// The invariants M5a to M5f on a list of tiles and the hub: a tile is { id, zone, left, top, right, bottom, orb: { cx, cy } } in
// the map's own coordinates, the hub { cx, cy, radius }. Returns the names of the invariants that do not hold (an empty list is
// a clean result). `labels` are the boxes that no tile may touch (zone names, empty-zone boxes).
export function brokenInvariants({ tiles, zones, width, height, hub, labels = [] }) {
  const broken = new Set();
  const tolerance = 0.01;
  for (const [index, tile] of tiles.entries()) {
    if (tile.left < -tolerance || tile.top < -tolerance || tile.right > width + tolerance || tile.bottom > height + tolerance) broken.add('M5b inside the map');
    if (tile.right - tile.left < 44 || tile.bottom - tile.top < 44) broken.add('M5f 44 px');
    if (Math.hypot(tile.orb.cx - hub.cx, tile.orb.cy - hub.cy) - 22 - hub.radius < 12 - tolerance) broken.add('M5c orb 12 px from the hub');
    for (const other of tiles.slice(index + 1)) if (boxGap(tile, other) < 1.95) broken.add('M5a gap of 2 px');
    for (const label of labels) if (boxGap(tile, label) < 1) broken.add('a tile touches a zone name or an empty-zone box');
  }
  const outer = zones.filter((zone) => zone.ring !== 'inner');
  const hulls = outer.map((zone) => convexHull(tiles.filter((tile) => tile.zone === zone.id).map((tile) => ({ x: tile.orb.cx, y: tile.orb.cy }))));
  if (hulls.some((hull, index) => hulls.slice(index + 1).some((other) => hullsIntersect(hull, other)))) broken.add('M5d outer zones interleave');
  for (const zone of zones) {
    const angles = tiles.filter((tile) => tile.zone === zone.id).map((tile) => Math.atan2((tile.orb.cy - hub.cy) / (height / 2), (tile.orb.cx - hub.cx) / (width / 2)));
    const clockwise = angles.slice(1).every((angle, index) => { let delta = angle - angles[index]; if (delta < -Math.PI) delta += 2 * Math.PI; if (delta > Math.PI) delta -= 2 * Math.PI; return delta >= -2 * Math.PI / 180; });
    if (!clockwise) broken.add('M5e clockwise in list order');
  }
  return [...broken];
}

// What placePrograms returns, as the tiles of brokenInvariants (a tile box is 120 x 46 px; its orb is 44 px at one end).
export function tilesOf(layout) {
  return layout.items.map((item) => ({ id: item.id, zone: item.zone, left: item.left, top: item.top, right: item.left + 120, bottom: item.top + 46, orb: { cx: item.leftLabel ? item.left + 98 : item.left + 22, cy: item.top + 23 } }));
}
