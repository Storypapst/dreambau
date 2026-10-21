// V29 (PO-1, PO-2, PO-4, PO-5, PO-6, FD-6, LG-1, LG-2), AD-3: the head and the sections of a post page, and the feed link
// of the list and of every post page. Posts: one with every field (the sixth of the demo, with the image), one without a
// source (the fourth) and one with lang: en (the third). The expected texts are typed from the fixture files.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { DEMO } from '../lib/demo.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';

const FEED_LINK = '<link rel="alternate" type="application/atom+xml" title="Blog · dreambau.com" href="/blog/feed.xml">';
const FULL = '2026/warum-bei-uns-der-text-zuerst-kommt';
const PLAIN = '2026/notiz-aus-der-werkstatt';
const ENGLISH = '2026/small-is-a-habit';

const headOf = (html) => /<head>\n([\s\S]*?)<\/head>/.exec(html)[1].split('\n').filter((line) => line !== '');
const indexes = (html, markers) => markers.map((marker) => html.indexOf(marker));
const inOrder = (list) => list.every((value, index) => value >= 0 && (index === 0 || value > list[index - 1]));

await run(async () => {
  withScratch('head', (dir) => {
    buildBlog({ postsDir: FIXTURES, outDir: dir, mode: 'preview' });
    const read = (relative) => fs.readFileSync(path.join(dir, 'public', relative), 'utf8');
    const list = read('index.html');
    const pageOf = (address) => read(`${address}/index.html`);

    // ---- FD-6: the feed link on the list and on every post page, exactly once, in the head ----
    same('FD-6 the list announces the feed once, in the head, with the literal link of the spec', [headOf(list).filter((line) => line.includes('application/atom+xml')), list.split('application/atom+xml').length - 1], [[FEED_LINK], 1]);
    for (const demo of DEMO) {
      const html = pageOf(`2026/${demo.slug}`);
      same(`FD-6 ${demo.slug}: the post page announces the feed once, in the head`, [headOf(html).filter((line) => line.includes('application/atom+xml')), html.split('application/atom+xml').length - 1], [[FEED_LINK], 1]);
    }
    check('FD-6 the header still links the feed as a pill for a visitor (LI-2)', list.includes('<a class="pill feed" href="/blog/feed.xml"'));

    // ---- PO-1: the head of a post with every field, line by line ----
    const full = pageOf(FULL);
    const DESCRIPTION = 'Ein kurzer Artikel über die Reihenfolge beim Bauen einer Seite: erst der Text, dann alles andere. Er begründet, warum eine schmale Lesespalte kein Verlust ist';
    same('PO-1 the head of the post with every field is exactly these lines, in this order', headOf(full), [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<meta name="color-scheme" content="dark">',
      '<title>Warum bei uns der Text zuerst kommt · Blog · dreambau.com</title>',
      `<meta name="description" content="${DESCRIPTION}">`,
      '<link rel="canonical" href="https://dreambau.com/blog/2026/warum-bei-uns-der-text-zuerst-kommt/">',
      '<meta property="og:title" content="Warum bei uns der Text zuerst kommt">',
      `<meta property="og:description" content="${DESCRIPTION}">`,
      '<meta property="og:type" content="article">',
      '<meta property="og:url" content="https://dreambau.com/blog/2026/warum-bei-uns-der-text-zuerst-kommt/">',
      '<meta property="og:image" content="https://dreambau.com/blog/2026/warum-bei-uns-der-text-zuerst-kommt/image.png">',
      FEED_LINK,
      '<link rel="icon" href="data:,">',
      '<link rel="stylesheet" href="/blog/blog.css">',
      '<script src="/blog/blog.js" defer></script>',
    ]);
    check('PO-1 the description is at most 160 code points, ends at a word boundary and is the start of the body', [...DESCRIPTION].length <= 160 && [...DESCRIPTION].length > 140);

    // ---- a post without an image has no og:image; the others have all other tags (PO-1) ----
    const plain = pageOf(PLAIN);
    same('PO-1 a post without an image has no og:image, and all other tags', headOf(plain).filter((line) => /og:|canonical|description/.test(line)).map((line) => line.replace(/content="[^"]*"/, 'content=…').replace(/href="[^"]*"/, 'href=…')), [
      '<meta name="description" content=…>', '<link rel="canonical" href=…>', '<meta property="og:title" content=…>', '<meta property="og:description" content=…>', '<meta property="og:type" content=…>', '<meta property="og:url" content=…>']);
    same('PO-1 the head of the English post: title with the English text, the description in English', [headOf(pageOf(ENGLISH))[3], headOf(pageOf(ENGLISH))[4].startsWith('<meta name="description" content="A short essay on why small things stay understandable')], [
      '<title>Small is a habit · Blog · dreambau.com</title>', true]);

    // ---- AD-3: every absolute address of every head is on dreambau.com, never on www ----
    for (const address of ['', ...DEMO.map((demo) => `2026/${demo.slug}/`)]) {
      const html = read(`${address}index.html`);
      const absolute = headOf(html).flatMap((line) => [...line.matchAll(/="(https?:[^"]*)"/g)].map((match) => new URL(match[1]).host));
      same(`AD-3 ${address === '' ? 'the list' : address}: every absolute address in the head has the host dreambau.com`, [...new Set(absolute)].filter((host) => host !== 'dreambau.com'), []);
    }
    check('AD-3 no output file names the www host', fs.readdirSync(dir, { recursive: true }).filter((name) => /\.(html|xml|css|js)$/.test(name)).every((name) => !fs.readFileSync(path.join(dir, name), 'utf8').includes('www.dreambau.com')));

    // ---- PO-2: the sections in order (meta line, h1, quote, figure, why, source, nav) ----
    const MARKERS = ['class="tx pmeta"', '<h1 class="tx ptitle"', '<blockquote', '<figure class="pic">', 'id="why-h"', 'id="src-h"', '<nav class="pn"'];
    check('PO-2 the post with every field has the meta line, the title, the quote, the figure, Warum lesenswert, Quelle and the older/newer nav, in this order', inOrder(indexes(full, MARKERS)), indexes(full, MARKERS).join());
    const without = (html, markers) => markers.map((marker) => html.includes(marker));
    same('PO-2 the post without a source, a quote and an image has no such section', without(plain, ['id="src-h"', '<blockquote', '<figure', 'rel="noreferrer noopener"', 'Führt zu']), [false, false, false, false, false]);
    check('PO-2 the post without a source still has meta line, title, Warum lesenswert and nav, in this order', inOrder(indexes(plain, ['class="tx pmeta"', '<h1 class="tx ptitle"', 'id="why-h"', '<nav class="pn"'])));

    // ---- PO-4, PO-5: the source and the quote ----
    check('PO-4 the source link: text is the source title, rel noreferrer noopener, no target, and the line below names the host', full.includes('<a class="sk" href="https://artikel.example.test/text-zuerst" rel="noreferrer noopener">Text zuerst: warum eine schmale Spalte genügt</a>') && full.includes('<p class="sw">artikel.example.test</p>') && full.includes('Führt zu artikel.example.test. Nichts ist eingebettet.') && !full.includes('target='));
    check('PO-5 the quote is a blockquote with one paragraph and its source in a footer, and it is not a link', /<blockquote class="tx qt"><p>Eine schmale Spalte ist kein Verlust, sie ist die halbe Arbeit\.<\/p><footer>aus dem Artikel „Text zuerst“<\/footer><\/blockquote>/.test(full));

    // ---- PO-6: the image has width, height and alt (the PNG is 960 x 540, read from its header by hand) ----
    const header = fs.readFileSync(path.join(FIXTURES, '2026', 'warum-bei-uns-der-text-zuerst-kommt.png'));
    same('PO-6 the fixture is a PNG of 960 x 540 (its header says so)', [header.readUInt32BE(16), header.readUInt32BE(20)], [960, 540]);
    check('PO-6 the <img> has src, width, height, alt, loading and decoding, and nothing like srcset', full.includes('<img src="image.png" width="960" height="540" alt="Ein dunkles Bild mit einem Raster aus bunten Zeichen und einer leeren Fläche in der Mitte" loading="eager" decoding="async">') && !/srcset/.test(full));
    same('PO-6 only the post with an image has an <img> at all', DEMO.map((demo) => [demo.slug, pageOf(`2026/${demo.slug}`).includes('<img')]).filter(([, has]) => has).map(([slug]) => slug), ['warum-bei-uns-der-text-zuerst-kommt']);

    // ---- LG-1, LG-2: the language of the page and of the English text ----
    const english = pageOf(ENGLISH);
    check('LG-1 every page is lang="de" on <html>; the post says its own language on <article>', /<html lang="de"/.test(english) && /<article class="post" lang="en">/.test(english) && /<article class="post" lang="de">/.test(full));
    check('LG-2 the English post carries lang="en" on its title, its paragraphs and its source link text; the labels around it stay German', /<h1 class="tx ptitle" lang="en">/.test(english) && (english.match(/<p class="tx prose" lang="en">/g) || []).length === 3 && /rel="noreferrer noopener" lang="en">/.test(english) && /<h2 class="sech" id="why-h" lang="de">/.test(english));
  });
});
