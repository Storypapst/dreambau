// The markup of the list and the post page as the generator writes it (PO-1, PO-2, PO-4, PO-5, PO-6, PO-11, LG-2, LG-5,
// LG-6, LI-8) and the shipped files blog.css and blog.js (PF-12, the size of blog.css). The pages are read as text; what
// a browser makes of them is in tests/browser/. The expected values are typed by hand from the fixture files.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { FIXTURES, ROOT } from '../lib/paths.mjs';
const ASSETS = path.join(ROOT, 'src');
import { BODY, plainPost } from '../lib/posts.mjs';
import { digestTree, withScratch, writePost } from '../lib/scratch.mjs';
import { LIST_LIMIT, buildBlog } from '../../src/generate.mjs';

const read = (out, ...parts) => fs.readFileSync(path.join(out, 'public', ...parts), 'utf8');
const metaOf = (html) => [...html.matchAll(/<meta ([^>]*)>/g)].map((match) => match[1]);
const sectionNames = (html) => [...html.matchAll(/<h2 class="(?:sech|shd)"[^>]*>([^<]*)<\/h2>/g)].map((match) => match[1]);
const MIDDLE = '2026/warum-bei-uns-der-text-zuerst-kommt';
const ENGLISH = '2026/small-is-a-habit';
const NOSOURCE = '2026/notiz-aus-der-werkstatt';

