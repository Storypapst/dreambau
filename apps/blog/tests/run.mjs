// The check runner: `npm run check` runs every check; `npm run check -- <filter> ...` runs the matching ones.
//
// - It finds every *.check.mjs under tests/ and runs each in its own Node process, one after the other.
// - It prints one PASS or FAIL line per check and a total. The exit code is 0 only when every check passed and at
//   least one check was found. There is no option that leaves a check out.
// - A filter is a name prefix (`static/package`) or a path prefix (`tests/static`). Filters add up.
// - A run with a filter or --verbose shows everything the checks printed; an unfiltered run shows only the problems.
//
// Check files end in .check.mjs, never .test.* or .spec.*: the root test runner of the monorepo picks up those.
// Environment: BLOG_TESTS_DIR (look for checks there instead of in tests/; the runner's own check uses it) and
// BLOG_CHECK_TIMEOUT_MS (the time limit of one check, default 300000).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/paths.mjs';

const ENDING = '.check.mjs';
const USAGE = 'Usage: npm run check -- [--verbose] [filter ...]\n  A filter is a name prefix (static/package) or a path prefix (tests/static).';
const GRACE_MS = 5000; // a check that is asked to stop gets this long to clean up (stop its container) before it is killed
const seconds = (ms) => (ms / 1000).toFixed(1);
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

function parseArguments(argv) {
  const options = { verbose: false, filters: [], unknown: [] };
  let optionsEnded = false;
  for (const arg of argv) {
    if (optionsEnded || !arg.startsWith('-')) options.filters.push(arg);
    else if (arg === '--') optionsEnded = true;
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

function selected(item, filters) {
  if (filters.length === 0) return true;
  return filters.some((raw) => {
    const filter = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^tests(\/|$)/, '').replace(/\.check\.mjs$/, '');
    return item.name.startsWith(filter) || path.posix.basename(item.name).startsWith(filter);
  });
}

let current = null;

function runCheck(item, limit) {
  return new Promise((resolve) => {
    const started = Date.now();
    const result = { output: '', code: null, signal: null, timedOut: false, startError: null, ms: 0 };
    const child = spawn(process.execPath, [item.file], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  return { ok: reasons.length === 0, reasons };
}

function show(output, onlyProblems) {
  const lines = output.replace(/\s+$/, '').split('\n').filter((line) => line !== '');
  for (const line of onlyProblems ? lines.filter((l) => !/^\s*PASS\s/.test(l)) : lines) console.log(`  ${line}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.unknown.length > 0) {
    console.error(`Unknown option: ${options.unknown.join(' ')}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  const limit = Number(process.env.BLOG_CHECK_TIMEOUT_MS || 300000);
  const base = path.resolve(process.env.BLOG_TESTS_DIR || path.join(ROOT, 'tests'));
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

  const started = Date.now();
  let failed = 0;
  for (const item of chosen) {
    const result = await runCheck(item, limit);
    const verdict = judge(result, limit);
    if (!verdict.ok) failed += 1;
    console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${item.name}  (${seconds(result.ms)} s)${verdict.ok ? '' : `  ${verdict.reasons.join('; ')}`}`);
    if (options.verbose || options.filters.length > 0) show(result.output, false);
    else if (!verdict.ok) show(result.output, true);
  }
  const count = chosen.length;
  console.log(`${count} ${count === 1 ? 'check' : 'checks'}, ${count - failed} passed, ${failed} failed (${seconds(Date.now() - started)} s)`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// Ctrl-C and a termination signal pass on to the running check, which cleans up (stops its container).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (current) current.kill(signal);
    process.exitCode = 130;
  });
}

main();
