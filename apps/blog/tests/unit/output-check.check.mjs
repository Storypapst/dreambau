// V16 (AD-1, AD-3, DL-4), BD-9: the check of the output tree (src/lib/output-check.mjs). A build of three posts and one
// image passes; every kind of stray file, dot name, wrong address and wrong host fails with the EXACT line.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { plainPost, writeTree } from '../lib/posts.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { webp } from '../lib/images.mjs';
import { ATOM, WWW } from '../lib/feedtext.mjs';
import { buildBlog } from '../../src/generate.mjs';
import { format } from '../../src/lib/findings.mjs';
import { checkOutput, loadOutputDir } from '../../src/lib/output-check.mjs';

const lines = (files) => checkOutput(files).map(format);
const file = (name, text = '') => ({ name, bytes: Buffer.from(text, 'utf8') });
const SHAPES = 'not a file of the shapes of spec 7.2 (index.html, 404.html, feed.xml, blog.css, blog.js, <year>/<slug>/index.html, <year>/<slug>/image.webp or image.png)';
const DOT = 'a name below public/ must not begin with a dot';

// a minimal good tree, by hand: the page of a post has the head lines the check reads (line 6 is the canonical link)
const page = (canonical) => `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<title>x</title>\n<link rel="canonical" href="${canonical}">\n<meta property="og:image" content="https://dreambau.com/blog/2026/x/image.png">\n</head>\n<body><a href="https://anderswo.example.test/quelle">Quelle</a></body>\n</html>\n`;
const GOOD = () => [file('index.html', page('https://dreambau.com/blog/')), file('blog.css'), file('blog.js'), file('feed.xml'), file('2026/x/index.html', page('https://dreambau.com/blog/2026/x/')), file('2026/x/image.png')];
const without = (files, name) => files.filter((entry) => entry.name !== name);

