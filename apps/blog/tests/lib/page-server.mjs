// The page server: a container of the real nginx that serves the demo output at /blog/ (spec 5.12 BD-11), so that
// what a person sees through `npm run serve` is what a check sees.
//
//   const server = await startPageServer({ publicDir });   // publicDir: the directory to serve, e.g. dist-demo/public
//   server.url      http://127.0.0.1:<port>/blog/
//   await server.stop()
//
// - The image is nginx:1.27-alpine, replaceable by the environment variable BLOG_NGINX_IMAGE (tests/lib/image.mjs).
// - The config ops/nginx-test.conf is mounted at /etc/dreambau-blog and nginx is started with -c. The served directory
//   is mounted as a directory (never a single file), read-only, at /srv/blog.
// - The port is a free one on 127.0.0.1 and the container name is unique and starts with blog-test-.
// - start() returns when /blog/ answers 200. The container is removed when stop() is called, when the process ends and
//   when it is interrupted (SIGINT, SIGTERM, SIGHUP). A container whose process was killed anyway (its label names the
//   process) is removed by the next start, once that process no longer exists.
import { execFile, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { nginxImage } from './image.mjs';
import { ROOT } from './paths.mjs';

const execFileAsync = promisify(execFile);
const LABEL = 'dreambau.blog.test.owner';
const CONF_DIRECTORY = '/etc/dreambau-blog';
const SERVED_DIRECTORY = '/srv/blog';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function waitUntilReady(url, name, limit) {
  const end = Date.now() + limit;
  let last = 'no answer yet';
  for (let attempt = 0; Date.now() < end; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status === 200) return;
      last = `${url} answered ${response.status}`;
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
  // What the container sees in the served directory is the first thing to know when the page does not answer (an empty
  // directory answers 403, a missing one 404).
  const listing = await docker(['exec', name, 'ls', '-la', SERVED_DIRECTORY]).then((text) => text.trim().split('\n').slice(0, 8).join(' | '), () => 'the directory could not be listed');
  throw new Error(`the page server did not answer on ${url} within ${Math.round(limit / 1000)} s (${last}); ${SERVED_DIRECTORY} in the container: ${listing}`);
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

export async function startPageServer({ publicDir }) {
  await removeStaleContainers();
  const image = nginxImage();
  const name = `blog-test-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  let stopped = false;
  const stopSync = () => {
    if (stopped) return;
    stopped = true;
    running.delete(handle);
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore', timeout: 60000 });
  };
  const handle = { name, image, origin: '', url: '', stopSync, stop: async () => stopSync() };
  running.add(handle);
  hookProcess();
  try {
    const mounts = [[path.resolve(publicDir), SERVED_DIRECTORY], [path.join(ROOT, 'ops'), CONF_DIRECTORY]];
    try {
      await docker(['run', '-d', '--name', name, '--label', `${LABEL}=${process.pid}`, '-p', '127.0.0.1::8080',
        ...mounts.flatMap(([source, target]) => ['--mount', `type=bind,source=${source},target=${target},readonly`]),
        image, 'nginx', '-c', `${CONF_DIRECTORY}/nginx-test.conf`, '-g', 'daemon off;']);
    } catch (error) {
      throw new Error(`the page server could not start a container of the image ${image}: ${error.message}`);
    }
    handle.origin = `http://127.0.0.1:${await publishedPort(name)}`;
    handle.url = `${handle.origin}/blog/`;
    await waitUntilReady(handle.url, name, Number(process.env.BLOG_SERVER_START_TIMEOUT_MS || 60000));
  } catch (error) {
    stopSync();
    throw error;
  }
  return handle;
}
