// FD-1 to FD-5, AD-3: the Atom feed as text. The expected documents are written out by hand, character for character,
// from the rules of spec 5.1; nothing here recomputes what the generator computes.
import { check, same, run } from '../lib/check.mjs';
import { ATOM } from '../lib/feedtext.mjs';
import { feedXml } from '../../src/lib/feed.mjs';
import { loadLabels, LABELS_FILE } from '../../src/lib/labels.mjs';
import { numberPosts } from '../../src/lib/numbering.mjs';
import { parseXml } from '../../src/lib/xml.mjs';

const labels = loadLabels(LABELS_FILE);
const SUBTITLE = 'Zitate und Links, dazu warum es lohnt.'; // the German text of blog.sub, typed here

let counter = 0;
function post(front = {}) {
  counter += 1;
  const slug = front.slug || `beitrag-${String(counter).padStart(3, '0')}`;
  const rest = { ...front };
  delete rest.slug;
  return { year: '2026', slug, address: `2026/${slug}`, file: `2026/${slug}.md`, title: `Beitrag ${counter}`, date: '2026-03-01', lang: 'de', paragraphs: [`Absatz eins von ${counter}.`, `Absatz zwei von ${counter}.`], ...rest };
}
const feed = (posts) => feedXml({ labels, posts: numberPosts(posts) });

// ---- the empty blog (FD-5) ----
const EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM}" xml:lang="de">
<id>https://dreambau.com/blog/</id>
<title>Blog · dreambau.com</title>
<subtitle>${SUBTITLE}</subtitle>
<link rel="self" type="application/atom+xml" href="https://dreambau.com/blog/feed.xml"/>
<link rel="alternate" type="text/html" href="https://dreambau.com/blog/"/>
<updated>1970-01-01T00:00:00Z</updated>
<author><name>dreambau.com</name></author>
</feed>
`;

// ---- three posts, newest first (FD-2, FD-3): one with every field, one German without source, one English ----
const FULL = post({ slug: 'mit-allem', title: 'Ein Beitrag mit allem', date: '2026-10-02', sourceLink: 'https://videos.example.test/klein?a=1&b=2', sourceTitle: 'Klein & fein', quote: 'Ein Zitat.', quoteSource: 'Aus dem Film', paragraphs: ['Erster Absatz.', 'Zweiter Absatz mit <b> und & Zeichen.'] });
const PLAIN = post({ slug: 'ohne-quelle', title: 'Ohne Quelle', date: '2026-09-09', paragraphs: ['Nur ein Absatz.'] });
const ENGLISH = post({ slug: 'small-habit', title: 'Small is a habit', date: '2026-08-28', lang: 'en', sourceLink: 'https://essays.example.test/small', paragraphs: ['A short essay.', 'More of it.'] });
const THREE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM}" xml:lang="de">
<id>https://dreambau.com/blog/</id>
<title>Blog · dreambau.com</title>
<subtitle>${SUBTITLE}</subtitle>
<link rel="self" type="application/atom+xml" href="https://dreambau.com/blog/feed.xml"/>
<link rel="alternate" type="text/html" href="https://dreambau.com/blog/"/>
<updated>2026-10-02T00:00:00Z</updated>
<author><name>dreambau.com</name></author>
<entry>
<id>https://dreambau.com/blog/2026/mit-allem/</id>
<title>Ein Beitrag mit allem</title>
<link rel="alternate" type="text/html" href="https://dreambau.com/blog/2026/mit-allem/"/>
<link rel="related" href="https://videos.example.test/klein?a=1&amp;b=2" title="Klein &amp; fein"/>
<published>2026-10-02T00:00:00Z</published>
<updated>2026-10-02T00:00:00Z</updated>
<summary type="text">Erster Absatz.

Zweiter Absatz mit &lt;b&gt; und &amp; Zeichen.</summary>
</entry>
<entry>
<id>https://dreambau.com/blog/2026/ohne-quelle/</id>
<title>Ohne Quelle</title>
<link rel="alternate" type="text/html" href="https://dreambau.com/blog/2026/ohne-quelle/"/>
<published>2026-09-09T00:00:00Z</published>
<updated>2026-09-09T00:00:00Z</updated>
<summary type="text">Nur ein Absatz.</summary>
</entry>
<entry xml:lang="en">
<id>https://dreambau.com/blog/2026/small-habit/</id>
<title>Small is a habit</title>
<link rel="alternate" type="text/html" href="https://dreambau.com/blog/2026/small-habit/"/>
<link rel="related" href="https://essays.example.test/small"/>
<published>2026-08-28T00:00:00Z</published>
<updated>2026-08-28T00:00:00Z</updated>
<summary type="text">A short essay.

More of it.</summary>
</entry>
</feed>
`;

