// The check runner: `npm run check` runs every check, `npm run verify` is the same run with --evidence.
//
//   node tests/run.mjs [--evidence] [--verbose] [--] [filter ...]
//
// - It finds every *.check.mjs under tests/ and runs each in its own Node process, one after the other.
// - It prints one PASS or FAIL line per check and a total. The exit code is 0 only when every check passed and at
//   least one check was found. There is no option that leaves a check out.
// - A filter is a name prefix (`c28-` runs c28-structure) or a path prefix (`tests/e2e`, `e2e/`). Filters add up.
//   A filtered run and --verbose show everything a check printed; an unfiltered run shows only the problems.
// - --evidence also writes verification/report.json and sets TEAMWORK_EVIDENCE_DIR for every check.
//
// Environment: TEAMWORK_TESTS_DIR (look for checks there instead of in tests/; the runner's own check uses it),
// TEAMWORK_CHECK_TIMEOUT_MS (the time limit of one check, default 300000), TEAMWORK_EVIDENCE_DIR (where --evidence
// writes, default verification/) and TEAMWORK_TIMING_FACTOR (see lib/timing.mjs).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/paths.mjs';
import { timingFactor } from './lib/timing.mjs';

const ENDING = '.check.mjs';
const USAGE = 'Usage: npm run check -- [--verbose] [filter ...]\n'
  + '       npm run verify -- [--verbose] [filter ...]\n'
  + '  A filter is a name prefix (c28-) or a path prefix (tests/e2e).';
const GRACE_MS = 5000; // a check that is asked to stop gets this long to clean up (stop its container) before it is killed

const seconds = (ms) => (ms / 1000).toFixed(1);
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

function parseArguments(argv) {
  const options = { evidence: false, verbose: false, filters: [], unknown: [] };
  let optionsEnded = false;
  for (const arg of argv) {
    if (optionsEnded || !arg.startsWith('-')) options.filters.push(arg);
    else if (arg === '--') optionsEnded = true;
    else if (arg === '--evidence') options.evidence = true;
    else if (arg === '--verbose') options.verbose = true;
    else options.unknown.push(arg);
  }
  return options;
}

// Every check file below the folder, sorted by path (plain string order, so the order is the same everywhere).
function findChecks(base) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(ENDING)) {
        const relative = path.relative(base, full).split(path.sep).join('/');
        found.push({ file: full, name: relative.slice(0, -ENDING.length) });
      }
    }
  };
  walk(base);
  return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// `tests/e2e`, `e2e/`, `c28-` and `tests/e2e/c28-structure.check.mjs` are all filters; `tests/` stands for every check.
function normalise(filter) {
  return filter.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^tests(\/|$)/, '').replace(/\.check\.mjs$/, '');
}

function selected(item, filters) {
  if (filters.length === 0) return true;
  const baseName = path.posix.basename(item.name);
  return filters.some((raw) => {
    const filter = normalise(raw);
    return item.name.startsWith(filter) || baseName.startsWith(filter);
  });
}

let current = null;     // the check that is running now
let interrupted = null; // the signal that asked the runner to stop

function runCheck(item, env, limit) {
  return new Promise((resolve) => {
    const started = Date.now();
    const result = { output: '', code: null, signal: null, timedOut: false, startError: null, ms: 0 };
    const child = spawn(process.execPath, [item.file], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    current = child;
    child.stdout.on('data', (chunk) => { result.output += chunk; });
    child.stderr.on('data', (chunk) => { result.output += chunk; });
    let killer = null;
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill('SIGTERM');
      killer = setTimeout(() => child.kill('SIGKILL'), GRACE_MS);
    }, limit);
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(killer);
      current = null;
      result.ms = Date.now() - started;
      resolve(result);
    };
    child.on('error', (error) => { result.startError = error.message; finish(); });
    child.on('close', (code, signal) => { result.code = code; result.signal = signal; finish(); });
  });
}

// The row ids a line starts with: `C5, C6 two rows` covers C5 and C6; `C28 and more` covers C28.
function rowsOf(text) {
  const rows = [];
  for (const token of text.split(/[\s,/+&]+/)) {
    if (/^C\d+$/.test(token)) rows.push(token);
    else if (token !== 'and') break;
  }
  return rows;
}