await run(async () => {
  // ---- V16 on a real build: three posts and one image ----
  withScratch('output', (dir) => {
    const posts = path.join(dir, 'posts');
    writeTree(posts, [
      { year: '2026', slug: 'eins-beitrag', title: 'Eins Beitrag', date: '2026-08-01' },
      { year: '2026', slug: 'zwei-beitrag', title: 'Zwei Beitrag', date: '2026-09-01', text: plainPost({ title: 'Zwei Beitrag', date: '2026-09-01', extra: 'sourceLink: https://quelle.example.test/a\nsourceTitle: Eine Quelle\nimage: zwei-beitrag.webp\nimageAlt: Ein Bild\nimageRights: true\n' }) },
      { year: '2025', slug: 'drei-beitrag', title: 'Drei Beitrag', date: '2025-12-24' },
    ]);
    fs.writeFileSync(path.join(posts, '2026', 'zwei-beitrag.webp'), webp({ width: 800, height: 450 }));
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    const files = loadOutputDir(path.join(dir, 'out', 'public'));
    same('AD-1 the build of three posts and one image holds exactly these files', files.map((entry) => entry.name), [
      '2025/drei-beitrag/index.html', '2026/eins-beitrag/index.html', '2026/zwei-beitrag/image.webp', '2026/zwei-beitrag/index.html', '404.html', 'blog.css', 'blog.js', 'feed.xml', 'index.html']);
    same('V16 the check finds nothing to report in it', lines(files), []);
    // a stray file, a dot file and a wrong host on disk are found by the directory reader too
    fs.writeFileSync(path.join(dir, 'out', 'public', '.hidden'), 'x');
    fs.mkdirSync(path.join(dir, 'out', 'public', 'notes'));
    fs.writeFileSync(path.join(dir, 'out', 'public', 'notes', 'a.txt'), 'x');
    fs.symlinkSync('index.html', path.join(dir, 'out', 'public', 'link.html'));
    same('V16 a dot file, a stray folder and a symbolic link on disk fail with their names', lines(loadOutputDir(path.join(dir, 'out', 'public'))), [
      `FAIL AD-1 .hidden: ${SHAPES}`, `FAIL DL-4 .hidden: ${DOT}`, `FAIL AD-1 link.html: ${SHAPES}`, 'FAIL AD-1 link.html: not a regular file', `FAIL AD-1 notes/a.txt: ${SHAPES}`]);
  });

  // ---- the hand-made tree ----
  same('V16 the good tree passes', lines(GOOD()), []);
  same('AD-1 a stray file', lines([...GOOD(), file('notes.txt')]), [`FAIL AD-1 notes.txt: ${SHAPES}`]);
  same('DL-4 a dot file at the root', lines([...GOOD(), file('.DS_Store')]), [`FAIL AD-1 .DS_Store: ${SHAPES}`, `FAIL DL-4 .DS_Store: ${DOT}`]);
  same('DL-4 a dot folder inside a year', lines([...GOOD(), file('2026/.x/index.html')]), [`FAIL AD-1 2026/.x/index.html: ${SHAPES}`, `FAIL DL-4 2026/.x/index.html: ${DOT}`]);
  same('AD-1 a slug with a capital letter and an underscore', lines([...GOOD(), file('2026/Bad_Slug/index.html')]), [`FAIL AD-1 2026/Bad_Slug/index.html: ${SHAPES}`]);
  same('AD-1 a year with three digits', lines([...GOOD(), file('226/x/index.html')]), [`FAIL AD-1 226/x/index.html: ${SHAPES}`]);
  same('AD-1 an image that is neither webp nor png', lines([...GOOD(), file('2026/x/image.jpg')]), [`FAIL AD-1 2026/x/image.jpg: ${SHAPES}`]);
  same('AD-1 an image under another name', lines([...GOOD(), file('2026/x/bild.png')]), [`FAIL AD-1 2026/x/bild.png: ${SHAPES}`]);
  same('AD-1 an image without the page of its post', lines([...GOOD(), file('2026/y/image.webp')]), ['FAIL AD-1 2026/y/image.webp: the post 2026/y has no index.html']);
  same('AD-1 a year folder with a page of its own', lines([...GOOD(), file('2026/index.html')]), [`FAIL AD-1 2026/index.html: ${SHAPES}`]);
  same('AD-1 the list is missing', lines(without(GOOD(), 'index.html')), ['FAIL AD-1 index.html: the build output has no such file']);
  same('AD-1 the feed, the stylesheet and the script are missing', lines(GOOD().filter((entry) => !['feed.xml', 'blog.css', 'blog.js'].includes(entry.name))), [
    'FAIL AD-1 blog.css: the build output has no such file', 'FAIL AD-1 blog.js: the build output has no such file', 'FAIL AD-1 feed.xml: the build output has no such file']);
  check('AD-1 404.html is allowed by the shapes (the slice of the 404 adds it) but not required', lines([...GOOD(), file('404.html', page('https://dreambau.com/blog/'))]).length === 0);

  // ---- every absolute address of the head uses https://dreambau.com (AD-3) ----
  same('AD-3 the www host in the canonical link of a post', lines([...without(GOOD(), '2026/x/index.html'), file('2026/x/index.html', page(`https://${WWW}/blog/2026/x/`))]),
    [`FAIL AD-3 2026/x/index.html:6: the address https://${WWW}/blog/2026/x/ must use the host dreambau.com, not ${WWW}`]);
  same('AD-3 http instead of https in the canonical link of the list', lines([...without(GOOD(), 'index.html'), file('index.html', page('http://dreambau.com/blog/'))]),
    ['FAIL AD-3 index.html:6: the address http://dreambau.com/blog/ must start with https://']);
  same('AD-3 another host in og:image', lines([...without(GOOD(), '2026/x/index.html'), file('2026/x/index.html', page('https://dreambau.com/blog/2026/x/').replace('https://dreambau.com/blog/2026/x/image.png', 'https://cdn.example.test/i.png'))]),
    ['FAIL AD-3 2026/x/index.html:7: the address https://cdn.example.test/i.png must use the host dreambau.com, not cdn.example.test']);
  check('AD-3 a link in the BODY to another host is a source, not an address of the Blog, and passes (the good tree has one)', lines(GOOD()).length === 0);

  // ---- the feed's addresses are part of the same rule ----
  const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="${ATOM}">\n<id>https://${WWW}/blog/</id>\n<link rel="related" href="https://anderswo.example.test/x"/>\n</feed>\n`;
  same('AD-3 the www host in the id of the feed', lines([...without(GOOD(), 'feed.xml'), file('feed.xml', feed)]),
    [`FAIL AD-3 feed.xml:3: the address https://${WWW}/blog/ must use the host dreambau.com, not ${WWW}`]);
});
