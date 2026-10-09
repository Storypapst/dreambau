// AD-1, BD-3 (demo part): the generator turns the posts of a folder into a list page, one page per post and a
// manifest. The expected values below are written out by hand from the example of spec 7.1, never computed by the
// code under test.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { digestTree, withScratch, writePost } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';

const ADDRESS = '2026/ein-film-der-in-eine-mail-passt';
const FIRST = 'Der Vortrag zeigt, wie ein kleines Programm mit wenigen Zeilen auskommt und trotzdem alles Nötige tut. Man sieht dabei, wie viel Ballast wir sonst mitschleppen, ohne es zu merken.';
const SECOND = 'Das gilt auch für unsere Arbeit: Wer vorher entscheidet, was wirklich zählt, erzählt in wenigen Sekunden mehr als andere in einer Stunde. Für uns war das der Anstoß, kürzer zu denken.';

const textOf = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const count = (text, pattern) => (text.match(pattern) || []).length;
const post = (extra = '', title = 'Ein anderer Beitrag', date = '2026-09-01') => `---\ntitle: ${title}\ndate: ${date}\n${extra}---\n\nEin Satz.\n`;

await run(async () => {
  withScratch('build', (out) => {
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: out, mode: 'preview' });
    const files = digestTree(out);
    same('AD-1 the output holds the list, the post page and the manifest, and nothing else', files.map((file) => file.path), ['blog.json', `public/${ADDRESS}/index.html`, 'public/index.html']);

    const list = fs.readFileSync(path.join(out, 'public', 'index.html'), 'utf8');
    const page = fs.readFileSync(path.join(out, 'public', ADDRESS, 'index.html'), 'utf8');
    for (const [name, html] of [['the list', list], ['the post page', page]]) {
      check(`AD-1 ${name} is a complete German HTML document`, /^<!doctype html>\n<html lang="de">/.test(html) && /<meta charset="utf-8">/.test(html) && /<meta name="viewport"/.test(html) && /<title>[^<]+<\/title>/.test(html) && /<\/html>\n$/.test(html));
      check(`AD-1 ${name} loads nothing: no script, no stylesheet, no font, no address but its own links`, !/<script|<style|rel="stylesheet"|@font-face|<iframe/.test(html) && !/(?:src|href)="https?:/.test(html.replace(/<a [^>]*href="https:\/\/videos\.example\.test[^"]*"[^>]*>/g, '')));
    }

    same('AD-1 the list has exactly one row', count(list, /<li\b/g), 1);
    check('AD-1 the row shows the title as a link to the post address', list.includes(`<a href="/blog/${ADDRESS}/">Ein Film, der in eine Mail passt</a>`));
    check('AD-1 the row shows the date and the number 01', textOf(list).includes('2026-10-02') && /\b01\b/.test(textOf(list)));

    check('AD-1 the post page shows the title as its heading and in the document title', /<h1>Ein Film, der in eine Mail passt<\/h1>/.test(page) && /<title>Ein Film, der in eine Mail passt[^<]*<\/title>/.test(page));
    same('AD-1 the post page holds the two paragraphs of the fixture, in order', [...page.matchAll(/<p class="why">([^<]*)<\/p>/g)].map((match) => match[1]), [FIRST, SECOND]);
    check('AD-1 the post page shows the quote with its source and the source as a safe link', page.includes('Wer wenig Platz hat, muss genau hinsehen.') && page.includes('aus dem Vortrag „Klein bauen“') && page.includes('<a href="https://videos.example.test/klein-bauen" rel="noopener noreferrer">Klein bauen: ein Vortrag über winzige Programme</a>'));
    check('AD-1 the post page links back to the list', page.includes('<a href="/blog/">'));

    const json = JSON.parse(fs.readFileSync(path.join(out, 'blog.json'), 'utf8'));
    same('BD-2 blog.json has the fields schema, mode, posts, files, in this order', Object.keys(json), ['schema', 'mode', 'posts', 'files']);
    same('BD-2 blog.json: schema 1, mode preview, the one post with number 1', [json.schema, json.mode, json.posts], [1, 'preview', [{ address: ADDRESS, number: 1 }]]);
    same('BD-2 blog.json lists every page file of public/ with its bytes and sha256, sorted, and not itself',
      json.files, files.filter((file) => file.path.startsWith('public/')).map((file) => ({ path: file.path.slice('public/'.length), bytes: file.bytes, sha256: file.sha256 })));
    same('BD-2 the manifest returned by the build is the manifest written to disk', manifest, json);
    check('BD-2 blog.json holds no clock value (no year-month-day with a time)', !/\d{4}-\d{2}-\d{2}T\d{2}/.test(JSON.stringify(json)));
  });

  // ---- more than one post: newest first in the list, number = rank from the oldest (spec 5.2 PF-15, LI-3) ----
  withScratch('order', (dir) => {
    const posts = path.join(dir, 'posts');
    writePost(posts, '2026/zwei-eins.md', post('', 'Zwei Eins', '2026-09-01'));
    writePost(posts, '2026/aaa-zwei.md', post('', 'Aaa Zwei', '2026-09-01'));
    writePost(posts, '2026/drei.md', post('', 'Drei Beitrag', '2026-10-05'));
    writePost(posts, '2025/null.md', post('', 'Null Beitrag', '2025-12-24'));
    const manifest = buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    same('BD-2 posts are numbered from the oldest, ties by slug', manifest.posts, [
      { address: '2025/null', number: 1 }, { address: '2026/aaa-zwei', number: 2 }, { address: '2026/zwei-eins', number: 3 }, { address: '2026/drei', number: 4 }]);
    const list = fs.readFileSync(path.join(dir, 'out', 'public', 'index.html'), 'utf8');
    same('AD-1 the list shows the newest post first', [...list.matchAll(/<a href="\/blog\/([^"]+)\/">/g)].map((match) => match[1]), ['2026/drei', '2026/zwei-eins', '2026/aaa-zwei', '2025/null']);
  });

  // ---- no posts at all: a valid, empty list ----
  withScratch('empty', (dir) => {
    const manifest = buildBlog({ postsDir: path.join(dir, 'does-not-exist'), outDir: path.join(dir, 'out'), mode: 'preview' });
    same('BD-3 a folder without posts gives an empty manifest', [manifest.posts, manifest.files.map((file) => file.path)], [[], ['index.html']]);
    check('BD-3 the empty list is still a page, with no row', count(fs.readFileSync(path.join(dir, 'out', 'public', 'index.html'), 'utf8'), /<li\b/g) === 0);
  });

  // ---- hostile text is escaped for its place (spec 5.13 PR-5, PR-6); each broken input must fail or be harmless ----
  withScratch('hostile', (dir) => {
    const posts = path.join(dir, 'posts');
    const hostile = `"<script>alert(1)</script>" & <img src=x onerror=1>`;
    writePost(posts, '2026/boese.md', `---\ntitle: ${JSON.stringify(hostile)}\ndate: 2026-09-01\nquote: ${JSON.stringify(hostile)}\nquoteSource: ${JSON.stringify(hostile)}\nsourceLink: ${JSON.stringify('https://x.example.test/a?b=1&c="><i>')}\nsourceTitle: ${JSON.stringify(hostile)}\n---\n\n${hostile}\n`);
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    for (const file of ['index.html', '2026/boese/index.html']) {
      const html = fs.readFileSync(path.join(dir, 'out', 'public', file), 'utf8');
      check(`PR-5 ${file}: the hostile text creates no script, no image and no event attribute`, !/<script|<img|onerror=1>/.test(html) && html.includes('&lt;script&gt;'));
    }
    check('PR-5 the source link keeps its query as text: the ampersand and the quote are escaped in the attribute',
      fs.readFileSync(path.join(dir, 'out', 'public', '2026/boese/index.html'), 'utf8').includes('href="https://x.example.test/a?b=1&amp;c=&quot;&gt;&lt;i&gt;"'));
  });
  for (const [what, link] of [['javascript:', 'javascript:alert(1)'], ['http:', 'http://x.example.test/a'], ['a data: address', 'data:text/html,x']]) {
    withScratch('link', (dir) => {
      const posts = path.join(dir, 'posts');
      writePost(posts, '2026/link.md', post(`sourceLink: ${JSON.stringify(link)}\nsourceTitle: Titel\n`, 'Link Beitrag'));
      let message = '';
      try { buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' }); } catch (error) { message = error.message; }
      check(`PR-6 a source link with ${what} is refused at render time, naming the file`, /sourceLink/.test(message) && /link\.md/.test(message), message || 'no error');
    });
  }
  withScratch('mode', (dir) => {
    let message = '';
    try { buildBlog({ postsDir: FIXTURES, outDir: path.join(dir, 'out'), mode: 'publish' }); } catch (error) { message = error.message; }
    check('BD-3 publish mode does not exist yet and is refused (slice S8 owns it)', /mode/.test(message), message || 'no error');
  });
});
