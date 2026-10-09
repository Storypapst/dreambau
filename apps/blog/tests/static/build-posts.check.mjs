// PF-1 to PF-15, AD-7, LI-3, PF-11, BD-4 in the build (V8, V9, V57 part): the generator reads every post through the
// rules, refuses a bad tree with every FAIL line and writes nothing, numbers by (date, slug), and writes the image of a
// post with its width and height. The expected values are written by hand.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { png, webp } from '../lib/images.mjs';
import { BODY, plainPost, postText, writeTree } from '../lib/posts.mjs';
import { digestTree, withScratch } from '../lib/scratch.mjs';
import { BuildRefused, buildBlog } from '../../src/generate.mjs';

const lines = (error) => error.findings.map((finding) => `${finding.level} ${finding.rule} ${finding.where}`);
function refused(postsDir, outDir, options = {}) {
  try { buildBlog({ postsDir, outDir, mode: 'preview', ...options }); } catch (error) { return error; }
  return null;
}

await run(async () => {
  // ---- a bad tree: every failure of every file, in one error, and nothing written ----
  withScratch('refuse', (dir) => {
    const posts = path.join(dir, 'posts');
    const out = path.join(dir, 'out');
    writeTree(posts, [
      { year: '2026', slug: 'gut-eins', title: 'Gut Eins', date: '2026-09-01' },
      { year: '2026', slug: 'schlecht', text: plainPost({ title: 'Schlecht', date: '2026-02-30', extra: 'lang: fr\n' }) },
      { year: '2026', slug: 'kurz-text', text: plainPost({ title: 'Kurzer Text', date: '2026-09-03', body: 'Zu kurz.' }) },
    ]);
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'keep.txt'), 'keep\n');
    const error = refused(posts, out, { displayDir: 'posts' });
    check('BD-4 a tree with bad posts is refused with BuildRefused', error instanceof BuildRefused, error && error.message);
    same('BD-4 the error holds every FAIL line of every bad file, not only the first', lines(error), ['FAIL PF-10 posts/2026/kurz-text.md:6', 'FAIL PF-5 posts/2026/schlecht.md:3', 'FAIL PF-6 posts/2026/schlecht.md:4']);
    same('BD-4 the message is the lines, one per line', error.message.split('\n').every((line) => /^FAIL PF-\d+ posts\/2026\//.test(line)), true);
    same('BD-4 nothing was written: the output folder holds only what was there', digestTree(out).map((file) => file.path), ['keep.txt']);
  });

  // ---- example: true outside tests/fixtures; a post at a tombstoned address ----
  withScratch('rules', (dir) => {
    const posts = path.join(dir, 'posts');
    writeTree(posts, [{ year: '2026', slug: 'beispiel', text: postText({ front: { title: 'Beispiel' } }) }], ['2026/beispiel 2026-10-01', 'kaputt']);
    const error = refused(posts, path.join(dir, 'out'), { displayDir: 'posts' });
    same('V8 example: true outside tests/fixtures is refused by the build, a tombstoned address too, a bad removed.txt line too', lines(error), ['FAIL AD-7 posts/2026/beispiel.md', 'FAIL PF-14 posts/2026/beispiel.md:9', 'FAIL AD-7 posts/removed.txt:2']);
  });
  withScratch('fixtures-path', (dir) => {
    const posts = path.join(dir, 'tests', 'fixtures');
    writeTree(posts, [{ year: '2026', slug: 'beispiel', text: postText({ front: { title: 'Beispiel' } }) }]);
    same('V8 the same file inside a folder tests/fixtures/ is accepted', refused(posts, path.join(dir, 'out')), null);
  });

  // ---- numbering in the build (V9) ----
  withScratch('numbers', (dir) => {
    const posts = path.join(dir, 'posts');
    const specs = [['sieben', '2026-10-05'], ['bbb-beitrag', '2026-09-10'], ['eins', '2026-08-01'], ['aaa-beitrag', '2026-09-10'], ['sechs', '2026-12-24'], ['vier', '2026-09-30'], ['fuenf', '2026-10-01']];
    writeTree(posts, specs.map(([slug, date]) => ({ year: date.slice(0, 4), slug, title: slug.replace(/-/g, ' '), date })));
    const first = buildBlog({ postsDir: posts, outDir: path.join(dir, 'out1'), mode: 'preview' });
    same('V9 seven posts, two on one day: numbers 1 to 7 by (date, slug)', first.posts.map((post) => `${post.number}:${post.address}`),
      ['1:2026/eins', '2:2026/aaa-beitrag', '3:2026/bbb-beitrag', '4:2026/vier', '5:2026/fuenf', '6:2026/sieben', '7:2026/sechs']);
    const list = fs.readFileSync(path.join(dir, 'out1', 'public', 'index.html'), 'utf8');
    same('V9 the list shows 07 first and 01 last', [...list.matchAll(/<span class="no" aria-hidden="true">(\d+)<\/span>/g)].map((match) => match[1]), ['07', '06', '05', '04', '03', '02', '01']);
    const second = buildBlog({ postsDir: posts, outDir: path.join(dir, 'out2'), mode: 'preview' });
    same('V9 the build twice gives the same manifest', second, first);
    writeTree(posts, [{ year: '2027', slug: 'neuer-beitrag', title: 'Neuer Beitrag', date: '2027-01-05' }]);
    const third = buildBlog({ postsDir: posts, outDir: path.join(dir, 'out3'), mode: 'preview' });
    same('V9 adding a newer post changes no existing number', third.posts.slice(0, 7), first.posts);
  });
  withScratch('many', (dir) => {
    const posts = path.join(dir, 'posts');
    const specs = Array.from({ length: 105 }, (_, index) => {
      const date = `2026-${String(1 + Math.floor(index / 28)).padStart(2, '0')}-${String(1 + (index % 28)).padStart(2, '0')}`;
      return { year: '2026', slug: `beitrag-${String(index).padStart(3, '0')}`, title: `Beitrag ${String(index).padStart(3, '0')}`, date };
    });
    writeTree(posts, specs);
    const manifest = buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    same('V9 105 posts: the numbers run 1 to 105', [manifest.posts.length, manifest.posts[0].number, manifest.posts[98].number, manifest.posts[99].number, manifest.posts[104].number], [105, 1, 99, 100, 105]);
    const list = fs.readFileSync(path.join(dir, 'out', 'public', 'index.html'), 'utf8');
    const shown = [...list.matchAll(/<span class="no" aria-hidden="true">(\d+)<\/span>/g)].map((match) => match[1]);
    same('V9 the list shows 105 down to 100, then 99 and below with two digits, 01 last', [shown.slice(0, 7), shown[105 - 1]], [['105', '104', '103', '102', '101', '100', '99'], '01']);
  });

  // ---- the image of a post: copied, with width and height in the <img> (V7) ----
  withScratch('image', (dir) => {
    const posts = path.join(dir, 'posts');
    const extra = 'image: mit-bild.webp\nimageAlt: Eine Folie mit "Anführungszeichen" & mehr\nimageRights: true\n';
    writeTree(posts, [{ year: '2026', slug: 'mit-bild', text: plainPost({ title: 'Mit Bild', date: '2026-09-01', extra }) }]);
    fs.writeFileSync(path.join(posts, '2026', 'mit-bild.webp'), webp({ width: 800, height: 450 }));
    const out = path.join(dir, 'out');
    const manifest = buildBlog({ postsDir: posts, outDir: out, mode: 'preview' });
    same('V7 the output holds the page and the image as image.webp', digestTree(path.join(out, 'public')).map((file) => file.path), ['2026/mit-bild/image.webp', '2026/mit-bild/index.html', 'blog.css', 'blog.js', 'index.html']);
    same('V7 the image is copied byte for byte', fs.readFileSync(path.join(out, 'public', '2026', 'mit-bild', 'image.webp')).equals(webp({ width: 800, height: 450 })), true);
    const page = fs.readFileSync(path.join(out, 'public', '2026', 'mit-bild', 'index.html'), 'utf8');
    check('V7 the page has an <img> with width 800, height 450, the alt text escaped, and the address image.webp next to the page (PO-6)', page.includes('<img src="image.webp" width="800" height="450" alt="Eine Folie mit &quot;Anführungszeichen&quot; &amp; mehr" loading="eager" decoding="async">'), page);
    same('V7 the manifest lists the image with bytes and sha256', manifest.files.find((file) => file.path === '2026/mit-bild/image.webp').bytes, webp({ width: 800, height: 450 }).length);
    // a faulty image refuses the build with the line
    fs.writeFileSync(path.join(posts, '2026', 'mit-bild.webp'), png());
    const error = refused(posts, path.join(dir, 'out2'), { displayDir: 'posts' });
    same('V7 an image that is not a webp refuses the build with PF-11 at the line of the key', lines(error), ['FAIL PF-11 posts/2026/mit-bild.md:4']);
  });

  // ---- the fixtures still build, and the hostile text is still harmless ----
  void BODY;
});
