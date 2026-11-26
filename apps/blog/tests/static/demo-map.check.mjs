// The list page /blog/ opens with the map "Navigieren" above the list ("Logbuch"), and posts/ may hold demo posts
// (demo: true). Lines named DEMO-n and MAP-n (owner's decision of 2026-11-26, not yet a rule of the spec):
// DEMO-1 the key demo: true is allowed in posts/ and refused by a publish build · DEMO-2 a demo post shows the sign
// "Demo" on the list, on its page and in the feed · DEMO-3 while a demo post exists every page carries noindex, and
// without one no page but the 404 does · MAP-1 the map comes before the list and is hidden without JavaScript ·
// MAP-2 each row carries what the map reads (number, date, full text as a <template>) · MAP-3 the real posts/.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { BODY, plainPost, writeTree } from '../lib/posts.mjs';
import { ROOT } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';

const NOINDEX = '<meta name="robots" content="noindex">';
const lines = (text, options = {}) => checkPostText(text, { file: 'posts/2026/ein-demo.md', ...options }).findings.map((finding) => `${finding.rule}:${finding.where.split(':').pop()}`);
const demoText = (value) => plainPost({ title: 'Ein Demo', date: '2026-11-22', extra: `demo: ${value}\n` });
const read = (out, file) => fs.readFileSync(path.join(out, 'public', file), 'utf8');

