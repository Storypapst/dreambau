// `npm run serve` (tests/serve.mjs), run the way a person runs it: it prints the address of /teamwork/, the address
// answers 200 with a policy that has connect-src 'self', and an interrupt (Ctrl-C) removes the container. With
// --list <file> it serves the programs of a list kept outside the repository, all marked reachable: a copy of the
// example list with one more program shows 22 Kacheln. A list that cannot be read is refused before anything starts.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST, ROOT, TESTS } from '../lib/paths.mjs';
import { launchBrowser } from '../lib/browser.mjs';

const SERVE = path.join(TESTS, 'serve.mjs');
const made = [];
const children = [];

const containers = (name) => spawnSync('docker', ['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts `node tests/serve.mjs ...args` and reads its first lines.
function serve(args = []) {
  const child = spawn(process.execPath, [SERVE, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  const run_ = { child, out: '', err: '' };
  child.stdout.on('data', (chunk) => { run_.out += chunk; });
  child.stderr.on('data', (chunk) => { run_.err += chunk; });
  run_.closed = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
    setTimeout(() => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); resolve({ code: null, signal: 'still running after 120 s' }); } }, 120000).unref();
  });
  run_.ready = async () => {
    for (let waited = 0; waited < 90000; waited += 100) {
      const address = /^http:\/\/127\.0\.0\.1:\d+\/teamwork\/$/m.exec(run_.out);
      const container = /teamwork-test-\S+/.exec(run_.out);
      if (address && container) return { address: address[0], container: container[0].replace(/[.,]$/, '') };
      if (child.exitCode !== null || child.signalCode !== null) return null;
      await sleep(100);
    }
    return null;
  };
  return run_;
}

try {
  await run(async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-serve-'));
    made.push(temporary);

    // ---- the plain start ----
    const plain = serve();
    const ready = await plain.ready();
    check('serve: prints the address http://127.0.0.1:<port>/teamwork/ and the name of its container', ready !== null, ready === null ? plain.out + plain.err : '');
    const response = await fetch(ready.address);
    check('serve: the printed address answers 200', response.status === 200, response.status === 200 ? '' : `${response.status}`);
    const headResponse = await fetch(ready.address, { method: 'HEAD' });
    check("serve: the header content-security-policy of the page contains connect-src 'self'", (headResponse.headers.get('content-security-policy') || '').includes("connect-src 'self'"));
    check('serve: the container is running', containers(ready.container).length === 1, containers(ready.container).length === 1 ? '' : `${ready.container} not found`);
    plain.child.kill('SIGINT');
    const ended = await plain.closed;
    same('serve: after Ctrl-C (SIGINT) the container is gone and the process has ended by that signal', [containers(ready.container), ended.signal], [[], 'SIGINT']);

    // ---- a list of its own ----
    const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
    list.programs.push({ id: 'extra', name: 'Extra', purpose: 'Eine zusätzliche Probe', url: 'https://extra.example.test/', zone: 'west', probe: 'https://extra.example.test/health' });
    const ownFile = path.join(temporary, 'own-list.json');
    fs.writeFileSync(ownFile, JSON.stringify(list, null, 2));
    const own = serve(['--list', ownFile]);
    const ownReady = await own.ready();
    check('serve: with --list <file> it prints the address as well', ownReady !== null, ownReady === null ? own.out + own.err : '');
    const base = new URL(ownReady.address).origin;
    const catalogue = await (await fetch(`${base}/teamwork/data/programs.json`)).json();
    const status = await (await fetch(`${base}/teamwork/data/status.json`)).json();
    same('serve --list: the public catalogue holds the 22 programs of the file, without the probe of any of them',
      [catalogue.programs.length, JSON.stringify(catalogue).includes('probe'), catalogue.programs.at(-1).id], [22, false, 'extra']);
    same('serve --list: every program of the file is marked reachable', status.reachable, list.programs.map((program) => program.id));
    const browser = await launchBrowser();
    try {
      const page = await browser.newPage();
      await page.goto(ownReady.address);
      await page.locator('main a[href]').first().waitFor({ timeout: 15000 }).catch(() => {});
      same('serve --list: the page shows 22 Kacheln (every Programm of the file is a link Kachel)', await page.locator('ul > li > a[href^="https://"]').count(), 22);
    } finally {
      await browser.close();
    }
    own.child.kill('SIGINT');
    await own.closed;
    same('serve --list: after Ctrl-C its container is gone as well', containers(ownReady.container), []);

    // ---- a list that cannot be read, and options it does not know ----
    const before = spawnSync('docker', ['ps', '-a', '--filter', 'name=teamwork-test-', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort();
    const notJson = path.join(temporary, 'broken.json');
    fs.writeFileSync(notJson, '{ this is not json');
    const wrongShape = path.join(temporary, 'shape.json');
    fs.writeFileSync(wrongShape, '{"format": 1}');
    const cases = [
      ['a file that does not exist', ['--list', path.join(temporary, 'missing.json')], 'missing.json'],
      ['a file that is not JSON', ['--list', notJson], 'broken.json'],
      ['a file without zones and programs', ['--list', wrongShape], 'shape.json'],
      ['--list without a file', ['--list'], '--list'],
      ['an option it does not know', ['--nope'], '--nope'],
    ];
    for (const [what, args, mention] of cases) {
      const refused = serve(args);
      const { code } = await refused.closed;
      const refusedProperly = code === 2 && refused.err.includes(mention) && !/http:\/\/127/.test(refused.out);
      check(`serve: refuses ${what} with exit code 2 and a message that names it`, refusedProperly, refusedProperly ? '' : `exit ${code}: ${refused.err.trim().slice(0, 120)}`);
    }
    same('serve: none of the refused starts left a container', spawnSync('docker', ['ps', '-a', '--filter', 'name=teamwork-test-', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort(), before);
  });
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGINT');
  await sleep(500);
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
