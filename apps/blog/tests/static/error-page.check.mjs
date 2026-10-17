// ER-1 and AD-1: the real 404 page as the generator writes it. 404.html is a complete page in the look of the Blog:
// header, <h1> blog.error.title, the line blog.error.text, a link to /blog/ with the text of blog.back, the footer,
// <meta name="robots" content="noindex">, no script, only root-relative addresses, at most 8 KB (section 6). It is a file
// of public/ and of the manifest (7.2) on every build, also for a blog without posts. The expected texts are typed by
// hand from labels.de.json; the page is read as text (what nginx and a browser make of it is in tests/server/).
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { digestTree, withScratch } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';

const TITLE = 'Diesen Beitrag gibt es nicht';
const TEXT = 'Adresse falsch oder Beitrag entfernt.';
const BACK = 'Zurück zur Liste';
const addresses = (html) => [...html.matchAll(/\b(?:href|src|action|poster|srcset)="([^"]*)"/g)].map((match) => match[1]);

await run(async () => {
  withScratch('error-page', (out) => {
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: out, mode: 'preview' });
    const file = path.join(out, 'public', '404.html');
    check('ER-1 404.html is a file of public/', fs.existsSync(file));
    if (!fs.existsSync(file)) return;
    const raw = fs.readFileSync(file);
    const html = raw.toString('utf8');
    const main = (/<main id="main">([\s\S]*?)<\/main>/.exec(html) || [])[1] || '';

    check('ER-1 a complete German HTML document (doctype, lang, charset, viewport, title, closing tag)', /^<!doctype html>\n<html lang="de" dir="ltr">/.test(html) && html.includes('<meta charset="utf-8">') && html.includes('<meta name="viewport"') && /<title>[^<]+<\/title>/.test(html) && /<\/html>\n$/.test(html));
    same('ER-1 the title says what the page is, in the pattern of the other pages', /<title>([^<]*)<\/title>/.exec(html)[1], `${TITLE} · Blog · dreambau.com`);
    same('ER-1 exactly one <h1>, and it is the text of blog.error.title', [html.match(/<h1\b/g).length, /<h1\b[^>]*>([^<]*)<\/h1>/.exec(html)[1]], [1, TITLE]);
    check('ER-1 the <h1> is inside <main id="main"> (the skip link has its target)', main.includes(`>${TITLE}</h1>`) && html.includes('<a class="skip" href="#main">'));
    check('ER-1 the line blog.error.text is in <main>', main.includes(`>${TEXT}</p>`));
    check('ER-1 header: the pill to the start page, the title of the Blog as a paragraph (the <h1> is the error), the feed pill', html.includes('<header class="top">') && html.includes('<a class="pill home" href="/">') && /<p class="ttl">Blog<span class="caret" aria-hidden="true"><\/span><\/p>/.test(html) && html.includes('<a class="pill feed" href="/blog/feed.xml"'));
    const back = [...html.matchAll(/<a class="pill pri back" href="([^"]*)">[\s\S]*?<span>([^<]*)<\/span><\/a>/g)].map((match) => [match[1], match[2]]);
    same('ER-1 one link to /blog/ with the text of blog.back', back, [['/blog/', BACK]]);
    check('ER-1 the footer of the other pages', /<footer class="site">\n<nav class="foot" aria-label="Website">/.test(html) && html.includes('<a href="/referenzen/">Referenzen</a>') && html.includes('<span class="pending"'));
    same('ER-1 <meta name="robots" content="noindex"> once', html.match(/<meta name="robots" content="noindex">/g).length, 1);
    check('ER-1 no canonical link and no description (a missing page is nobody\'s address)', !html.includes('rel="canonical"') && !html.includes('name="description"') && !html.includes('og:'));
    same('ER-1 no <script>, no inline handler', [/<script/i.test(html), /\son[a-z]+=/i.test(html)], [false, false]);
    check('ER-1 no frame, form, input, embed, object, media or inline style (PR-3)', !/<(iframe|form|input|embed|object|video|audio|style)\b/i.test(html) && !/\sstyle=/.test(html));
    const other = addresses(html).filter((value) => !(/^\/(?!\/)/.test(value) || value === '#main' || value === 'data:,' || value === 'mailto:info@dreambau.com'));
    same('ER-1 only root-relative addresses (besides the skip anchor, the icon data:, and the mailto of the footer)', other, []);
    check('ER-1 the one stylesheet is /blog/blog.css', [...html.matchAll(/<link rel="stylesheet" href="([^"]*)"/g)].map((match) => match[1]).join() === '/blog/blog.css');
    check(`ER-1 at most 8 KB (section 6): ${raw.length} bytes`, raw.length <= 8192, `${raw.length}`);
    check('ER-1 no run of two square brackets and no marker text (PF-12, LE-1)', !/\[\[|\]\]/.test(html) && !html.includes('RECHTSPRÜFUNG'));

    const entry = manifest.files.find((item) => item.path === '404.html');
    same('7.2 blog.json lists 404.html with its measured bytes and sha256', entry, digestTree(path.join(out, 'public')).filter((item) => item.path === '404.html')[0]);
    const paths = manifest.files.map((item) => item.path);
    same('7.2 the files of the manifest stay sorted by path with 404.html among them', paths, [...paths].sort());
  });

  // A second build gives the same bytes (BD-2); a blog without posts has the page too (the 404 does not depend on posts).
  withScratch('error-page-twice', (out) => {
    buildBlog({ postsDir: FIXTURES, outDir: path.join(out, 'a'), mode: 'preview' });
    buildBlog({ postsDir: FIXTURES, outDir: path.join(out, 'b'), mode: 'preview' });
    same('BD-2 two builds give the same 404.html', fs.readFileSync(path.join(out, 'a', 'public', '404.html')).equals(fs.readFileSync(path.join(out, 'b', 'public', '404.html'))), true);
    const empty = path.join(out, 'no-posts');
    fs.mkdirSync(empty);
    const manifest = buildBlog({ postsDir: empty, outDir: path.join(out, 'c'), mode: 'preview' });
    same('7.2 a blog without posts has 404.html, blog.css, blog.js, feed.xml and index.html', manifest.files.map((item) => item.path), ['404.html', 'blog.css', 'blog.js', 'feed.xml', 'index.html']);
    same('ER-1 the 404 of a blog without posts is the 404 of the demo build', fs.readFileSync(path.join(out, 'c', 'public', '404.html')).equals(fs.readFileSync(path.join(out, 'a', 'public', '404.html'))), true);
  });
});
