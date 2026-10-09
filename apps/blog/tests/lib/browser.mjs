// The browser side of the checks: Chromium from the Playwright that the package pins (1.56.1), a build of the demo posts,
// and a way to serve a build to a page without a container for the variants that a check makes (an empty list, another
// footer.json). The real page server (nginx in a container, tests/lib/page-server.mjs) serves the main build.
//
// CHROMIUM_EXECUTABLE=/path/to/chromium starts that Chromium instead of the one `npx playwright install chromium` put in
// the cache, the way apps/landing does. Every browser that a check starts is closed at the end of its body, also when
// the body throws; a signal that ends the process closes it too.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { buildBlog } from '../../src/generate.mjs';
import { FIXTURES } from './paths.mjs';
import { startPageServer } from './page-server.mjs';
import { withScratch } from './scratch.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/atom+xml' };

export async function withBrowser(body) {
  const executablePath = process.env.CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const closeOnSignal = () => { browser.close().finally(() => process.exit(130)); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, closeOnSignal);
  try {
    return await body(browser);
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, closeOnSignal);
    await browser.close();
  }
}

// Builds the posts of `postsDir` (default: the seven demo posts) into a scratch directory and gives `body` its public/
// directory. `options` goes to buildBlog (a footerFile, for example).
export async function withBuild(body, { postsDir = FIXTURES, ...options } = {}) {
  return withScratch('browser', async (dir) => {
    const manifest = buildBlog({ postsDir, outDir: path.join(dir, 'out'), mode: 'preview', ...options });
    return body({ publicDir: path.join(dir, 'out', 'public'), manifest, dir });
  });
}

// Builds the demo posts and serves them with the real nginx; `body` gets { origin, url, publicDir, manifest }.
export async function withDemoServer(body, options) {
  return withBuild(async (build) => {
    const server = await startPageServer({ publicDir: build.publicDir });
    try {
      return await body({ ...build, origin: server.origin, url: server.url });
    } finally {
      await server.stop();
    }
  }, options);
}

// Answers every request of a context for http://blog.test/blog/... from a build directory (no container): the files with
// their types, a missing path with 404. Returns the list of the requests that were made (method, url).
export async function serveFromDirectory(context, publicDir) {
  const requests = [];
  await context.route('http://blog.test/**', (route) => {
    const request = route.request();
    requests.push({ method: request.method(), url: request.url() });
    const relative = decodeURIComponent(new URL(request.url()).pathname).replace(/^\/blog\//, '');
    let file = path.join(publicDir, relative);
    if (relative === '' || relative.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(publicDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  return requests;
}
export const BLOG_ORIGIN = 'http://blog.test';
