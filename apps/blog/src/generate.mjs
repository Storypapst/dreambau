// The generator: the posts of one folder -> <outDir>/public/index.html, <outDir>/public/<year>/<slug>/index.html and
// <outDir>/blog.json (spec 7.2). Plain Node, no dependency, no clock, no random value, no network (BD-1, BD-2): the same
// posts give byte-identical files. Slice S0 writes plain, valid HTML; the look is slice S2, the feed S3, the 404 S4.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { esc } from './lib/escape.mjs';
import { format, hasFailure } from './lib/findings.mjs';
import { httpsLink } from './lib/links.mjs';
import { formatNumber, newestFirst, numberPosts } from './lib/numbering.mjs';
import { checkPostText } from './lib/post-file.mjs';
import { checkForBuild, isFixtureTree, loadTreeFromDir, safeImageReader } from './lib/tree.mjs';

const MODES = ['preview']; // `publish` comes with slice S8
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const number = formatNumber;

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

const page = (lang, title, body) => `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="data:,">
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

function listPage(posts) {
  const rows = newestFirst(posts).map((post) => `<li><span class="no">${number(post.number)}</span> <time datetime="${esc(post.date)}">${esc(post.date)}</time> <a href="/blog/${esc(post.address)}/">${esc(post.title)}</a></li>`);
  const content = rows.length === 0 ? '<p>Noch keine Beiträge.</p>' : `<ol class="log">\n${rows.join('\n')}\n</ol>`;
  return page('de', 'Blog · dreambau.com', `<h1>Blog</h1>\n${content}`);
}

function postPage(post) {
  const parts = ['<p><a href="/blog/">Zurück zur Liste</a></p>', '<article>', `<h1>${esc(post.title)}</h1>`,
    `<p><time datetime="${esc(post.date)}">${esc(post.date)}</time> · Nr. ${number(post.number)}</p>`];
  if (post.quote !== undefined) parts.push(`<blockquote><p>${esc(post.quote)}</p><footer>${esc(post.quoteSource || '')}</footer></blockquote>`);
  if (post.imageInfo) {
    const { width, height } = post.imageInfo;
    parts.push(`<p><img src="/blog/${esc(post.address)}/image.${post.imageInfo.format}" width="${width}" height="${height}" alt="${esc(post.imageAlt)}"></p>`);
  }
  if (post.sourceLink !== undefined) {
    const link = httpsLink(post.sourceLink, post.file); // PR-6: checked again at render time
    parts.push(`<p class="source">Quelle: <a href="${esc(link)}" rel="noopener noreferrer">${esc(post.sourceTitle || link)}</a></p>`);
  }
  parts.push('<h2>Warum lesenswert</h2>', ...post.paragraphs.map((paragraph) => `<p class="why">${esc(paragraph)}</p>`), '</article>');
  return page(post.lang, `${post.title} · Blog · dreambau.com`, parts.join('\n'));
}

// Builds the posts of postsDir into outDir and returns the manifest that it wrote to <outDir>/blog.json. A tree that the
// rules refuse (BuildRefused) is refused before anything is written. displayDir is how postsDir is written in the FAIL
// lines. `now` matters only for the clock rule of a publish build (PF-5); a preview build reads no clock (BD-2).
export function buildBlog({ postsDir, outDir, mode = 'preview', displayDir = postsDir, now = new Date() }) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}; expected one of ${MODES.join(', ')}`);
  const posts = readPosts(postsDir, { displayDir, publish: mode === 'publish', now });
  const pages = new Map([['index.html', Buffer.from(listPage(posts), 'utf8')]]);
  for (const post of posts) {
    pages.set(`${post.address}/index.html`, Buffer.from(postPage(post), 'utf8'));
    if (post.imageInfo) pages.set(`${post.address}/image.${post.imageInfo.format}`, fs.readFileSync(path.join(postsDir, post.year, post.image)));
  }

  const files = [...pages.keys()].sort(compare).map((name) => {
    const buffer = pages.get(name);
    return { path: name, bytes: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  });
  const manifest = { schema: 1, mode, posts: posts.map((post) => ({ address: post.address, number: post.number })), files };

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
