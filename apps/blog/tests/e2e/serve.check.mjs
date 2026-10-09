// BD-11 and the serve command of the ticket (with the rules of 7.4 since slice S4): `node tests/serve.mjs` (what `npm run serve` runs) prints
// http://127.0.0.1:<port>/blog/, the list and the fixture post answer 200 there, the container is the pinned image with
// the demo output mounted read-only as a directory, and after Ctrl-C (SIGINT) or SIGTERM no container named
// blog-test-* is left (`docker ps --filter name=blog-test-` is empty, also with -a). Needs Docker.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';
import { DEFAULT_IMAGE } from '../lib/image.mjs';
import { ask, modesInContainer } from '../lib/nginx.mjs';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const containers = (all) => docker('ps', ...(all ? ['-a'] : []), '--filter', 'name=blog-test-', '--format', '{{.Names}}').split('\n').filter(Boolean);
const POST = '2026/ein-film-der-in-eine-mail-passt/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const status = async (url) => (await fetch(url, { redirect: 'manual' })).status;

// Starts the serve command and resolves with the process and the address it printed.
function startServe() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`serve printed no address within 90 s: ${output.slice(-300)}`)); }, 90000);
    const onData = (chunk) => {
      output += chunk;
      const match = /^(http:\/\/127\.0\.0\.1:(\d+)\/blog\/)$/m.exec(output);
      if (match) { clearTimeout(timer); resolve({ child, url: match[1], output: () => output }); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); reject(new Error(`serve ended (code ${code}) before it printed an address: ${output.slice(-300)}`)); });
  });
}

const ended = (child) => new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('close', resolve)));

await run(async () => {
  const before = containers(true);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const serve = await startServe();
    try {
      check(`serve (${signal}) the address has the form http://127.0.0.1:<port>/blog/`, /^http:\/\/127\.0\.0\.1:\d+\/blog\/$/.test(serve.url), serve.url);
      // The address is printed only when the page answers, so these requests need no waiting.
      same(`serve (${signal}) the list answers 200`, await status(serve.url), 200);
      same(`serve (${signal}) the fixture post answers 200`, await status(`${serve.url}${POST}`), 200);
      same(`serve (${signal}) the fixture post answers 200 with its index.html too`, await status(`${serve.url}${POST}index.html`), 200);
      const html = await (await fetch(serve.url)).text();
      check(`serve (${signal}) the list shows the title of the fixture post`, html.includes('Ein Film, der in eine Mail passt'));

      // The rules of 7.4 (slice S4): the 308, and the real 404 for a missing address and for a year folder without an index.
      const origin = new URL(serve.url).origin;
      const bare = await ask(origin, '/blog', { method: 'HEAD' });
      same(`serve (${signal}) /blog answers 308 to https://dreambau.com/blog/`, [bare.status, bare.headers.location], [308, 'https://dreambau.com/blog/']);
      for (const address of ['/blog/nope', '/blog/2026/']) {
        const missing = await ask(origin, address);
        check(`serve (${signal}) ${address} answers 404 with the styled page`, missing.status === 404 && missing.text.includes('>Diesen Beitrag gibt es nicht</h1>'), `${missing.status}`);
      }

      const running = containers(false).filter((name) => !before.includes(name));
      check(`serve (${signal}) exactly one new container named blog-test-* is running`, running.length === 1 && /^blog-test-[a-z0-9-]+$/.test(running[0]), JSON.stringify(running));
      const name = running[0];
      if (name) {
        const info = JSON.parse(docker('inspect', name))[0];
        same(`serve (${signal}) the container runs the pinned image`, info.Config.Image, DEFAULT_IMAGE);
        const mounts = info.Mounts.map((mount) => ({ type: mount.Type, writable: mount.RW, to: mount.Destination, from: path.basename(mount.Source) }));
        check(`serve (${signal}) every mount is a read-only bind of a directory`, mounts.length > 0 && mounts.every((mount) => mount.type === 'bind' && mount.writable === false), JSON.stringify(mounts));
        check(`serve (${signal}) the demo output public/ is mounted as a directory at /blog, where the live container has it`, info.Mounts.some((mount) => mount.Destination === '/blog' && /dist-demo[\\/]public$/.test(mount.Source)), JSON.stringify(info.Mounts.map((mount) => mount.Source)));
        const wrong = [...modesInContainer(name, '/blog', 'd').filter((line) => !line.startsWith('755 ')), ...modesInContainer(name, '/blog', 'f').filter((line) => !line.startsWith('644 '))];
        same(`serve (${signal}) the container sees directories as 755 and files as 644 (DL-2)`, wrong, []);
        const ports = docker('port', name);
        check(`serve (${signal}) the port is published on 127.0.0.1 only`, ports.split('\n').filter(Boolean).every((line) => line.includes('127.0.0.1:')), ports);
      }
    } finally {
      serve.child.kill(signal);
      const giveUp = setTimeout(() => serve.child.kill('SIGKILL'), 30000);
      await ended(serve.child);
      clearTimeout(giveUp);
    }
    await sleep(300);
    same(`serve (${signal}) after the signal docker ps --filter name=blog-test- lists no new container`, containers(false).filter((name) => !before.includes(name)), []);
    same(`serve (${signal}) after the signal docker ps -a lists none either: the container is removed`, containers(true).filter((name) => !before.includes(name)), []);
    check(`serve (${signal}) the process ended by the signal it was sent`, serve.child.signalCode === signal, `signal ${serve.child.signalCode}, code ${serve.child.exitCode}`);
  }
});
