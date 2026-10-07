import { check, same, run } from '../lib/check.mjs';
import { readFileSync } from 'node:fs';
import { publicCatalogue } from '../lib/catalogue.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';
import * as page from '../../site/teamwork.js';

await run(async () => {
  const catalogue = publicCatalogue(JSON.parse(readFileSync(EXAMPLE_LIST, 'utf8')));
  const stamp = Date.parse('2026-10-07T12:00:00Z');
  const data = { catalogue, status: { format: 1, checkedAt: '2026-10-07T12:00:00Z', reachable: catalogue.programs.map((p) => p.id) }, serverTimeMs: stamp, receivedAt: 1000 };
  const derive = (value, now = 1000) => page.deriveState?.(value, now);
  same('C28 fresh status includes every reachable program in catalogue order', derive(data)?.programs.map((p) => p.id), catalogue.programs.map((p) => p.id));
  const partial = { ...data, status: { ...data.status, reachable: [catalogue.programs[0].id, 'not-in-catalogue'] } };
  same('C27 missing reachable IDs are hidden and unknown IDs ignored', derive(partial)?.programs.map((p) => p.id), [catalogue.programs[0].id]);
  same('C32 fresh status with no reachable IDs is normal, without an unknown banner', [derive({ ...data, status: { ...data.status, reachable: [] } })?.kind, derive({ ...data, status: { ...data.status, reachable: [] } })?.unknown], ['normal', false]);
  for (const [name, status] of [
    ['missing', null], ['malformed', { format: 1, checkedAt: 'not a date', reachable: [] }],
    ['old', { ...data.status, checkedAt: '2026-10-07T08:59:59Z' }],
    ['future', { ...data.status, checkedAt: '2026-10-07T12:05:01Z' }]
  ]) {
    const state = derive({ ...data, status });
    check('C29 ' + name + ' status shows all programs as unknown', state?.unknown === true && state?.programs.length === 21);
  }
  const later = derive(data, 1000 + 10801 * 1000);
  check('C29 passing three hours changes the state without a new fetch', later?.unknown === true && later?.programs.length === 21);
  const empty = { ...data, catalogue: { format: 1, zones: [{ id: 'verwaltung', name: 'Verwaltung', color: 'lime', ring: 'inner' }], programs: [] } };
  check('C32 genuine empty catalogue has the approved empty state without unknown banner', derive(empty)?.kind === 'empty' && derive(empty)?.unknown === false);
  for (const value of [null, {}, { format: 2, zones: [], programs: [] }, { format: 1, zones: [], programs: [] }]) {
    check('C31 invalid catalogue is unavailable', derive({ ...data, catalogue: value })?.kind === 'unavailable');
  }
  const malicious = { ...catalogue, programs: [{ ...catalogue.programs[0], name: '<svg onload=alert(1)>', purpose: 'x'.repeat(140) }, { ...catalogue.programs[0], id: 'bad id' }, { ...catalogue.programs[0], id: 'unsafe', url: 'javascript:alert(1)' }] };
  const selected = derive({ ...data, catalogue: malicious, status: null });
  check('C34 C35 wrong ID and unsafe address are skipped while literal text is retained', selected?.programs.length === 1 && selected?.programs[0].name === '<svg onload=alert(1)>');
});
