// V14 (FD-1 to FD-5, AD-3), BD-2: the feed in the build. The demo build holds a feed that the offline validator passes
// and that carries the seven fixture posts as the files say; the feed for three posts, for none and for 55 is well-formed
// Atom with the entries the rules give. The expected values come from the fixture files and from hand-made posts.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { DEMO, paragraphsOf } from '../lib/demo.mjs';
import { ATOM } from '../lib/feedtext.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { plainPost, writeTree } from '../lib/posts.mjs';
import { digestTree, withScratch } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';
import { checkFeed } from '../../src/lib/feed-check.mjs';
import { format } from '../../src/lib/findings.mjs';
import { LABELS_FILE, loadLabels } from '../../src/lib/labels.mjs';
import { parseXml } from '../../src/lib/xml.mjs';

const labels = loadLabels(LABELS_FILE);
const problems = (text) => checkFeed(text, { labels }).map(format);
const child = (element, name) => element.elements().find((e) => e.local === name);
const entriesOf = (text) => parseXml(text).root.elements().filter((e) => e.local === 'entry');
const frontOf = (slug, key) => (new RegExp(`^${key}: "?(.*?)"?$`, 'm').exec(fs.readFileSync(path.join(FIXTURES, '2026', `${slug}.md`), 'utf8')) || [])[1];

function buildInto(dir, specs) {
  const posts = path.join(dir, 'posts');
  writeTree(posts, specs);
  buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
  return fs.readFileSync(path.join(dir, 'out', 'public', 'feed.xml'), 'utf8');
}

