import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, run } from '../lib/check.mjs';
import { ROOT, EXAMPLE_LIST } from '../lib/paths.mjs';

await run(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-validator-'));
  const file = path.join(dir, 'programs.json');
  const out = path.join(dir, 'data');
  const history = path.join(dir, 'history');
  fs.mkdirSync(out); fs.mkdirSync(history);
  fs.writeFileSync(path.join(out, 'status.json'), 'unchanged\n');
  const original = fs.readFileSync(EXAMPLE_LIST, 'utf8');
  function validate(list) {
    fs.writeFileSync(file, JSON.stringify(list));
    return spawnSync('python3', [path.join(ROOT, 'status/teamwork_status.py'), '--list', file, '--validate'], { encoding: 'utf8' });
  }
  try {
    const example = JSON.parse(original);
    check('C9 D4 the invented example list validates', validate(example).status === 0);
    const empty = { format: 1, zones: [{ id: 'verwaltung', name: 'Verwaltung', color: 'lime', ring: 'inner' }], programs: [] };
    check('C9 a genuine empty list can be published without inventing programs', validate(empty).status === 0);
    const cases = [
      ['format', (v) => { v.format = 2; }],
      ['duplicate program', (v) => { v.programs.push(v.programs[0]); }],
      ['duplicate zone', (v) => { v.zones.push(v.zones[0]); }],
      ['unknown zone', (v) => { v.programs[0].zone = 'unknown'; }],
      ['unsafe URL', (v) => { v.programs[0].url = 'javascript:alert(1)'; }],
      ['embedded credential', (v) => { v.programs[0].url = 'https://user:password' + '@' + 'example.test/'; }],
      ['invalid probe', (v) => { v.programs[0].probe = 'file:///etc/passwd'; }],
      ['name length', (v) => { v.programs[0].name = 'x'.repeat(25); }],
      ['purpose type', (v) => { v.programs[0].purpose = 5; }],
      ['palette key', (v) => { v.zones[0].color = 'red'; }],
      ['inner zones', (v) => { v.zones.forEach((z) => { z.ring = 'inner'; }); }],
      ['program count', (v) => { v.programs = Array.from({ length: 61 }, (_, i) => ({ ...v.programs[0], id: 'program-' + i })); }]
    ];
    for (const [name, spoil] of cases) {
      const value = JSON.parse(original); spoil(value);
      const result = validate(value);
      check('C9 refuses ' + name, result.status === 2 && result.stderr.startsWith('invalid list:'));
    }
    fs.writeFileSync(file, '{');
    const broken = spawnSync('python3', [path.join(ROOT, 'status/teamwork_status.py'), '--list', file, '--out', out, '--history', history], { encoding: 'utf8' });
    check('C10 invalid input preserves existing public files and creates no history', broken.status === 2 && broken.stderr.startsWith('invalid list:') && fs.readFileSync(path.join(out, 'status.json'), 'utf8') === 'unchanged\n' && fs.readdirSync(history).length === 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