await run(async () => {
  // ---- DEMO-1: the key ----
  same('DEMO-1 demo: true is allowed in posts/ (a preview build)', lines(demoText('true')), []);
  same('DEMO-1 checkPostText returns demo: true on the post', checkPostText(demoText('true'), { file: 'posts/2026/ein-demo.md' }).post.demo, true);
  same('DEMO-1 a publish build refuses demo: true at its line', lines(demoText('true'), { publish: true, now: new Date('2026-11-26T10:00:00Z') }), ['PF-14:4']);
  same('DEMO-1 demo: false is refused (leave the key out instead)', lines(demoText('false')), ['PF-14:4']);
  same('DEMO-1 a quoted "true" is refused', lines(demoText('"true"')), ['PF-3:4']);

  withScratch('demo-map', (dir) => {
    // ---- DEMO-2, DEMO-3, MAP-1, MAP-2: two real posts and one demo post ----
    const posts = writeTree(path.join(dir, 'posts'), [
      { year: '2026', slug: 'erster-beitrag', title: 'Erster Beitrag', date: '2026-11-20' },
      { year: '2026', slug: 'zweiter-beitrag', title: 'Zweiter Beitrag', date: '2026-11-21', text: plainPost({ title: 'Zweiter Beitrag', date: '2026-11-21', extra: 'sourceLink: https://quelle.example.test/a\nquote: Kurz und gut.\nquoteSource: jemand\n' }) },
      { year: '2026', slug: 'ein-demo', title: 'Ein Demo', date: '2026-11-22', text: demoText('true') },
    ]);
    const out = path.join(dir, 'out');
    const manifest = buildBlog({ postsDir: posts, outDir: out, mode: 'preview' });
    same('DEMO-2 the manifest marks the demo post and only it', manifest.posts.map((post) => post.demo === true), [false, false, true]);
    const list = read(out, 'index.html');
    const demoRow = (/<li class="row" data-no="03"[\s\S]*?<\/li>/.exec(list) || [''])[0];
    check('DEMO-2 the row of the demo post shows the sign "Demo" in the --draft style, with an explaining title', demoRow.includes('<span class="draft" lang="de" title="Demo-Beitrag: zum Ausprobieren, nicht freigegeben">Demo</span>'), demoRow.slice(0, 300));
    same('DEMO-2 no other row shows the sign', (list.match(/class="draft"/g) || []).length, 1);
    const demoPage = read(out, '2026/ein-demo/index.html');
    check('DEMO-2 the page of the demo post shows the sign above its title', /<p class="tx pmeta">[\s\S]*?<span class="draft"[^>]*>Demo<\/span>[\s\S]*?<\/p><\/div>\n<div class="ln"><h1 class="tx ptitle">Ein Demo<\/h1>/.test(demoPage));
    check('DEMO-2 the page of a real post shows no sign', !read(out, '2026/erster-beitrag/index.html').includes('class="draft"'));
    const feed = read(out, 'feed.xml');
    check('DEMO-2 the feed says "Demo:" in the title of the demo post and nowhere else', feed.includes('<title>Demo: Ein Demo</title>') && feed.includes('<title>Erster Beitrag</title>') && (feed.match(/Demo:/g) || []).length === 1);
    const pages = ['index.html', '404.html', ...manifest.posts.map((post) => `${post.address}/index.html`)];
    same('DEMO-3 with a demo post every page carries noindex, once, in its head', pages.map((file) => { const html = read(out, file); return html.split(NOINDEX).length === 2 && html.indexOf(NOINDEX) < html.indexOf('</head>'); }), pages.map(() => true));

    // MAP-1
    check('MAP-1 the list page loads the map script and nothing else', [...list.matchAll(/<script[^>]*>/g)].map((match) => match[0]).join() === '<script src="/blog/karte.js" defer>');
    const order = ['<section class="karte"', '<h2 class="shd" id="karte-h">Navigieren</h2>', '<div class="stage" id="stage"', '<h2 class="shd logh">Logbuch</h2>', '<ol class="log" id="posts"', '<section class="panel" id="panel"'].map((part) => list.indexOf(part));
    check('MAP-1 the map "Navigieren" comes first, then the list "Logbuch", then the sheet', order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), JSON.stringify(order));
    const css = read(out, 'blog.css');
    check('MAP-1 without JavaScript the map section and the stage are hidden; karte.js shows them with the class js', css.includes('.karte{display:none;') && css.includes('.js .karte{display:block}') && css.includes('.stage{display:none;') && css.includes('.js .stage{display:block}'));
    check('MAP-1 no inline style, no inline script, no event attribute on the list page', !/<style|\sstyle=|<script>|\son[a-z]+=/i.test(list));

    // MAP-2
    same('MAP-2 every row has its number and date for the map, newest first, the newest marked', [...list.matchAll(/<li class="row" data-no="(\d+)" data-date="([\d-]+)"( data-newest)?>/g)].map((match) => [match[1], match[2], Boolean(match[3])]), [['03', '2026-11-22', true], ['02', '2026-11-21', false], ['01', '2026-11-20', false]]);
    const sheet = (/<li class="row" data-no="02"[\s\S]*?(<template class="voll" lang="de">[\s\S]*?<\/template>)/.exec(list) || ['', ''])[1];
    check('MAP-2 a row holds the full text as a <template>: every paragraph, the quote and the source as a safe link', BODY.split('\n\n').every((paragraph) => sheet.includes(`<p>${paragraph}</p>`)) && sheet.includes('<blockquote class="qt"><p>Kurz und gut.</p><footer>jemand</footer></blockquote>') && sheet.includes('<a class="sk" href="https://quelle.example.test/a" rel="noreferrer noopener">'), sheet.slice(0, 300));
    check('MAP-2 the title of a row is a plain link to the post page', list.includes('<h2 class="tt"><a href="/blog/2026/ein-demo/">Ein Demo</a></h2>'));

    // ---- DEMO-3: without a demo post, no noindex but on the 404 page ----
    fs.rmSync(path.join(posts, '2026', 'ein-demo.md'));
    const clean = buildBlog({ postsDir: posts, outDir: out, mode: 'preview' });
    same('DEMO-3 without a demo post only the 404 page carries noindex', ['index.html', '404.html', ...clean.posts.map((post) => `${post.address}/index.html`)].map((file) => read(out, file).includes(NOINDEX)), [false, true, false, false]);

    // ---- an empty blog: no map ----
    buildBlog({ postsDir: path.join(dir, 'nothing'), outDir: out, mode: 'preview' });
    check('MAP-1 an empty blog shows the empty log, without a map and without a script', !read(out, 'index.html').includes('class="karte"') && !read(out, 'index.html').includes('<script'));
  });

  // ---- MAP-3: the real posts/ ----
  withScratch('demo-real', (dir) => {
    const manifest = buildBlog({ postsDir: path.join(ROOT, 'posts'), outDir: dir, mode: 'preview' });
    const demos = manifest.posts.filter((post) => post.demo).map((post) => post.address);
    same('MAP-3 posts/ holds the six demo posts about the owner\'s chosen videos', demos.length, 6);
    check('MAP-3 every demo post of posts/ shows the sign on the list and on its page', demos.every((address) => new RegExp(`<a href="/blog/${address}/">[^<]*</a></h2>\\n<span class="mks"><span class="draft"`).test(read(dir, 'index.html')) && read(dir, `${address}/index.html`).includes('>Demo</span>')));
    check('MAP-3 so every page of the real build carries noindex', ['index.html', '404.html', ...manifest.posts.map((post) => `${post.address}/index.html`)].every((file) => read(dir, file).includes(NOINDEX)));
  });
});
