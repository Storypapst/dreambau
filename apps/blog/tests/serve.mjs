// `npm run serve`: builds the demo (the fixture posts, preview mode) into dist-demo/, starts the nginx container with the
// rules of spec 7.4 (ops/nginx-blog-test.conf) on a free port of 127.0.0.1, waits until /blog/ answers, and prints the
// address. Ctrl-C stops the container and removes it.
import path from 'node:path';
import { buildBlog } from '../src/generate.mjs';
import { FIXTURES, ROOT } from './lib/paths.mjs';
import { setServerModes } from './lib/nginx.mjs';
import { startPageServer } from './lib/page-server.mjs';

async function main() {
  const outDir = path.join(ROOT, 'dist-demo');
  buildBlog({ postsDir: FIXTURES, outDir, mode: 'preview' });
  setServerModes(path.join(outDir, 'public')); // directories 0755, files 0644, as the publisher sets them on the server (DL-2)
  const server = await startPageServer({ publicDir: path.join(outDir, 'public') });
  console.log(server.url);
  console.log(`Container ${server.name} is running (demo build, fixtures only). Press Ctrl-C to stop it and remove it.`);
  setInterval(() => {}, 1e9); // keeps the process alive until it is interrupted
}

main().catch((error) => {
  console.error(`The page server could not start: ${error.message}`);
  process.exitCode = 1;
});
