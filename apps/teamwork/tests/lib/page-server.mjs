// The page server: a container of the real nginx that serves a test tree the way the live homepage container serves
// it (spec 3.4 and spec 9 group C), so that a check sees the real headers and routes.
//
//   const server = await startPageServer({ list, reachable });   // options of lib/tree.mjs, see buildTree
//   server.url                                  http://127.0.0.1:<port>/teamwork/
//   server.replaceFile('data/status.json', text)   atomic replace in the served directory
//   await server.stop()
//
// - The image is nginx:1.27-alpine, replaceable by the environment variable TEAMWORK_NGINX_IMAGE.
// - The config ops/nginx-test.conf is read at /etc/dreambau-web/nginx.conf and nginx is started with -c, as in spec 3.4.
// - The directories /site, /bildungshaus, /teamwork and the config directory are bind mounts, each a directory, read-only.
// - The port is a free one on 127.0.0.1 and the container name is unique and starts with teamwork-test-.
// - start() returns when /health answers. The container and the tree are removed when stop() is called, when the
//   process ends and when it is interrupted (SIGINT, SIGTERM, SIGHUP). A container whose process was killed anyway
//   (its label names the process) is removed by the next start, once that process no longer exists.
import { execFile, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildTree, replaceAtomically } from './tree.mjs';

const execFileAsync = promisify(execFile);
const LABEL = 'dreambau.teamwork.test.owner';
const CONF_DIRECTORY = '/etc/dreambau-web';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const nginxImage = () => process.env.TEAMWORK_NGINX_IMAGE || 'nginx:1.27-alpine';

async function docker(args, timeout = 120000) {
  try {
    const { stdout } = await execFileAsync('docker', args, { timeout, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Docker is not installed or not on the PATH (the page server starts nginx in a container)');
    const detail = String(error.stderr || error.message).trim().split('\n').filter(Boolean).slice(-3).join(' | ');
    throw new Error(`docker ${args[0]} failed: ${detail}`);
  }
}

function processIsGone(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

// Removes the containers of earlier page servers whose process no longer exists (it was killed, so it could not clean up).
async function removeStaleContainers() {
  try {
    const listing = await docker(['ps', '-a', '--filter', `label=${LABEL}`, '--format', `{{.Names}} {{.Label "${LABEL}"}}`]);
    for (const line of listing.split('\n').filter(Boolean)) {
      const [name, owner] = line.split(' ');
      if (processIsGone(Number(owner))) await docker(['rm', '-f', name]).catch(() => {});
    }
  } catch {
    // no Docker, or nothing to remove: the start itself reports a missing Docker
  }
}

async function publishedPort(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const match = /127\.0\.0\.1:(\d+)/.exec(await docker(['port', name, '8080/tcp']).catch(() => ''));
    if (match) return Number(match[1]);
    await sleep(100);
  }
  throw new Error(`Docker published no port for ${name}`);
}

async function waitUntilReady(origin, name, limit) {
  const end = Date.now() + limit;
  let last = 'no answer yet';
  for (let attempt = 0; Date.now() < end; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
      last = `/health answered ${response.status}`;
    } catch (error) {
      last = String((error.cause && error.cause.code) || error.message);
    }
    if (attempt % 10 === 9) {
      const state = await docker(['inspect', '--format', '{{.State.Running}}', name]).catch(() => 'false');
      if (state.trim() !== 'true') {
        const log = await docker(['logs', '--tail', '20', name]).catch(() => '');
        throw new Error(`the nginx container stopped before it answered: ${log.trim().split('\n').slice(-5).join(' | ')}`);
      }
    }
    await sleep(100);
  }
  throw new Error(`the page server did not answer on ${origin}/health within ${Math.round(limit / 1000)} s (${last})`);
}

const running = new Set();
let hooked = false;
function stopEverything() {
  for (const server of [...running]) server.stopSync();
}
function hookProcess() {
  if (hooked) return;
  hooked = true;
  process.on('exit', stopEverything);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const onSignal = () => {
      stopEverything();
      process.removeListener(signal, onSignal);
      process.kill(process.pid, signal); // the process still ends by the signal it was sent
    };
    process.on(signal, onSignal);
  }
}

export async function startPageServer(options = {}) {
  await removeStaleContainers();
  const image = nginxImage();
  const tree = buildTree(options);
  const name = `teamwork-test-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  let stopped = false;
  const stopSync = () => {
    if (stopped) return;
    stopped = true;
    running.delete(handle);
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 60000 });
    tree.remove();
  };
  const handle = { name, image, tree, origin: '', url: '', stopSync, stop: async () => stopSync(), replaceFile: null };
  running.add(handle);
  hookProcess();
  try {
    const mounts = [[tree.site, '/site'], [tree.bildungshaus, '/bildungshaus'], [tree.teamwork, '/teamwork'], [tree.etc, CONF_DIRECTORY]];
    try {
      await docker(['run', '-d', '--name', name, '--label', `${LABEL}=${process.pid}`, '-p', '127.0.0.1::8080',
        ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,source=${source},target=${target},readonly`]),
        image, 'nginx', '-c', `${CONF_DIRECTORY}/nginx.conf`, '-g', 'daemon off;']);
    } catch (error) {
      throw new Error(`the page server could not start a container of the image ${image}: ${error.message}`);
    }
    handle.origin = `http://127.0.0.1:${await publishedPort(name)}`;
    handle.url = `${handle.origin}/teamwork/`;
    await waitUntilReady(handle.origin, name, Number(process.env.TEAMWORK_SERVER_START_TIMEOUT_MS || 60000));
  } catch (error) {
    stopSync();
    throw error;
  }
  handle.replaceFile = (relative, content) => {
    const target = path.resolve(tree.teamwork, relative);
    if (!target.startsWith(`${tree.teamwork}${path.sep}`)) throw new Error(`replaceFile refuses "${relative}": it is outside the served directory`);
    replaceAtomically(target, content);
  };
  return handle;
}

// Starts a page server, runs the body with it and always stops it.
export async function withPageServer(options, body) {
  const server = await startPageServer(options);
  try {
    return await body(server);
  } finally {
    await server.stop();
  }
}
