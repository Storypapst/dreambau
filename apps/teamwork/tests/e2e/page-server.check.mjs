// The page server (lib/page-server.mjs), proved from the outside: Docker's own view of the container it starts,
// the answers of the real nginx, the files it leaves on the host, and what remains after it stops or its process
// is interrupted. The page server runs here with a tiny stand-in page, so that this check does not depend on the real page.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { publicCatalogue, publicJson, publicStatus } from '../lib/catalogue.mjs';
import { EXAMPLE_LIST, TESTS } from '../lib/paths.mjs';
import { startPageServer } from '../lib/page-server.mjs';

const IMAGE = process.env.TEAMWORK_NGINX_IMAGE || 'nginx:1.27-alpine';
const PAGE_SERVER = path.join(TESTS, 'lib', 'page-server.mjs');
const made = [];
const started = [];

const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 60000 });
const containers = (name) => docker('ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}').stdout.split('\n').filter(Boolean);
const inspect = (name, format) => JSON.parse(docker('inspect', '--format', format, name).stdout);
const modeOf = (file) => fs.statSync(file).mode & 0o777;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(body, ms = 3000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await body(); if (last) return last; await sleep(100); }
  return last;
}

function entries(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      found.push({ full, directory: entry.isDirectory() });
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return found;
}

// Runs a child process that starts a page server, prints the container name and then does what `ending` says.
function child(ending) {
  const source = `import(${JSON.stringify(`file://${PAGE_SERVER}`)}).then(async (m) => { const s = await m.startPageServer({ site: ${JSON.stringify(stand.site)} }); console.log(s.name); ${ending} })`;
  const process_ = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  process_.stdout.on('data', (chunk) => { out += chunk; });
  process_.stderr.on('data', (chunk) => { err += chunk; });
  const closed = new Promise((resolve) => {
    process_.on('close', (code, signal) => resolve({ code, signal }));
    setTimeout(() => { if (process_.exitCode === null && process_.signalCode === null) { process_.kill('SIGKILL'); resolve({ code: null, signal: 'still running after 30 s' }); } }, 30000).unref();
  });
  const name = until(() => (/teamwork-test-\S+/.exec(out) || [])[0], 90000);
  return { process: process_, closed, name, err: () => err };
}

