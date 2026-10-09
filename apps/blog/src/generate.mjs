// The generator: the posts of one folder -> <outDir>/public/index.html, <outDir>/public/<year>/<slug>/index.html and
// <outDir>/blog.json (spec 7.2). Plain Node, no dependency, no clock, no random value, no network (BD-1, BD-2): the same
// posts give byte-identical files. Slice S0 writes plain, valid HTML; the look is slice S2, the feed S3, the 404 S4.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { esc, httpsLink } from './html.mjs';
import { readPost } from './post.mjs';

const MODES = ['preview']; // `publish` comes with slice S8
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const number = (n) => String(n).padStart(2, '0');

// Every post of postsDir (<year>/<slug>.md), oldest first: by date, ties by slug (spec 5.2 PF-15).
function readPosts(postsDir) {
  const posts = [];
  if (!fs.existsSync(postsDir)) return posts;
  for (const year of fs.readdirSync(postsDir, { withFileTypes: true })) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    for (const entry of fs.readdirSync(path.join(postsDir, year.name), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const slug = entry.name.slice(0, -'.md'.length);
      const relative = `${year.name}/${entry.name}`;
      const post = readPost(fs.readFileSync(path.join(postsDir, year.name, entry.name), 'utf8'), relative);
      posts.push({ ...post, slug, address: `${year.name}/${slug}`, file: relative });
    }
  }
  return posts.sort((a, b) => compare(a.date, b.date) || compare(a.slug, b.slug)).map((post, index) => ({ ...post, number: index + 1 }));
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
  const rows = [...posts].reverse().map((post) => `<li><span class="no">${number(post.number)}</span> <time datetime="${esc(post.date)}">${esc(post.date)}</time> <a href="/blog/${esc(post.address)}/">${esc(post.title)}</a></li>`);
  const content = rows.length === 0 ? '<p>Noch keine Beiträge.</p>' : `<ol class="log">\n${rows.join('\n')}\n</ol>`;
  return page('de', 'Blog · dreambau.com', `<h1>Blog</h1>\n${content}`);
}

function postPage(post) {
  const parts = ['<p><a href="/blog/">Zurück zur Liste</a></p>', '<article>', `<h1>${esc(post.title)}</h1>`,
    `<p><time datetime="${esc(post.date)}">${esc(post.date)}</time> · Nr. ${number(post.number)}</p>`];
  if (post.quote !== undefined) parts.push(`<blockquote><p>${esc(post.quote)}</p><footer>${esc(post.quoteSource || '')}</footer></blockquote>`);
  if (post.sourceLink !== undefined) {
    const link = httpsLink(post.sourceLink, post.file);
    parts.push(`<p class="source">Quelle: <a href="${esc(link)}" rel="noopener noreferrer">${esc(post.sourceTitle || link)}</a></p>`);
  }
  parts.push('<h2>Warum lesenswert</h2>', ...post.paragraphs.map((paragraph) => `<p class="why">${esc(paragraph)}</p>`), '</article>');
  return page(post.lang, `${post.title} · Blog · dreambau.com`, parts.join('\n'));
}

// Builds the posts of postsDir into outDir and returns the manifest that it wrote to <outDir>/blog.json.
export function buildBlog({ postsDir, outDir, mode = 'preview' }) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${JSON.stringify(mode)}; expected one of ${MODES.join(', ')}`);
  const posts = readPosts(postsDir);
  const pages = new Map([['index.html', listPage(posts)]]);
  for (const post of posts) pages.set(`${post.address}/index.html`, postPage(post));

  const files = [...pages.keys()].sort(compare).map((name) => {
    const buffer = Buffer.from(pages.get(name), 'utf8');
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
  for (const [name, text] of pages) {
    const target = path.join(outDir, 'public', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  fs.writeFileSync(path.join(outDir, 'blog.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
