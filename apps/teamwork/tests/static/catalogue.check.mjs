// The test library's make-the-public-files helper (lib/catalogue.mjs), proved against spec 7.2, 7.3, D2 and D3:
// the public catalogue is made from the list field by field (zones keep id, name, color, ring; programs keep id,
// name, purpose, url, zone, color, newTab; probe and every unknown field are dropped; the order is kept), the public
// status has exactly the keys format, checkedAt and reachable, and both are compact JSON with one final newline.
// Slice 5 later checks this helper against the status script's own output, so what it makes is pinned here.
import fs from 'node:fs';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';
import { nowUtc, publicCatalogue, publicJson, publicStatus } from '../lib/catalogue.mjs';

const ZONE_KEYS = ['id', 'name', 'color', 'ring'];
const PROGRAM_KEYS = ['id', 'name', 'purpose', 'url', 'zone', 'color', 'newTab'];

await run(async () => {
  const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
  const catalogue = publicCatalogue(list);

  same('catalogue: the keys of the public catalogue are format, zones and programs', Object.keys(catalogue), ['format', 'zones', 'programs']);
  same('catalogue: format 1, five zones, 21 programs', [catalogue.format, catalogue.zones.length, catalogue.programs.length], [1, 5, 21]);
  same('catalogue D2: the order of the zones and of the programs is the order of the list',
    [catalogue.zones.map((zone) => zone.id), catalogue.programs.map((program) => program.id)], [list.zones.map((zone) => zone.id), list.programs.map((program) => program.id)]);
  check('catalogue D2: no program carries probe, and the two programs that had one lose only that', list.programs.filter((program) => 'probe' in program).length === 2 && catalogue.programs.every((program) => !('probe' in program)));
  check('catalogue D2: every key of a zone and of a program is on the whitelist',
    catalogue.zones.every((zone) => Object.keys(zone).every((key) => ZONE_KEYS.includes(key))) && catalogue.programs.every((program) => Object.keys(program).every((key) => PROGRAM_KEYS.includes(key))));
  same('catalogue D2: a program of the list keeps its whitelisted fields and its values',
    catalogue.programs[0], { id: 'aurora', name: 'Aurora', purpose: 'Zeigt Beispielzahlen', url: 'https://aurora.example.test/', zone: 'nord' });
  same('catalogue: the inner zone keeps ring, the colour override and newTab stay where the list has them',
    [catalogue.zones[4], catalogue.programs.filter((program) => 'color' in program).length, catalogue.programs.filter((program) => program.newTab === true).map((program) => program.id)],
    [{ id: 'verwaltung', name: 'Verwaltung', color: 'lime', ring: 'inner' }, 1, ['internal']]);

  // C3 in miniature: a field called note and a field called secret, and a probe, in a list of two programs
  const messy = {
    format: 1,
    zones: [{ id: 'a', name: 'A', color: 'cyan', note: 'for the operator' }],
    programs: [
      { id: 'p1', name: 'P1', purpose: 'Tut etwas', url: 'https://p1.example.test/', zone: 'a', probe: 'https://p1.example.test/health', note: 'n', secret: 's' },
      { id: 'p2', name: 'P2', purpose: 'Tut mehr', url: 'https://p2.example.test/', zone: 'a', newTab: false, color: 'pink' },
    ],
  };
  const text = publicJson(publicCatalogue(messy));
  check('catalogue C3: neither probe nor note nor secret is in the public text', !/probe|note|secret|operator/.test(text), /probe|note|secret|operator/.test(text) ? text : '');
  same('catalogue: newTab false and a colour override are kept', JSON.parse(text).programs[1], { id: 'p2', name: 'P2', purpose: 'Tut mehr', url: 'https://p2.example.test/', zone: 'a', color: 'pink', newTab: false });

  // D3: compact JSON plus one newline
  check('catalogue D3: compact JSON with one final newline (no white space the parsed text would not need)', text === `${JSON.stringify(JSON.parse(text))}\n` && text.endsWith('}\n') && !text.endsWith('\n\n'));
  same('catalogue D3: that text is exactly JSON.stringify of the object and a newline', publicJson({ a: [1, 2], b: 'x' }), '{"a":[1,2],"b":"x"}\n');

  // 7.3: the public status
  const status = publicStatus(['aurora', 'basalt'], '2026-10-05T14:00:07Z');
  same('catalogue 7.3: the public status has exactly format, checkedAt and reachable', [Object.keys(status), status], [['format', 'checkedAt', 'reachable'], { format: 1, checkedAt: '2026-10-05T14:00:07Z', reachable: ['aurora', 'basalt'] }]);
  check('catalogue 7.3: the time of now is UTC, in whole seconds, ending in Z', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(nowUtc()), nowUtc());
  check('catalogue 7.3: the time of now is the time of now', Math.abs(Date.parse(nowUtc()) - Date.now()) < 2000);
});
