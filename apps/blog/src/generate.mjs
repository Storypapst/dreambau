// The generator: the posts of one folder -> <outDir>/public/index.html, <outDir>/public/<year>/<slug>/index.html and
// <outDir>/blog.json (spec 7.2). Plain Node, no dependency, no clock, no random value, no network (BD-1, BD-2): the same
// posts give byte-identical files. The look is slice S2, the feed (feed.xml, checked as XML before it is written) S3, the
// 404 S4.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeed } from './lib/feed-check.mjs';
import { feedXml } from './lib/feed.mjs';
import { fail, format, hasFailure } from './lib/findings.mjs';
import { FOOTER_FILE, loadFooter, pendingKeys } from './lib/footer.mjs';
import { LABELS_FILE, loadLabels } from './lib/labels.mjs';
import { numberPosts } from './lib/numbering.mjs';
import { checkOutput } from './lib/output-check.mjs';
import { listPage, postPage } from './lib/pages.mjs';
import { checkPostText } from './lib/post-file.mjs';
import { MARKER } from './lib/post-rules.mjs';
import { checkForBuild, isFixtureTree, loadTreeFromDir, safeImageReader } from './lib/tree.mjs';

const MODES = ['preview']; // `publish` comes with slice S8
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const ASSETS_DIR = path.dirname(fileURLToPath(import.meta.url)); // src/: tokens.css, blog.css, blog.js
export const LIST_LIMIT = 128 * 1024; // LI-8

// The posts of a folder were refused by the rules of the spec (PF-*, AD-7): `findings` holds every FAIL and WARN, the
// message holds them one per line, as the validators print them (BD-4).
export class BuildRefused extends Error {
  constructor(findings) {
    super(findings.map(format).join('\n'));
    this.name = 'BuildRefused';
    this.findings = findings;
  }
}

// Every post of postsDir (<year>/<slug>.md) through the rules, oldest first with its number (PF-15, LI-3). All failures of
// all files are collected before anything is thrown.
function readPosts(postsDir, { displayDir, publish, now }) {
  const head = loadTreeFromDir(postsDir);
  const findings = checkForBuild({ head, headDir: postsDir, displayDir, publish, now });
  if (hasFailure(findings)) throw new BuildRefused(findings);
  const fixture = isFixtureTree(postsDir);
  const posts = [...head.posts.values()].map((entry) => {
    const file = `${displayDir}/${entry.relative}`;
    const { post } = checkPostText(entry.text, { file, publish, now, fixture, readImage: safeImageReader(path.join(postsDir, entry.year)) });
    return { ...post, file: entry.relative };
  });
  return numberPosts(posts);
}

// The two files of the look, shipped as they are (the only stylesheet is tokens.css followed by blog.css, so that the
// page loads one file, LI-1) and checked at build time: PF-12 holds for them too (no run of two opening or closing
// square brackets, no marker text).
function readAssets(assetsDir) {
  const read = (name) => fs.readFileSync(path.join(assetsDir, name), 'utf8');
  const css = `${read('tokens.css').replace(/\n$/, '')}\n${read('blog.css')}`;
  const js = read('blog.js');
  const findings = [];
  for (const [name, text] of [['blog.css', css], ['blog.js', js]]) {
    if (/\[\[|\]\]/.test(text) || text.includes(MARKER)) findings.push(fail('PF-12', name, 'the shipped file holds a run of two square brackets or the marker text of LE-1'));
  }
  if (findings.length > 0) throw new BuildRefused(findings);
  return { css: Buffer.from(css, 'utf8'), js: Buffer.from(js, 'utf8') };
}

// Builds the posts of postsDir into outDir and returns the manifest that it wrote to <outDir>/blog.json. A tree that the
// rules refuse (BuildRefused) is refused before anything is written. displayDir is how postsDir is written in the FAIL
// lines. `now` matters only for the clock rule of a publish build (PF-5); a preview build reads no clock (BD-2).
// labelsFile, footerFile, assetsDir and listLimit are the places a check replaces; the defaults are the real ones.
export function buildBlog({ postsDir, outDir, mode = 'preview', displayDir = postsDir, now = new Date(), labelsFile = LABELS_FILE, footerFile = FOOTER_FILE, assetsDir = ASSETS_DIR, listLimit = LIST_LIMIT }) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}; expected one of ${MODES.join(', ')}`);
  const posts = readPosts(postsDir, { displayDir, publish: mode === 'publish', now });
  const labels = loadLabels(labelsFile);
  const footer = loadFooter(footerFile);
  const assets = readAssets(assetsDir);
  const context = { labels, footer };

  const list = Buffer.from(listPage({ ...context, posts }), 'utf8');
  if (list.length > listLimit) {
    throw new BuildRefused([fail('LI-8', 'index.html', `the list page is ${list.length} bytes, over the limit of ${listLimit} bytes (128 KiB); the list is never cut silently, the way out is pagination: see open point OP-11`)]);
  }
  const pages = new Map([['index.html', list], ['blog.css', assets.css], ['blog.js', assets.js]]);
  // FD-1: the feed is generated with the pages and checked as XML (the offline validator) before anything is written.
  const feed = feedXml({ labels, posts });
  const feedProblems = checkFeed(feed, { labels });
  if (hasFailure(feedProblems)) throw new BuildRefused(feedProblems);
  pages.set('feed.xml', Buffer.from(feed, 'utf8'));
  for (const post of posts) {
    const html = postPage({ ...context, post, older: posts[post.number - 2], newer: posts[post.number] });
    pages.set(`${post.address}/index.html`, Buffer.from(html, 'utf8'));
    if (post.imageInfo) pages.set(`${post.address}/image.${post.imageInfo.format}`, fs.readFileSync(path.join(postsDir, post.year, post.image)));
  }

  // V16: only files of the shapes of 7.2, no name with a dot, every address in a head and in the feed on dreambau.com.
  const treeProblems = checkOutput([...pages].map(([name, bytes]) => ({ name, bytes })));
  if (hasFailure(treeProblems)) throw new BuildRefused(treeProblems);

  const files = [...pages.keys()].sort(compare).map((name) => {
    const buffer = pages.get(name);
    return { path: name, bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  });
  const manifest = { schema: 1, mode, footerPending: pendingKeys(footer), posts: posts.map((post) => ({ address: post.address, number: post.number })), files };

  // Only these two entries of outDir belong to the build; everything else in it stays as it is. public/ is emptied but
  // never removed: a directory that is removed and created again just before `docker run` can show up empty in the
  // container (measured on Docker Desktop, 7 of 25 starts; 0 of 50 when the directory stays).
  const publicDir = path.join(outDir, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  for (const entry of fs.readdirSync(publicDir)) fs.rmSync(path.join(publicDir, entry), { recursive: true, force: true });
  fs.rmSync(path.join(outDir, 'blog.json'), { force: true });
  for (const [name, content] of pages) {
    const target = path.join(outDir, 'public', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(path.join(outDir, 'blog.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
