// The two public data files, made the way the status script makes them (spec 7.2, 7.3, D2, D3), for the page server
// and for the checks. The catalogue is made from the list field by field (a whitelist), never by copying the list.
const ZONE_FIELDS = ['id', 'name', 'color', 'ring'];
const PROGRAM_FIELDS = ['id', 'name', 'purpose', 'url', 'zone', 'color', 'newTab'];

const pick = (object, fields) => Object.fromEntries(fields.filter((field) => object[field] !== undefined).map((field) => [field, object[field]]));

// zones keep id, name, color, ring; programs keep id, name, purpose, url, zone, color, newTab; the order of the list is kept.
export function publicCatalogue(list) {
  return {
    format: 1,
    zones: list.zones.map((zone) => pick(zone, ZONE_FIELDS)),
    programs: list.programs.map((program) => pick(program, PROGRAM_FIELDS)),
  };
}

// The public status: nothing but the format, the time of the check and the ids that answered.
export function publicStatus(reachable, checkedAt = nowUtc()) {
  return { format: 1, checkedAt, reachable: [...reachable] };
}

// UTC, ISO 8601, whole seconds, ending in Z.
export function nowUtc(date = new Date()) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// D3: compact JSON followed by one newline.
export function publicJson(value) {
  return `${JSON.stringify(value)}\n`;
}
