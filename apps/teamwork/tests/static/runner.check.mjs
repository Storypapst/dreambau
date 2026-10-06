// The check runner (tests/run.mjs), proved through its public behaviour: the command line, the lines it prints,
// its exit code and the report it writes. Every run below uses a throw-away folder of tiny check files that
// the runner finds through TEAMWORK_TESTS_DIR; nothing here touches the real checks.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ROOT, TESTS } from '../lib/paths.mjs';

const RUNNER = path.join(TESTS, 'run.mjs');
const PASSING = "console.log('  PASS  C99 a passing check');\n";
const FAILING = "console.log('  FAIL  C98 a failing check');\nprocess.exitCode = 1;\n";

const made = [];
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-runner-'));
  made.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  return dir;
}

// Starts the runner on a folder and returns what a person would see: exit code and the lines.
function runner(dir, args = [], env = {}) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, TEAMWORK_TESTS_DIR: dir, ...env },
    timeout: 120000,
  });
  const text = `${result.stdout || ''}${result.stderr || ''}`;
  return { code: result.status, pid: result.pid, text, lines: text.split('\n') };
}

const verdicts = (r) => r.lines.filter((l) => /^(PASS|FAIL)\s/.test(l));

try {
  await run(async () => {
    // 1. nothing to run is an error, never a green run
    const empty = runner(folder({}));
    check('runner: an empty tests folder exits non-zero', empty.code !== 0, `exit code ${empty.code}`);
    check('runner: an empty tests folder says that no check was found', /no check/i.test(empty.text), empty.text.trim().slice(0, 100));

    // 2. one passing check
    const pass = runner(folder({ 'a.check.mjs': PASSING }));
    same('runner: a passing check exits 0', pass.code, 0);
    check('runner: a passing check prints one PASS line that names it', verdicts(pass).length === 1 && /^PASS\s+a\b/.test(verdicts(pass)[0]), verdicts(pass).join(' | '));
    check('runner: the total says 0 failed', /1 check, 1 passed, 0 failed/.test(pass.text), pass.lines.filter((l) => /passed/.test(l)).join(' | '));

    // 3. one failing check
    const fail = runner(folder({ 'a.check.mjs': FAILING }));
    check('runner: a failing check exits non-zero', fail.code !== 0, `exit code ${fail.code}`);
    check('runner: a failing check prints one FAIL line that names it', verdicts(fail).length === 1 && /^FAIL\s+a\b/.test(verdicts(fail)[0]), verdicts(fail).join(' | '));
    check('runner: a failing check shows its own output', /C98 a failing check/.test(fail.text));
    check('runner: the total counts the failure', /1 check, 0 passed, 1 failed/.test(fail.text));

    // 4. a mix, in a fixed order
    const mix = runner(folder({ 'b.check.mjs': FAILING, 'a.check.mjs': PASSING, 'sub/c.check.mjs': PASSING }));
    same('runner: one verdict line per check, in path order', verdicts(mix).map((l) => l.split(/\s+/).slice(0, 2).join(' ')), ['PASS a', 'FAIL b', 'PASS sub/c']);
    check('runner: the total of a mixed run', /3 checks, 2 passed, 1 failed/.test(mix.text));
    check('runner: files that do not end in .check.mjs are ignored', verdicts(runner(folder({ 'a.check.mjs': PASSING, 'x.test.mjs': FAILING, 'y.mjs': FAILING }))).length === 1);

    // 5. every check has its own process
    const pids = runner(folder({
      'a.check.mjs': "console.log(`  PASS  C99 pid=${process.pid}`);\n",
      'b.check.mjs': "console.log(`  PASS  C99 pid=${process.pid}`);\n",
    }), ['--verbose']);
    const seen = [...pids.text.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
    check('runner: each check runs in its own Node process', seen.length === 2 && new Set([...seen, pids.pid]).size === 3, `pids ${seen.join(', ')}, runner ${pids.pid}`);

    // 6. a check can only pass by saying so
    const silent = runner(folder({ 'a.check.mjs': 'const nothing = 1;\n' }));
    check('runner: a check that prints no PASS line fails', silent.code !== 0 && verdicts(silent)[0]?.startsWith('FAIL') === true, `exit code ${silent.code}`);
    const liar = runner(folder({ 'a.check.mjs': "console.log('  PASS  C99 fine');\nconsole.log('  FAIL  C99 not fine');\n" }));
    check('runner: a check that prints a FAIL line fails even when its exit code is 0', liar.code !== 0 && verdicts(liar)[0]?.startsWith('FAIL') === true, `exit code ${liar.code}`);
    const hang = runner(folder({ 'a.check.mjs': 'setInterval(() => {}, 1000);\n' }), [], { TEAMWORK_CHECK_TIMEOUT_MS: '1500' });
    check('runner: a check that never ends is stopped and fails', hang.code !== 0 && /timed out/i.test(hang.text), `exit code ${hang.code}`);

    // 7. filters: a name prefix selects the row, a path selects a folder; nothing selected is an error
    const rows = folder({ 'c01-a.check.mjs': PASSING, 'c02-b.check.mjs': PASSING, 'sub/c02-c.check.mjs': PASSING, 'other/d.check.mjs': PASSING });
    same('runner: a name prefix runs exactly the checks that start with it', verdicts(runner(rows, ['c01-'])).map((l) => l.split(/\s+/)[1]), ['c01-a']);
    same('runner: a name prefix finds a check in a sub-folder as well', verdicts(runner(rows, ['c02-'])).map((l) => l.split(/\s+/)[1]), ['c02-b', 'sub/c02-c']);
    same('runner: a path runs the folder (with or without the leading tests/)',
      [verdicts(runner(rows, ['tests/sub'])).map((l) => l.split(/\s+/)[1]), verdicts(runner(rows, ['sub/'])).map((l) => l.split(/\s+/)[1])], [['sub/c02-c'], ['sub/c02-c']]);
    check('runner: tests/ stands for every check', verdicts(runner(rows, ['tests/'])).length === 4);
    const none = runner(rows, ['no-such-check']);
    check('runner: a filter that matches nothing exits non-zero', none.code !== 0 && verdicts(none).length === 0, `exit code ${none.code}`);
    check('runner: a filtered run shows what the check itself printed', /C99 a passing check/.test(runner(rows, ['c01-']).text));

    // 8. no way to skip a check
    const skipped = runner(folder({ 'a.check.mjs': PASSING }), ['--skip', 'a']);
    check('runner: refuses a flag it does not know', skipped.code !== 0 && verdicts(skipped).length === 0, `exit code ${skipped.code}`);

    const badFactor = runner(folder({ 'a.check.mjs': PASSING }), [], { TEAMWORK_TIMING_FACTOR: 'fast' });
    check('runner: refuses a timing factor that is not a positive number', badFactor.code !== 0 && verdicts(badFactor).length === 0 && /TEAMWORK_TIMING_FACTOR/.test(badFactor.text), `exit code ${badFactor.code}`);

    // 9. evidence: the report and the variable
    const evidenceDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-evidence-')), 'verification');
    made.push(path.dirname(evidenceDir));
    const probe = "console.log(`  PASS  C99 evidence=${process.env.TEAMWORK_EVIDENCE_DIR || 'unset'}`);\n";
    const evidence = runner(folder({ 'a.check.mjs': probe, 'b.check.mjs': "console.log('  PASS  C5, C6 two rows');\nconsole.log('  PASS  C28 and a third');\n", 'c.check.mjs': "console.log('  PASS  no row at all');\n" }),
      ['--evidence', '--verbose'], { TEAMWORK_EVIDENCE_DIR: evidenceDir, TEAMWORK_TIMING_FACTOR: '2' });
    same('runner: --evidence exits 0 when every check passes', evidence.code, 0);
    check('runner: --evidence sets TEAMWORK_EVIDENCE_DIR for every check', evidence.text.includes(`evidence=${evidenceDir}`), evidence.text.match(/evidence=\S+/)?.[0] || 'not seen');
    const reportFile = path.join(evidenceDir, 'report.json');
    check('runner: --evidence writes report.json', fs.existsSync(reportFile));
    const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {};
    same('runner: the report has environment, checks and screenshots', Object.keys(report), ['environment', 'checks', 'screenshots']);
    same('runner: the report lists one entry per check with name, rows, ok and ms (rows read from the start of its lines)',
      (report.checks || []).map((c) => [c.name, c.rows, c.ok, typeof c.ms]), [['a', ['C99'], true, 'number'], ['b', ['C5', 'C6', 'C28'], true, 'number'], ['c', [], true, 'number']]);
    same('runner: the report starts with no screenshot', report.screenshots, []);
    const failedEvidenceDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-evidence-')), 'verification');
    made.push(path.dirname(failedEvidenceDir));
    const failedEvidence = runner(folder({ 'a.check.mjs': "console.log('  PASS  C1 fine');\nconsole.log('  FAIL  C2 broken');\nprocess.exitCode = 1;\n" }), ['--evidence'], { TEAMWORK_EVIDENCE_DIR: failedEvidenceDir });
    const failedReport = fs.existsSync(path.join(failedEvidenceDir, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(failedEvidenceDir, 'report.json'), 'utf8')) : {};
    check('runner: --evidence exits non-zero when a check failed', failedEvidence.code !== 0, `exit code ${failedEvidence.code}`);
    same('runner: a failed check is in the report with ok false and the rows of all its lines', (failedReport.checks || []).map((c) => [c.name, c.rows, c.ok]), [['a', ['C1', 'C2'], false]]);
    fs.writeFileSync(path.join(evidenceDir, 'b.png'), '');
    fs.writeFileSync(path.join(evidenceDir, 'a.png'), '');
    fs.writeFileSync(path.join(evidenceDir, 'notes.txt'), '');
    runner(folder({ 'a.check.mjs': PASSING }), ['--evidence'], { TEAMWORK_EVIDENCE_DIR: evidenceDir });
    same('runner: the report lists the PNG files of the evidence folder by name', JSON.parse(fs.readFileSync(reportFile, 'utf8')).screenshots, ['a.png', 'b.png']);
    const env = report.environment || {};
    check('runner: the report names Node, Playwright, Chromium, the platform and the timing factor',
      env.node === process.version && /^1\.56\.1$/.test(env.playwright) && /^\d+\.\d+\.\d+\.\d+$/.test(env.chromium) && env.platform === `${process.platform}-${process.arch}` && env.timingFactor === 2,
      JSON.stringify(env));

    // 10. a plain run never writes evidence, even when the variable is set around it
    const plainDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-plain-')), 'verification');
    made.push(path.dirname(plainDir));
    const plain = runner(folder({ 'a.check.mjs': probe }), ['--verbose'], { TEAMWORK_EVIDENCE_DIR: plainDir });
    check('runner: without --evidence the checks see no TEAMWORK_EVIDENCE_DIR', plain.text.includes('evidence=unset'), plain.text.match(/evidence=\S+/)?.[0] || 'not seen');
    check('runner: without --evidence no report is written', !fs.existsSync(path.join(plainDir, 'report.json')));
  });
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
