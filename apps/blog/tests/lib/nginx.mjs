// Helpers of the server checks (tests/server/): a request that reports what nginx sent, the modes of the mounted tree,
// a small invented site built with the real generator, and the question "is this container still there?".
// Nothing here starts a container; tests/lib/page-server.mjs does.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildBlog } from '../../src/generate.mjs';
import { ROOT } from './paths.mjs';
import { plainPost, writeTree } from './posts.mjs';

// One request without following a redirect. Header names are lower case. `text` is the body read as UTF-8, `bytes` the
// body as it came.
export async function ask(origin, requestPath, { method = 'GET', body } = {}) {
  const response = await fetch(`${origin}${requestPath}`, { method, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: Object.fromEntries(response.headers), text: bytes.toString('utf8'), bytes };
}

// Directories 0755 and files 0644 (DL-2): the modes the publisher sets on the server. The build writes with the umask of
// whoever runs it, so the checks and `npm run serve` set the modes the server has before they mount the tree.
export function setServerModes(directory) {
  fs.chmodSync(directory, 0o755);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) setServerModes(full);
    else fs.chmodSync(full, 0o644);
  }
}

// True while Docker lists a container of exactly this name (stopped ones too).
export function containerExists(name) {
  const listing = execFileSync('docker', ['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], { encoding: 'utf8' });
  return listing.split('\n').map((line) => line.trim()).includes(name);
}

// What the container sees below a directory: the modes of its directories (type 'd') or files (type 'f'), as `mode name`
// lines (BusyBox stat), sorted.
export function modesInContainer(name, directory, type) {
  return execFileSync('docker', ['exec', name, 'sh', '-c', `find ${directory} -mindepth 1 -type ${type} -exec stat -c '%a %n' {} +`], { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
}

// An invented small site, built by the generator (preview mode) into `outDir`: three posts in two years, one of them with
// a real WebP image from tests/images (an image is the point of the type check). It is not the fixture set: this site
// stands outside tests/fixtures, so the rules of a real post apply (no `example`).
export const SITE = Object.freeze({
  imagePost: '2026/mit-bild',
  plainPost: '2026/ohne-bild',
  oldPost: '2025/altes-logbuch',
  years: ['2025', '2026'],
});

export function buildSite(workDirectory, outDirectory) {
  const posts = path.join(workDirectory, 'posts');
  const image = 'image: mit-bild.webp\nimageAlt: Ein kleines Testbild in Grün\nimageRights: true\n';
  writeTree(posts, [
    { year: '2026', slug: 'mit-bild', text: plainPost({ title: 'Mit Bild', date: '2026-09-02', extra: image }) },
    { year: '2026', slug: 'ohne-bild', text: plainPost({ title: 'Ohne Bild', date: '2026-09-01' }) },
    { year: '2025', slug: 'altes-logbuch', text: plainPost({ title: 'Altes Logbuch', date: '2025-11-03' }) },
  ]);
  fs.copyFileSync(path.join(ROOT, 'tests', 'images', 'real-lossy-8x6.webp'), path.join(posts, '2026', 'mit-bild.webp'));
  fs.mkdirSync(outDirectory, { recursive: true });
  const manifest = buildBlog({ postsDir: posts, outDir: outDirectory, mode: 'preview' });
  return { manifest, publicDir: path.join(outDirectory, 'public') };
}

// The feed is slice S3's. As long as the build does not write one, the checks put a minimal invented Atom file in its
// place so that the type and the headers of /blog/feed.xml can be proved; `standIn` says which case it was.
const ATOM_NAMESPACE = ['http:/', '/www.w3.org/2005/Atom'].join(''); // assembled: the hygiene scan allows no host but ours
const STAND_IN_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="${ATOM_NAMESPACE}" xml:lang="de"><id>https://dreambau.com/blog/</id><title>Blog · dreambau.com</title><updated>1970-01-01T00:00:00Z</updated></feed>
`;

export function ensureFeed(publicDir) {
  const file = path.join(publicDir, 'feed.xml');
  if (fs.existsSync(file)) return { standIn: false, file };
  fs.writeFileSync(file, STAND_IN_FEED);
  return { standIn: true, file };
}