// A check passes only when it exits 0, prints no FAIL line and prints at least one PASS line.
function judge(result, limit) {
  const lines = result.output.split('\n');
  const passes = lines.filter((line) => /^\s*PASS\s/.test(line));
  const fails = lines.filter((line) => /^\s*FAIL\s/.test(line));
  const reasons = [];
  if (result.timedOut) reasons.push(`timed out after ${seconds(limit)} s`);
  else if (result.startError) reasons.push(`could not start: ${oneLine(result.startError)}`);
  else if (result.code !== 0) reasons.push(result.signal ? `killed by ${result.signal}` : `exit code ${result.code}`);
  if (fails.length > 0) reasons.push(`${fails.length} failed assertion${fails.length === 1 ? '' : 's'}`);
  if (passes.length === 0 && fails.length === 0) reasons.push('printed no PASS line');
  const rows = [];
  for (const line of [...passes, ...fails]) {
    for (const row of rowsOf(line.replace(/^\s*(PASS|FAIL)\s+/, ''))) if (!rows.includes(row)) rows.push(row);
  }
  return { ok: reasons.length === 0, reasons, rows };
}

function show(output, onlyProblems) {
  const lines = output.replace(/\s+$/, '').split('\n').filter((line) => line !== '');
  for (const line of onlyProblems ? lines.filter((l) => !/^\s*PASS\s/.test(l)) : lines) console.log(`  ${line}`);
}

// The numbers the report names, read from the machine that ran the checks.
async function describeEnvironment() {
  const environment = { node: process.version, playwright: null, chromium: null, platform: `${process.platform}-${process.arch}`, timingFactor: timingFactor() };
  try {
    environment.playwright = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try { environment.chromium = browser.version(); } finally { await browser.close(); }
  } catch (error) {
    console.log(`Could not read the Playwright or Chromium number: ${oneLine(error.message).slice(0, 200)}`);
  }
  return environment;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.unknown.length > 0) {
    console.error(`Unknown option: ${options.unknown.join(' ')}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  timingFactor(); // refuses a value that is not a positive number before anything runs
  const limit = Number(process.env.TEAMWORK_CHECK_TIMEOUT_MS || 300000);
  const base = path.resolve(process.env.TEAMWORK_TESTS_DIR || path.join(ROOT, 'tests'));

  const all = findChecks(base);
  if (all.length === 0) {
    console.error(`No check file (*${ENDING}) found under ${base}`);
    process.exitCode = 1;
    return;
  }
  const chosen = all.filter((item) => selected(item, options.filters));
  if (chosen.length === 0) {
    console.error(`No check matches ${options.filters.map((f) => `"${f}"`).join(', ')}. The checks are: ${all.map((item) => item.name).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const evidenceDir = options.evidence ? path.resolve(process.env.TEAMWORK_EVIDENCE_DIR || path.join(ROOT, 'verification')) : null;
  if (evidenceDir) fs.mkdirSync(evidenceDir, { recursive: true });
  const env = { ...process.env };
  if (evidenceDir) env.TEAMWORK_EVIDENCE_DIR = evidenceDir; else delete env.TEAMWORK_EVIDENCE_DIR;

  const started = Date.now();
  const entries = [];
  for (const item of chosen) {
    if (interrupted) break;
    const result = await runCheck(item, env, limit);
    const verdict = judge(result, limit);
    entries.push({ name: item.name, rows: verdict.rows, ok: verdict.ok, ms: result.ms });
    const why = verdict.ok ? '' : `  ${verdict.reasons.join('; ')}`;
    console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${item.name}  (${seconds(result.ms)} s)${why}`);
    if (options.verbose || options.filters.length > 0) show(result.output, false);
    else if (!verdict.ok) show(result.output, true);
  }

  const failed = entries.filter((entry) => !entry.ok).length;
  const count = entries.length;
  console.log(`${count} ${count === 1 ? 'check' : 'checks'}, ${count - failed} passed, ${failed} failed (${seconds(Date.now() - started)} s)`);

  if (evidenceDir) {
    const screenshots = fs.readdirSync(evidenceDir).filter((name) => name.toLowerCase().endsWith('.png')).sort();
    const report = { environment: await describeEnvironment(), checks: entries, screenshots };
    fs.writeFileSync(path.join(evidenceDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (interrupted) {
    console.error(`Stopped by ${interrupted} after ${count} of ${chosen.length} checks.`);
    process.exitCode = 130;
    return;
  }
  process.exitCode = failed === 0 ? 0 : 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = signal;
    if (current) current.kill(signal);
  });
}

main().catch((error) => {
  console.error(`The runner itself failed: ${oneLine((error && error.message) || error)}`);
  process.exitCode = 1;
});