await run(async () => {
  // ---- the demo build: seven fixture posts ----
  withScratch('feed-demo', (dir) => {
    const manifest = buildBlog({ postsDir: FIXTURES, outDir: dir, mode: 'preview' });
    const text = fs.readFileSync(path.join(dir, 'public', 'feed.xml'), 'utf8');
    check('FD-1 the build writes public/feed.xml, and the manifest lists it with its bytes and sha256', manifest.files.some((file) => file.path === 'feed.xml' && file.bytes === Buffer.byteLength(text) && /^[0-9a-f]{64}$/.test(file.sha256)));
    same('FD-1 the offline validator finds nothing in the demo feed', problems(text), []);
    const { root } = parseXml(text);
    same('FD-2 the feed level: title, subtitle, id, language and author', [child(root, 'title').text(), child(root, 'subtitle').text(), child(root, 'id').text(), root.attrs.get('xml:lang'), child(child(root, 'author'), 'name').text(), root.ns], [
      'Blog · dreambau.com', 'Zitate und Links, dazu warum es lohnt.', 'https://dreambau.com/blog/', 'de', 'dreambau.com', ATOM]);
    same('FD-2 updated is the newest entry\'s: the date of the newest fixture', child(root, 'updated').text(), '2026-10-02T00:00:00Z');
    const entries = entriesOf(text);
    same('FD-3 seven entries, newest first, ids are the post addresses', entries.map((entry) => child(entry, 'id').text()), DEMO.map((demo) => `https://dreambau.com/blog/2026/${demo.slug}/`));
    same('FD-3 published and updated are the date + T00:00:00Z', entries.map((entry) => [child(entry, 'published').text(), child(entry, 'updated').text()]), DEMO.map((demo) => [`${demo.date}T00:00:00Z`, `${demo.date}T00:00:00Z`]));
    same('FD-3 the summary is the full text "Warum lesenswert", paragraphs one blank line apart (read from the fixture files)', entries.map((entry) => child(entry, 'summary').text()), DEMO.map((demo) => paragraphsOf(demo).join('\n\n')));
    same('FD-3 the title of each entry is the title of its post', entries.map((entry) => child(entry, 'title').text()), DEMO.map((demo) => demo.title));
    same('FD-3 a related link exists only with a source, and carries the source link and title of the file', entries.map((entry) => entry.elements().find((e) => e.attrs.get('rel') === 'related')).map((link) => (link ? [link.attrs.get('href'), link.attrs.get('title')] : null)),
      DEMO.map((demo) => (demo.source ? [frontOf(demo.slug, 'sourceLink'), frontOf(demo.slug, 'sourceTitle')] : null)));
    same('FD-3 xml:lang="en" is on the English entry only', entries.map((entry) => entry.attrs.get('xml:lang')), DEMO.map((demo) => (demo.en ? 'en' : undefined)));
    check('BD-2 a second build gives the same feed, byte for byte, and the same manifest', (() => {
      const again = buildBlog({ postsDir: FIXTURES, outDir: dir, mode: 'preview' });
      return again.files.find((file) => file.path === 'feed.xml').sha256 === manifest.files.find((file) => file.path === 'feed.xml').sha256 && JSON.stringify(again) === JSON.stringify(manifest);
    })());
  });

  // ---- three posts, none, and 55 (V14) ----
  withScratch('feed-three', (dir) => {
    const text = buildInto(dir, [
      { year: '2026', slug: 'eins-beitrag', title: 'Eins Beitrag', date: '2026-08-01' },
      { year: '2026', slug: 'zwei-beitrag', title: 'Zwei & Zwei', date: '2026-09-01', text: plainPost({ title: 'Zwei & Zwei', date: '2026-09-01', extra: 'sourceLink: https://quelle.example.test/a?x=1&y=2\nsourceTitle: Eine Quelle\n' }) },
      { year: '2025', slug: 'drei-beitrag', title: 'Drei Beitrag', date: '2025-12-24' },
    ]);
    same('V14 three posts: well-formed, valid', problems(text), []);
    same('V14 three posts: newest first by date across the years', entriesOf(text).map((entry) => child(entry, 'id').text().slice('https://dreambau.com/blog/'.length)), ['2026/zwei-beitrag/', '2026/eins-beitrag/', '2025/drei-beitrag/']);
    same('V14 three posts: the related link exists on the post with a source only', entriesOf(text).map((entry) => entry.elements().some((e) => e.attrs.get('rel') === 'related')), [true, false, false]);
    check('FD-4 the ampersand of the title and of the link is escaped in the file', text.includes('<title>Zwei &amp; Zwei</title>') && text.includes('href="https://quelle.example.test/a?x=1&amp;y=2"'));
  });
  withScratch('feed-none', (dir) => {
    const text = buildInto(dir, []);
    same('V14 no post: the empty feed has the 1970 date and no entry, and passes', [problems(text), child(parseXml(text).root, 'updated').text(), entriesOf(text).length], [[], '1970-01-01T00:00:00Z', 0]);
  });
  withScratch('feed-many', (dir) => {
    const specs = Array.from({ length: 55 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      const date = `2026-${index < 28 ? '01' : '02'}-${String((index % 28) + 1).padStart(2, '0')}`;
      return { year: '2026', slug: `beitrag-${number}`, text: plainPost({ title: `Beitrag ${number}`, date, extra: index === 54 ? 'lang: en\n' : '' }) };
    });
    const text = buildInto(dir, specs);
    const entries = entriesOf(text);
    same('V14 55 posts: well-formed, valid', problems(text), []);
    same('V14 55 posts: exactly the 50 newest, from beitrag-55 down to beitrag-06', [entries.length, child(entries[0], 'id').text(), child(entries[49], 'id').text()], [50, 'https://dreambau.com/blog/2026/beitrag-55/', 'https://dreambau.com/blog/2026/beitrag-06/']);
    same('V14 55 posts: xml:lang="en" on the English entry only', entries.map((entry, index) => [index, entry.attrs.get('xml:lang')]).filter(([, lang]) => lang !== undefined), [[0, 'en']]);
    same('V14 55 posts: the list page still has all 55 rows (only the feed is limited)', (fs.readFileSync(path.join(dir, 'out', 'public', 'index.html'), 'utf8').match(/<li class="row">/g) || []).length, 55);
    same('V14 55 posts: updated of the feed is that of the newest entry', child(parseXml(text).root, 'updated').text(), '2026-02-27T00:00:00Z');
  });

  // ---- the build keeps its promises about files ----
  withScratch('feed-files', (dir) => {
    buildInto(dir, [{ year: '2026', slug: 'eins-beitrag', title: 'Eins Beitrag', date: '2026-08-01' }]);
    same('AD-1 the output of one post: the page, the list, the 404 page, the feed, the stylesheet, the script', digestTree(path.join(dir, 'out', 'public')).map((file) => file.path), ['2026/eins-beitrag/index.html', '404.html', 'blog.css', 'blog.js', 'feed.xml', 'index.html']);
  });
});