await run(async () => {
  withScratch('pages', (out) => {
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: out, mode: 'preview' });
    const page = read(out, MIDDLE, 'index.html');

    // ---- PO-1: the head ----
    check('PO-1 <title> is "<title of the post> · Blog · dreambau.com"', page.includes('<title>Warum bei uns der Text zuerst kommt · Blog · dreambau.com</title>'));
    const description = /<meta name="description" content="([^"]*)">/.exec(page)[1];
    const body = 'Ein kurzer Artikel über die Reihenfolge beim Bauen einer Seite: erst der Text, dann alles andere. Er begründet, warum eine schmale Lesespalte kein Verlust ist, sondern die halbe Arbeit, und er zeigt das an kleinen Beispielen, die man in fünf Minuten nachbauen kann.';
    check('PO-1 description is the first 160 code points of the body, cut at a word boundary', [...description].length <= 160 && body.startsWith(description) && /[ ,]/.test(body[description.length]) && [...description].length > 140, `${[...description].length}`);
    check('PO-1 canonical is the absolute address of the post', page.includes(`<link rel="canonical" href="https://dreambau.com/blog/${MIDDLE}/">`));
    same('PO-1 the Open Graph tags are title, description, type article, url and (post with an image) image, as plain <meta>', metaOf(page).filter((meta) => meta.startsWith('property=')), [
      'property="og:title" content="Warum bei uns der Text zuerst kommt"', `property="og:description" content="${description}"`, 'property="og:type" content="article"',
      `property="og:url" content="https://dreambau.com/blog/${MIDDLE}/"`, `property="og:image" content="https://dreambau.com/blog/${MIDDLE}/image.png"`]);
    check('PO-1 a post without an image has no og:image', !read(out, NOSOURCE, 'index.html').includes('og:image'));
    const head = /<head>([\s\S]*?)<\/head>/.exec(page)[1];
    same('PO-1 no other tag of the head holds a web address than canonical and the three og tags (PR-3); the icon is data:,', [...head.matchAll(/(?:href|content|src)="((?:https?:)?\/\/[^"]*)"/g)].map((match) => match[1]).sort(), [`https://dreambau.com/blog/${MIDDLE}/`, `https://dreambau.com/blog/${MIDDLE}/`, `https://dreambau.com/blog/${MIDDLE}/image.png`]);
    check('PO-1 <html lang="de" dir="ltr"> and the post language on <article>', page.startsWith('<!doctype html>\n<html lang="de" dir="ltr">') && /<article class="post" lang="de">/.test(page));

    // ---- PO-2: the order inside <main> ----
    const order = (html, pattern) => [...html.matchAll(pattern)].map((match) => match[1]);
    same('PO-2 meta line, h1, blockquote, figure, section "Warum lesenswert", section "Quelle", nav, aside, in this order', order(page, /<(p class="tx pmeta"|h1|blockquote|figure|section class="why"|section class="src"|nav class="pn"|aside)[ >]/g), ['p class="tx pmeta"', 'h1', 'blockquote', 'figure', 'section class="why"', 'section class="src"', 'nav class="pn"', 'aside']);
    same('PO-2 the headings are Warum lesenswert, Quelle and Zu diesem Beitrag (h2)', sectionNames(page), ['Warum lesenswert', 'Quelle', 'Zu diesem Beitrag']);
    same('PO-2 one <p> per paragraph under "Warum lesenswert"', (/<section class="why"[\s\S]*?<\/section>/.exec(page)[0].match(/<p class="tx prose">/g) || []).length, 3);
    check('PO-2 the nav is named "Weitere Beiträge" (blog.post.nav)', page.includes('<nav class="pn" aria-label="Weitere Beiträge">'));

    // ---- PO-4: the source section ----
    check('PO-4 the link text is sourceTitle; the link carries rel="noreferrer noopener" and no target', page.includes('<a class="sk" href="https://artikel.example.test/text-zuerst" rel="noreferrer noopener">Text zuerst: warum eine schmale Spalte genügt</a>') && !/target=/.test(page));
    check('PO-4 the displayed host follows, then the line blog.source.leads with {site} replaced', page.includes('<p class="sw">artikel.example.test</p>') && page.includes('<p class="sn">Führt zu artikel.example.test. Nichts ist eingebettet.</p>'));
    check('PO-4 a post without sourceLink has no "Quelle" section and no source mark', !/class="src"/.test(read(out, NOSOURCE, 'index.html').replace(/<span class="mk src"/g, '')) && !read(out, NOSOURCE, 'index.html').includes('class="mk src"') && !read(out, NOSOURCE, 'index.html').includes('Führt zu'));
    // ---- PO-5: the quote ----
    check('PO-5 the quote is a <blockquote> with one <p> and the source as text in its <footer>; it is no link', /<blockquote class="tx qt"><p>Eine schmale Spalte ist kein Verlust, sie ist die halbe Arbeit\.<\/p><footer>aus dem Artikel „Text zuerst“<\/footer><\/blockquote>/.test(page.replace(/>\s+</g, '><')) && !/<blockquote[\s\S]*<a\b[\s\S]*<\/blockquote>/.test(page));
    // ---- PO-6: the image ----
    check('PO-6 <img src="image.png" width height alt loading="eager" decoding="async">, no srcset, in a <figure> without caption', page.includes('<img src="image.png" width="960" height="540" alt="Ein dunkles Bild mit einem Raster aus bunten Zeichen und einer leeren Fläche in der Mitte" loading="eager" decoding="async">') && !/srcset|figcaption/.test(page));
    same('PO-6 the image is a file of the output next to the page, byte for byte', fs.readFileSync(path.join(out, 'public', MIDDLE, 'image.png')).equals(fs.readFileSync(path.join(FIXTURES, '2026', 'warum-bei-uns-der-text-zuerst-kommt.png'))), true);

    // ---- LG-2: a post in English ----
    const english = read(out, ENGLISH, 'index.html');
    check('LG-2 <article lang="en"> holds lang="en" on the title, every paragraph and the source link text', /<article class="post" lang="en">/.test(english) && /<h1 class="tx ptitle" lang="en">Small is a habit<\/h1>/.test(english) && (english.match(/<p class="tx prose" lang="en">/g) || []).length === 3 && /rel="noreferrer noopener" lang="en">Small is a habit/.test(english));
    check('LG-2 the labels around an English post are German and say so: lang="de" on the headings, the mark group, the note, the nav and the aside', ['<h2 class="sech" id="why-h" lang="de">', '<h2 class="sech" id="src-h" lang="de">', '<span class="mks" lang="de">', '<p class="sn" lang="de">', '<nav class="pn" aria-label="Weitere Beiträge" lang="de">', '<aside class="facts" aria-labelledby="facts-h" lang="de">'].every((piece) => english.includes(piece)));
    check('LG-2 the mark EN has its hidden words and a title', english.includes('<span class="en" title="Beitrag auf Englisch"><span aria-hidden="true">EN</span><span class="sr">Beitrag auf Englisch</span></span>'.replace(/></g, '>\n<')) || english.replace(/>\s+</g, '><').includes('<span class="en" title="Beitrag auf Englisch"><span aria-hidden="true">EN</span><span class="sr">Beitrag auf Englisch</span></span>'));
    check('LG-2 the language fact says Englisch in the aside', english.replace(/>\s+</g, '><').includes('<dt>Sprache</dt><dd>Englisch</dd>'));

    // ---- LG-5, LG-6: nothing of the template is left over ----
    for (const file of ['index.html', ...manifest.posts.map((post) => `${post.address}/index.html`)]) {
      const html = read(out, file);
      check(`LG-5 ${file}: no placeholder is left (no { in the markup) and no raw label key (blog.*)`, !/[{}]/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')) && !/\bblog\.[a-z]+\.?[a-z.]*\b/.test(html.replace(/https?:\/\/\S+|\/blog\/[^\s"]*|blog\.(?:css|js)/g, '')), file);
    }

    // ---- PO-11: the size of a post page ----
    for (const post of manifest.posts) {
      const bytes = fs.statSync(path.join(out, 'public', post.address, 'index.html')).size;
      check(`PO-11 ${post.address}: the page is at most 24 KB without its image (${bytes} bytes)`, bytes <= 24 * 1024, String(bytes));
    }

    // ---- the shipped files ----
    const tokens = fs.readFileSync(path.join(ASSETS, 'tokens.css'), 'utf8');
    const css = fs.readFileSync(path.join(ASSETS, 'blog.css'), 'utf8');
    const shipped = fs.readFileSync(path.join(out, 'public', 'blog.css'), 'utf8');
    same('AD-1 public/blog.css is tokens.css followed by blog.css', shipped, `${tokens.replace(/\n$/, '')}\n${css}`);
    same('AD-1 public/blog.js is src/blog.js', fs.readFileSync(path.join(out, 'public', 'blog.js'), 'utf8'), fs.readFileSync(path.join(ASSETS, 'blog.js'), 'utf8'));
    check(`BD-10 the shipped blog.css is ${Buffer.byteLength(shipped)} bytes, under the starting budget of 24,576`, Buffer.byteLength(shipped) <= 24576, String(Buffer.byteLength(shipped)));
    check(`BD-10 blog.js is ${Buffer.byteLength(fs.readFileSync(path.join(ASSETS, 'blog.js')))} bytes, under 2,048`, Buffer.byteLength(fs.readFileSync(path.join(ASSETS, 'blog.js'))) <= 2048);
    const manifestSizes = Object.fromEntries(manifest.files.filter((file) => /^blog\.(css|js)$/.test(file.path)).map((file) => [file.path, file.bytes]));
    same('BD-2 blog.json records the measured size of the shipped blog.css and blog.js', manifestSizes, { 'blog.css': Buffer.byteLength(shipped), 'blog.js': fs.statSync(path.join(ASSETS, 'blog.js')).size });
  });

  // ---- PO-4: a source without a title shows the host alone, as punycode ----
  withScratch('source', (dir) => {
    const posts = path.join(dir, 'posts');
    writePost(posts, '2026/ohne-titel.md', plainPost({ title: 'Ohne Titel', date: '2026-09-01', extra: 'sourceLink: "https://bücher.example.test/a?b=1"\n' }));
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    const html = fs.readFileSync(path.join(dir, 'out', 'public', '2026/ohne-titel/index.html'), 'utf8');
    check('PO-4 without sourceTitle the link text is the host alone, in its ASCII (punycode) form, and so is the line below it', html.includes('rel="noreferrer noopener">xn--bcher-kva.example.test</a>') && html.includes('Führt zu xn--bcher-kva.example.test.'), (/<div class="tx srcbox">[\s\S]*?<\/div>/.exec(html) || [''])[0]);
  });

  // ---- LI-8: the list is never cut; over 128 KiB it fails with OP-11 ----
  withScratch('limit', (dir) => {
    same('LI-8 the limit is 128 KiB', LIST_LIMIT, 131072);
    const posts = path.join(dir, 'posts');
    for (let index = 0; index < 5; index += 1) writePost(posts, `2026/beitrag-${index}.md`, plainPost({ title: `Beitrag ${index}`, date: `2026-09-0${index + 1}` }));
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'a'), mode: 'preview' });
    const size = fs.statSync(path.join(dir, 'a', 'public', 'index.html')).size;
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'b'), mode: 'preview', listLimit: size });
    check(`LI-8 a list of exactly the limit (${size} bytes) is built`, fs.existsSync(path.join(dir, 'b', 'public', 'index.html')));
    let message = '';
    try { buildBlog({ postsDir: posts, outDir: path.join(dir, 'c'), mode: 'preview', listLimit: size - 1 }); } catch (error) { message = error.message; }
    check('LI-8 a list one byte over the limit fails with a FAIL LI-8 line that names OP-11', /^FAIL LI-8 index\.html: /.test(message) && /OP-11/.test(message), message);
    check('LI-8 ... and writes nothing', !fs.existsSync(path.join(dir, 'c')));
  });
  // The real limit, with real posts: enough posts to pass 128 KiB make the real build fail; the list is not cut.
  withScratch('limit-real', (dir) => {
    const posts = path.join(dir, 'posts');
    for (let index = 0; index < 400; index += 1) {
      const name = String(index).padStart(3, '0');
      const year = 2000 + Math.floor(index / 336);
      const rest = index % 336;
      writePost(posts, `${year}/beitrag-${name}.md`, plainPost({ title: `Beitrag Nummer ${name} mit einem etwas längeren Titel`, date: `${year}-${String(1 + Math.floor(rest / 28)).padStart(2, '0')}-${String(1 + (rest % 28)).padStart(2, '0')}`, body: `${BODY}` }));
    }
    let message = '';
    try { buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' }); } catch (error) { message = error.message; }
    check('LI-8 400 posts exceed the real limit: the build fails with the OP-11 line and writes nothing', /^FAIL LI-8 index\.html: /.test(message) && /OP-11/.test(message) && !fs.existsSync(path.join(dir, 'out')), message.slice(0, 200));
  });

  // ---- PF-12: the shipped files are checked like a post ----
  for (const [file, text] of [['blog.css', '.x{content:"[["}\n'], ['blog.js', 'const a = [[1]];\n']]) {
    withScratch('assets', (dir) => {
      const assets = path.join(dir, 'assets');
      fs.mkdirSync(assets);
      for (const name of ['tokens.css', 'blog.css', 'blog.js']) fs.copyFileSync(path.join(ASSETS, name), path.join(assets, name));
      fs.appendFileSync(path.join(assets, file), text);
      let message = '';
      try { buildBlog({ postsDir: FIXTURES, outDir: path.join(dir, 'out'), mode: 'preview', assetsDir: assets }); } catch (error) { message = error.message; }
      check(`PF-12 a run of two square brackets in ${file} refuses the build with the line naming the file`, message.startsWith(`FAIL PF-12 ${file}: `), message);
      check(`PF-12 ... and nothing is written (${file})`, !fs.existsSync(path.join(dir, 'out')));
    });
  }
  void ROOT; void digestTree;
});
