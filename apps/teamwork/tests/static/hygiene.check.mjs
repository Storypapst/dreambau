// Hygiene of the checks themselves:
// - no check can be skipped: the grep of the ticket finds nothing in tests/ (the forbidden words are put together
//   from fragments below, so that this file does not contain them either);
// - no *.test.* or *.spec.* file exists anywhere under apps/teamwork, installed packages included, because the
//   repository's root test runner would collect them (gap G15).
// Both scans prove themselves on a made-up tree that holds what they must flag.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';

// The four forms of the ticket: a skipped test, a focused test, a note to fix later, and a disabled test.
const FORBIDDEN = [['\\.sk', 'ip\\('], ['\\.on', 'ly\\('], ['fix', 'me'], ['x', 'it\\(']].map((parts) => parts.join(''));
const MADE_UP = [['test', '.sk', 'ip("a")'], ['describe', '.on', 'ly("b")'], ['// fix', 'me later'], ['x', 'it("c")']].map((parts) => parts.join(''));

// The command of the ticket, run in `cwd` on the folder `tests`: exit status 1 and no output means nothing was found.
function grepTests(cwd) {
  const result = spawnSync('grep', ['-rn', '-E', FORBIDDEN.join('|'), 'tests'], { cwd, encoding: 'utf8' });
  return { status: result.status, lines: (result.stdout || '').split('\n').filter((line) => line !== '') };
}

// Every file below `dir` (symbolic links are not followed) whose name carries .test. or .spec.
function strayTestFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(test|spec)\./.test(entry.name)) found.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return found;
}

const made = [];
try {
  await run(async () => {
    // the real tests folder
    const real = grepTests(ROOT);
    check('hygiene: grep for skip, only, the fix-later note and the disabled test finds nothing in tests/', real.status === 1 && real.lines.length === 0, `exit status ${real.status}, ${real.lines.length} lines: ${real.lines.slice(0, 2).join(' | ')}`);

    // the same command on a tree that holds all four forms must flag all four
    const dirty = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-hygiene-'));
    made.push(dirty);
    fs.mkdirSync(path.join(dirty, 'tests', 'sub'), { recursive: true });
    MADE_UP.forEach((line, index) => fs.writeFileSync(path.join(dirty, 'tests', index % 2 === 0 ? '' : 'sub', `f${index}.mjs`), `${line}\n`));
    const flagged = grepTests(dirty);
    check('hygiene: the same grep flags each of the four forms in a made-up tree', flagged.status === 0 && flagged.lines.length === 4, `exit status ${flagged.status}, ${flagged.lines.length} lines`);
    const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-hygiene-'));
    made.push(clean);
    fs.mkdirSync(path.join(clean, 'tests'));
    fs.writeFileSync(path.join(clean, 'tests', 'ok.mjs'), 'process.exitCode = 0;\n');
    same('hygiene: the same grep finds nothing in a clean tree (exit status 1)', grepTests(clean).status, 1);

    // G15: no *.test.* or *.spec.* file anywhere under apps/teamwork
    same('hygiene G15: no *.test.* or *.spec.* file under apps/teamwork (installed packages included)', strayTestFiles(ROOT), []);
    const strays = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-hygiene-'));
    made.push(strays);
    fs.mkdirSync(path.join(strays, 'node_modules', 'foo'), { recursive: true });
    fs.mkdirSync(path.join(strays, 'tests', 'e2e'), { recursive: true });
    fs.writeFileSync(path.join(strays, 'node_modules', 'foo', 'x.test.js'), '');
    fs.writeFileSync(path.join(strays, 'tests', 'e2e', 'b.spec.mjs'), '');
    fs.writeFileSync(path.join(strays, 'tests', 'e2e', 'c.check.mjs'), '');
    same('hygiene G15: the scan finds a test file in an installed package and a spec file in tests/e2e, and not a check file',
      strayTestFiles(strays).sort(), [path.join('node_modules', 'foo', 'x.test.js'), path.join('tests', 'e2e', 'b.spec.mjs')]);
  });
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
