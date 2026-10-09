// BD-9 and V46: every validator of this slice has a deliberately broken input that must fail with the EXACT line of its
// row. A check that never failed has not been shown to work. One row per validator; the lines are written out in full.
import fs from 'node:fs';
import path from 'node:path';
import { same, run } from '../lib/check.mjs';
import { png, pngChunk, webp, riffChunk } from '../lib/images.mjs';
import { bodyOf, plainPost, postText, writeTree } from '../lib/posts.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { format } from '../../src/lib/findings.mjs';
import { parsePostText } from '../../src/lib/frontmatter.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';
import { checkTree, loadTreeFromDir } from '../../src/lib/tree.mjs';

const FILE = 'tests/fixtures/2026/ein-film.md';
const post = (text, options = {}) => checkPostText(text, { file: FILE, fixture: true, ...options }).findings.map(format);
const SLUG_TEXT = 'lower case letters, digits and single dashes, 3 to 60 characters';

await run(async () => {
  same('BD-9 the reader: a file without --- (PF-2)', parsePostText('title: x\n', FILE).findings.map(format), [`FAIL PF-2 ${FILE}:1: the file must start with a line ---`]);
  same('BD-9 the reader: a repeated key (PF-3)', post(postText({ lines: ['title: Eins', 'date: 2026-10-02', 'title: Zwei'] })), [`FAIL PF-3 ${FILE}:4: the key title appears twice (first at line 2)`]);
  same('BD-9 the title: 101 characters (PF-4)', post(postText({ front: { title: 'a'.repeat(101) } })), [`FAIL PF-4 ${FILE}:2: the title has 101 characters; it needs 1 to 100`]);
  same('BD-9 the date: 2026-02-30 (PF-5)', post(postText({ front: { date: '2026-02-30' } })), [`FAIL PF-5 ${FILE}:3: the date "2026-02-30" is not a real calendar date written YYYY-MM-DD`]);
  same('BD-9 lang: fr (PF-6)', post(postText({ front: { lang: 'fr' } })), [`FAIL PF-6 ${FILE}:4: lang "fr" is not one of de, en`]);
  same('BD-9 the source link: http:// (PF-7)', post(postText({ front: { sourceLink: 'http://videos.example.test/x' } })), [`FAIL PF-7 ${FILE}:5: the source link must start with https:// (no http:, no other scheme)`]);
  same('BD-9 the source title without a link (PF-8)', post(postText({ front: { sourceLink: undefined } })), [`FAIL PF-8 ${FILE}:5: sourceTitle is only allowed together with sourceLink`]);
  same('BD-9 a quote of 281 characters (PF-9)', post(postText({ front: { quote: 'x'.repeat(281) } })), [`FAIL PF-9 ${FILE}:7: the quote has 281 characters; it needs at most 280`]);
  same('BD-9 a body of 299 characters (PF-10)', post(postText({ body: bodyOf(299) })), [`FAIL PF-10 ${FILE}:12: the body has 299 characters; it needs 300 to 1200`]);
  const faulty = png({ extra: [pngChunk('tEXt', Buffer.from('a\0b'))] });
  same('BD-9 an image with a tEXt chunk (PF-11)', post(postText({ front: { image: 'ein-film.png', imageAlt: 'Ein Bild', imageRights: 'true' } }), { readImage: () => faulty }), [`FAIL PF-11 ${FILE}:10: the file has a tEXt chunk (metadata is refused)`]);
  same('BD-9 an image with an EXIF chunk in a webp (PF-11)', post(postText({ front: { image: 'ein-film.webp', imageAlt: 'Ein Bild', imageRights: 'true' } }), { readImage: () => webp({ extra: [riffChunk('EXIF', Buffer.alloc(4))] }) }), [`FAIL PF-11 ${FILE}:10: the file has an EXIF chunk (metadata is refused)`]);
  same('BD-9 a zero-width space (PF-12)', post(postText({ body: `${bodyOf(309)}​` })), [`FAIL PF-12 ${FILE}:12: zero-width character U+200B at character 310`]);
  same('BD-9 a file name that is no slug (PF-1)', checkPostText(plainPost({ title: 'Ein Film', date: '2026-10-02' }), { file: 'posts/2026/Ein_Film.md' }).findings.map(format), [`FAIL PF-1 posts/2026/Ein_Film.md: the file name "Ein_Film" is not a slug: ${SLUG_TEXT}`]);
  same('BD-9 example: true outside tests/fixtures (PF-14)', checkPostText(postText(), { file: 'posts/2026/ein-film.md' }).findings.map(format), ['FAIL PF-14 posts/2026/ein-film.md:9: example: true is only allowed under tests/fixtures/']);

  withScratch('controls', (dir) => {
    const base = writeTree(path.join(dir, 'base'), [{ year: '2026', slug: 'alpha-eins', title: 'Alpha Eins', date: '2026-03-01' }, { year: '2026', slug: 'beta-zwei', title: 'Beta Zwei', date: '2026-05-01' }], ['2026/weg 2026-01-01']);
    const head = path.join(dir, 'head');
    const lines = (change) => {
      fs.rmSync(head, { recursive: true, force: true });
      fs.cpSync(base, head, { recursive: true });
      change();
      return checkTree({ head: loadTreeFromDir(head), base: loadTreeFromDir(base), headDir: head, displayDir: 'posts', now: new Date('2026-10-09T10:00:00Z') }).map(format);
    };
    same('BD-9 a new post with another name than its slug (PF-13)', lines(() => writeTree(head, [{ year: '2026', slug: 'falscher-name', title: 'Größe & Maß', date: '2026-09-01' }])),
      ['FAIL PF-13 posts/2026/falscher-name.md: the file name is falscher-name but the slug of the title is groesse-mass; a new post must be named by its title']);
    same('BD-9 a new post before the newest on origin/main (PF-5)', lines(() => writeTree(head, [{ year: '2026', slug: 'zu-frueh', title: 'Zu frueh', date: '2026-04-01' }])),
      ['FAIL PF-5 posts/2026/zu-frueh.md:3: this new post (2026-04-01, zu-frueh) sorts before the newest post on origin/main (2026/beta-zwei, 2026-05-01); a new post must come after it, or the numbers of published posts change. Set date to 2026-05-01 or later']);
    same('BD-9 a deleted post (AD-6)', lines(() => fs.rmSync(path.join(head, '2026', 'beta-zwei.md'))),
      ['FAIL AD-6 posts/2026/beta-zwei.md: the post 2026/beta-zwei exists on origin/main but is missing here (deleted or renamed); the address of a published post must not change. If it is to be removed, list it in posts/removed.txt']);
    same('BD-9 a date moved within the year (WARN AD-6)', lines(() => fs.writeFileSync(path.join(head, '2026', 'beta-zwei.md'), plainPost({ title: 'Beta Zwei', date: '2026-05-02' }))),
      ['WARN AD-6 posts/2026/beta-zwei.md:3: the date changed from 2026-05-01 to 2026-05-02; the published value of the feed changes']);
    same('BD-9 a post at a removed address (AD-7)', lines(() => { writeTree(head, [{ year: '2026', slug: 'weg', title: 'Weg', date: '2026-09-01' }]); }),
      ['FAIL AD-7 posts/2026/weg.md: the address 2026/weg is in removed.txt and may never be used again',
        'FAIL PF-13 posts/2026/weg.md: the file name is weg but the slug of the title is weg-2 (the plain slug is taken, so the first free suffix); a new post must be named by its title']);
  });
});