await run(async () => {
  same('FD-5 an empty blog: a complete feed with the date 1970 and no entry', feed([]), EMPTY);
  same('FD-2 FD-3 three posts, input in any order: the whole feed, newest first, character for character', feed([ENGLISH, FULL, PLAIN]), THREE);
  same('BD-2 the same input gives the same bytes (no clock, no random value)', [feed([FULL, PLAIN, ENGLISH]), feed([PLAIN, ENGLISH, FULL])], [THREE, THREE]);
  check('FD-1 the text is UTF-8 without a byte order mark and ends with one line feed', !THREE.startsWith('﻿') && feed([FULL]).endsWith('</feed>\n') && !feed([FULL]).includes('\r'));

  // ---- the limit of 50 (FD-3): 55 posts, one of them English, the English one among the 50 newest ----
  const many = Array.from({ length: 55 }, (_, index) => post({ slug: `p-${String(index + 1).padStart(2, '0')}`, title: `Titel ${index + 1}`, date: `2026-${index < 28 ? '01' : '02'}-${String((index % 28) + 1).padStart(2, '0')}`, ...(index === 54 ? { lang: 'en' } : {}) }));
  const big = parseXml(feed(many));
  same('FD-3 55 posts: the feed is well-formed', big.error, null);
  const entries = big.root.elements().filter((element) => element.local === 'entry');
  same('FD-3 55 posts: exactly 50 entries', entries.length, 50);
  same('FD-3 55 posts: the 50 NEWEST (the newest first p-55, the last one p-06; p-01 to p-05 are left out)', [entries[0].elements().find((e) => e.local === 'id').text(), entries[49].elements().find((e) => e.local === 'id').text()], ['https://dreambau.com/blog/2026/p-55/', 'https://dreambau.com/blog/2026/p-06/']);
  same('FD-3 55 posts: xml:lang="en" on the English entry only', entries.map((entry, index) => [index, entry.attrs.get('xml:lang')]).filter(([, lang]) => lang !== undefined), [[0, 'en']]);
  same('FD-2 55 posts: updated of the feed is the newest entry\'s', big.root.elements().find((e) => e.local === 'updated').text(), '2026-02-27T00:00:00Z');
  same('FD-3 55 posts: no link outside the five hosts of the Blog itself', [...feed(many).matchAll(/href="([^"]*)"/g)].map((m) => new URL(m[1]).host).filter((host, index, all) => all.indexOf(host) === index), ['dreambau.com']);

  // ---- the same date: the order is by (date, slug), newest first means the slug descending ----
  const sameDay = feed([post({ slug: 'aaa-eins', date: '2026-05-05' }), post({ slug: 'zzz-zwei', date: '2026-05-05' })]);
  same('FD-3 two posts on one day: the later slug comes first, as in the list', [...sameDay.matchAll(/<entry>\n<id>https:\/\/dreambau\.com\/blog\/2026\/([a-z-]+)\//g)].map((m) => m[1]), ['zzz-zwei', 'aaa-eins']);

  // ---- escaping, never CDATA (FD-4) ----
  const hostile = feed([post({ title: '<script>alert(1)</script> & "q" \'s\'', paragraphs: ['"><img src=x onerror=1>', 'Tom & Jerry ]] > ok'] , sourceLink: 'https://x.example.test/a?b=1&c="><i>', sourceTitle: 'A & B <i>' })]);
  const parsed = parseXml(hostile);
  same('FD-4 hostile text: the feed is well-formed', parsed.error, null);
  check('FD-4 hostile text: no CDATA anywhere, and the typed markup is only there as references', !hostile.includes('CDATA') && !hostile.includes('<script') && !hostile.includes('<img') && hostile.includes('&lt;script&gt;'));
  const entry = parsed.root.elements().find((e) => e.local === 'entry');
  const child = (name) => entry.elements().find((e) => e.local === name);
  same('FD-4 hostile text: the title reads back as typed', child('title').text(), '<script>alert(1)</script> & "q" \'s\'');
  same('FD-4 hostile text: the summary reads back as typed, paragraphs apart by one blank line', child('summary').text(), '"><img src=x onerror=1>\n\nTom & Jerry ]] > ok');
  const related = entry.elements().find((e) => e.attrs.get('rel') === 'related');
  same('FD-4 hostile text: the related link and its title read back as typed', [related.attrs.get('href'), related.attrs.get('title')], ['https://x.example.test/a?b=1&c="><i>', 'A & B <i>']);
  same('FD-4 hostile text: the entry has the elements it should and no other (nothing became an element)', entry.elements().map((e) => e.local), ['id', 'title', 'link', 'link', 'published', 'updated', 'summary']);

  // ---- characters XML forbids are an error here, not a silent change (PF-12 refuses them earlier) ----
  let message = '';
  try { feed([post({ title: 'a\u0001b' })]); } catch (error) { message = error.message; }
  same('FD-4 a character XML 1.0 forbids stops the feed instead of being dropped', message, 'the character U+0001 is not allowed in XML 1.0');

  // ---- a source link is re-checked at render time (PR-6) ----
  let refused = '';
  try { feed([post({ sourceLink: 'javascript:alert(1)' })]); } catch (error) { refused = error.message; }
  check('PR-6 a source link that is not https: never reaches the feed', refused.includes('sourceLink must be an https: address'), refused);

  // ---- an English post: the title and text are English, the feed level stays German ----
  check('FD-2 the feed level says xml:lang="de" and the German entries carry no xml:lang of their own', /<feed [^>]*xml:lang="de">/.test(THREE) && THREE.split('xml:lang=').length === 3);
});
