// BD-9: the runner proves itself on made-up checks. A check that fails makes the whole run fail, a run that finds no
// check fails, a filter selects by name prefix, and a check that prints no PASS line does not pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';

const RUNNER = path.join(ROOT, 'tests', 'run.mjs');
const HELPER = path.join(ROOT, 'tests', 'lib', 'check.mjs');
const good = (name) => `import { check, run } from ${JSON.stringify(HELPER)};\nawait run(async () => { check('${name} ok', true); });\n`;
const bad = `import { check, run } from ${JSON.stringify(HELPER)};\nawait run(async () => { check('X broken', false, 'on purpose'); });\n`;
const silent = 'console.log("nothing asserted");\n';

function runnerOn(files, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-runner-'));
  try {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    const result = spawnSync(process.execPath, [RUNNER, ...args], { env: { ...process.env, BLOG_TESTS_DIR: dir }, encoding: 'utf8' });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await run(async () => {
  const allGood = runnerOn({ 'a.check.mjs': good('a'), 'b.check.mjs': good('b') });
  same('BD-9 two passing checks: exit 0', allGood.code, 0);
  check('BD-9 one PASS line per check and a total with 0 failed', /PASS {2}a /.test(allGood.out) && /PASS {2}b /.test(allGood.out) && /2 checks, 2 passed, 0 failed/.test(allGood.out), allGood.out);

  const oneBad = runnerOn({ 'a.check.mjs': good('a'), 'z.check.mjs': bad });
  same('BD-9 one failing check: exit 1', oneBad.code, 1);
  check('BD-9 the failing check is named with a FAIL line and the total counts it', /FAIL {2}z /.test(oneBad.out) && /2 checks, 1 passed, 1 failed/.test(oneBad.out), oneBad.out);

  same('BD-9 a check that asserts nothing fails', runnerOn({ 'q.check.mjs': silent }).code, 1);
  same('BD-9 a run that finds no check fails', runnerOn({}).code, 1);

  const filtered = runnerOn({ 'a.check.mjs': good('a'), 'z.check.mjs': bad }, ['--', 'a']);
  check('BD-9 a filter after -- runs only the matching checks', filtered.code === 0 && /1 check, 1 passed, 0 failed/.test(filtered.out), filtered.out);
  same('BD-9 a filter that matches nothing fails', runnerOn({ 'a.check.mjs': good('a') }, ['--', 'nope']).code, 1);
});