// the stand-in page of this check
const stand = { site: fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-stand-')) };
made.push(stand.site);
fs.writeFileSync(path.join(stand.site, 'index.html'), '<!doctype html><title>Stand-in</title><p>Stand-in page.</p>\n');
fs.writeFileSync(path.join(stand.site, 'teamwork.js'), 'export const stand = 1;\n');

try {
  await run(async () => {
    const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
    const server = await startPageServer({ site: stand.site });
    started.push(server);

    // ---- what Docker says about the container ----
    check('page server: the address is on 127.0.0.1 with a port, and /teamwork/ is under it', /^http:\/\/127\.0\.0\.1:\d+$/.test(server.origin) && server.url === `${server.origin}/teamwork/`, server.url);
    check('page server: the container name starts with teamwork-test- and the container is running', server.name.startsWith('teamwork-test-') && containers(server.name).length === 1 && inspect(server.name, '{{json .State.Running}}') === true, server.name);
    same('page server: the port is published on the loopback address only', inspect(server.name, '{{json .NetworkSettings.Ports}}')['8080/tcp'].map((binding) => binding.HostIp), ['127.0.0.1']);
    same('page server: the image is the one of TEAMWORK_NGINX_IMAGE, by default nginx:1.27-alpine', inspect(server.name, '{{json .Config.Image}}'), IMAGE);
    const command = inspect(server.name, '{{json .Config.Cmd}}');
    check('page server: nginx is started with -c and the config at /etc/dreambau-web/nginx.conf (as in spec 3.4)', command.join(' ').includes('-c /etc/dreambau-web/nginx.conf'), command.join(' '));
    const mounts = inspect(server.name, '{{json .Mounts}}');
    same('page server: four directories are mounted, read-only: /site, /bildungshaus, /teamwork and the config directory',
      mounts.map((mount) => [mount.Type, mount.Destination, mount.RW]).sort(), [['bind', '/bildungshaus', false], ['bind', '/etc/dreambau-web', false], ['bind', '/site', false], ['bind', '/teamwork', false]]);
    check('page server: every mount is a directory (never a single file, spec O2)', mounts.every((mount) => fs.statSync(mount.Source).isDirectory()));

    // ---- what the real nginx answers ----
    const ask = (route, init) => fetch(`${server.origin}${route}`, { redirect: 'manual', ...init });
    const health = await ask('/health');
    check('page server: /health answers 200 ok once start() has returned', health.status === 200 && (await health.text()) === 'ok', `${health.status}`);
    const page = await ask('/teamwork/');
    const headers = page.headers;
    check('page server: /teamwork/ is the page of the site directory', page.status === 200 && (await page.text()).includes('Stand-in page.'), `${page.status}`);
    check("page server: /teamwork/ carries a policy that has connect-src 'self', and the robots header", (headers.get('content-security-policy') || '').includes("connect-src 'self'") && headers.get('x-robots-tag') === 'noindex, nofollow', headers.get('content-security-policy'));
    check('page server: the start page answers without the robots header', (await ask('/')).headers.get('x-robots-tag') === null);
    check('page server: the script is served as application/javascript', ((await ask('/teamwork/teamwork.js')).headers.get('content-type') || '').startsWith('application/javascript'));
    const catalogue = await ask('/teamwork/data/programs.json');
    check('page server: programs.json is the public catalogue of the example list, byte for byte, as application/json',
      (await catalogue.text()) === publicJson(publicCatalogue(list)) && (catalogue.headers.get('content-type') || '').startsWith('application/json'));
    const status = await (await ask('/teamwork/data/status.json')).text();
    same('page server: status.json names every program, in the order of the list', JSON.parse(status).reachable, list.programs.map((program) => program.id));

    // ---- the files on the host ----
    const tree = entries(server.tree.root);
    check('page server: directories are 0755 and files 0644 (spec O3)', tree.length > 10 && tree.every((entry) => modeOf(entry.full) === (entry.directory ? 0o755 : 0o644)) && modeOf(server.tree.root) === 0o755,
      tree.filter((entry) => modeOf(entry.full) !== (entry.directory ? 0o755 : 0o644)).map((entry) => `${path.relative(server.tree.root, entry.full)} ${modeOf(entry.full).toString(8)}`).join(', '));

    // ---- replacing a served file ----
    const statusFile = path.join(server.tree.teamwork, 'data', 'status.json');
    const before = { inode: fs.statSync(statusFile).ino, names: fs.readdirSync(path.dirname(statusFile)).sort() };
    const replacement = publicJson(publicStatus(['aurora'], '2026-10-05T14:00:07Z'));
    server.replaceFile('data/status.json', replacement);
    check('page server: replaceFile replaces by rename (a new file takes the name, so the inode changes), with mode 0644', fs.statSync(statusFile).ino !== before.inode && modeOf(statusFile) === 0o644);
    same('page server: replaceFile leaves no temporary file behind', fs.readdirSync(path.dirname(statusFile)).sort(), before.names);
    check('page server: the replaced file shows through the mount (polled for up to 3 s, as on Docker Desktop)', await until(async () => (await (await ask('/teamwork/data/status.json')).text()) === replacement) === true);
    server.replaceFile('later/new.json', '{}\n');
    check('page server: replaceFile makes missing directories 0755 and its files 0644', modeOf(path.join(server.tree.teamwork, 'later')) === 0o755 && modeOf(path.join(server.tree.teamwork, 'later', 'new.json')) === 0o644);
    let refused = '';
    try { server.replaceFile('../escape.txt', 'x'); } catch (error) { refused = error.message; }
    check('page server: replaceFile refuses a path that leaves the teamwork directory', refused !== '' && !fs.existsSync(path.join(server.tree.root, 'escape.txt')), refused);

    // ---- stopping ----
    const name = server.name;
    const root = server.tree.root;
    await server.stop();
    same('page server: stop() removes the container', containers(name), []);
    check('page server: stop() removes the test tree', !fs.existsSync(root));
    let again = '';
    try { await server.stop(); } catch (error) { again = error.message; }
    check('page server: stop() can be called twice', again === '', again);

    // ---- a list of its own and a status of its own ----
    const own = { ...list, programs: [...list.programs, { id: 'extra', name: 'Extra', purpose: 'Eine Probe', url: 'https://extra.example.test/', zone: 'nord' }] };
    const second = await startPageServer({ site: stand.site, list: own, reachable: ['aurora', 'extra'] });
    started.push(second);
    const secondCatalogue = await (await fetch(`${second.origin}/teamwork/data/programs.json`)).json();
    const secondStatus = await (await fetch(`${second.origin}/teamwork/data/status.json`)).json();
    same('page server: a list of its own is served as its public catalogue, with the status named in the options', [secondCatalogue.programs.length, secondStatus.reachable], [22, ['aurora', 'extra']]);
    check('page server: two servers started one after the other have different names and ports', second.name !== name && second.origin !== server.origin);
    await second.stop();

    // ---- the image can be replaced, and a failed start leaves nothing behind ----
    const wrongImage = 'registry.invalid/teamwork/no-such-image:0';
    const leftBefore = docker('ps', '-a', '--filter', `name=teamwork-test-${process.pid}-`, '--format', '{{.Names}}').stdout.split('\n').filter(Boolean);
    let failure = '';
    const savedImage = process.env.TEAMWORK_NGINX_IMAGE;
    process.env.TEAMWORK_NGINX_IMAGE = wrongImage;
    try { await startPageServer({ site: stand.site }); } catch (error) { failure = error.message; } finally { if (savedImage === undefined) delete process.env.TEAMWORK_NGINX_IMAGE; else process.env.TEAMWORK_NGINX_IMAGE = savedImage; }
    check('page server: TEAMWORK_NGINX_IMAGE decides the image (a start with an image that does not exist fails and names it)', failure.includes(wrongImage), failure.slice(0, 160));
    same('page server: that failed start left no container behind', docker('ps', '-a', '--filter', `name=teamwork-test-${process.pid}-`, '--format', '{{.Names}}').stdout.split('\n').filter(Boolean), leftBefore);

    // ---- a container of a process that is gone is removed by the next start; one of a live process is not ----
    const dead = spawnSync(process.execPath, ['-e', '']).pid;
    const staleName = `teamwork-test-stale-${dead}`;
    const liveName = `teamwork-test-live-${process.pid}`;
    docker('run', '-d', '--name', staleName, '--label', `dreambau.teamwork.test.owner=${dead}`, IMAGE, 'sleep', '120');
    docker('run', '-d', '--name', liveName, '--label', `dreambau.teamwork.test.owner=${process.pid}`, IMAGE, 'sleep', '120');
    const third = await startPageServer({ site: stand.site });
    started.push(third);
    same('page server: the next start removes the container of a process that no longer exists, and keeps the container of a live one', [containers(staleName), containers(liveName)], [[], [liveName]]);
    docker('rm', '-f', liveName);
    await third.stop();

    // ---- exit and interrupt: the container goes with the process ----
    const normal = child('');
    const normalName = await normal.name;
    await normal.closed;
    same('page server: a process that ends without calling stop() leaves no container (exit)', containers(normalName), []);
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const interrupted = child('setInterval(() => {}, 1000);');
      const interruptedName = await interrupted.name;
      check(`page server: the container of a running process exists before ${signal}`, containers(interruptedName).length === 1, interruptedName);
      interrupted.process.kill(signal);
      const { signal: endedBy } = await interrupted.closed;
      same(`page server: ${signal} removes the container, and the process still ends by that signal`, [containers(interruptedName), endedBy], [[], signal]);
    }
  });
} finally {
  for (const server of started) await server.stop().catch(() => {});
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
