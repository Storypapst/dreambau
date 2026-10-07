// F6, D4: programs.example.json is byte for byte the block of spec 7.9 (the invented list every test uses).
// The size and the sha256 are the numbers of the ticket, not computed from the file under test.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST } from '../lib/paths.mjs';

const EXPECTED_BYTES = 3313;
const EXPECTED_SHA256 = 'bc7fb559f2c6e638430993eae7113d559a555c22db3e06300af34d7ff0d64329';

await run(async () => {
  const bytes = fs.readFileSync(EXAMPLE_LIST);
  check('example list F6 D4: 3,313 bytes', bytes.length === EXPECTED_BYTES, `${bytes.length} bytes`);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  check('example list F6 D4: sha256 is the one of spec 7.9', sha === EXPECTED_SHA256, sha);

  const list = JSON.parse(bytes.toString('utf8'));
  same('example list F6: format 1', list.format, 1);
  same('example list F6: 5 zones in file order', list.zones.map((z) => z.id), ['nord', 'ost', 'sued', 'west', 'verwaltung']);
  same('example list F6: 21 programs', list.programs.length, 21);

  const perZone = {};
  for (const program of list.programs) perZone[program.zone] = (perZone[program.zone] || 0) + 1;
  same('example list: 5, 5, 4, 4 and 3 programs per zone', perZone, { nord: 5, ost: 5, sued: 4, west: 4, verwaltung: 3 });

  const text = bytes.toString('utf8');
  check('example list F6: no admin flag any more', !/"admin"/.test(text));
  same('example list F7: internal is a program of the zone verwaltung that opens in a new tab',
    list.programs.filter((p) => p.id === 'internal').map((p) => [p.zone, p.newTab === true]), [['verwaltung', true]]);
});
