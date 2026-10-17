// FD-1 to FD-5, AD-3, BD-9: the offline feed validator (src/lib/feed-check.mjs). Good feeds pass; every broken feed fails
// with the EXACT line of its row (a validator that never failed has not been shown to work). The broken feeds are the
// generated feed with one line changed; each change names the line it touches and the test first asserts that line.
import { check, same, run } from '../lib/check.mjs';
import { ATOM, WWW } from '../lib/feedtext.mjs';
import { checkFeed } from '../../src/lib/feed-check.mjs';
import { feedXml } from '../../src/lib/feed.mjs';
import { format } from '../../src/lib/findings.mjs';
import { loadLabels, LABELS_FILE } from '../../src/lib/labels.mjs';

const labels = loadLabels(LABELS_FILE);
const lines = (text) => checkFeed(text, { labels }).map(format);
const post = (slug, title, date, extra = {}) => ({ year: '2026', slug, address: `2026/${slug}`, file: `2026/${slug}.md`, title, date, lang: 'de', paragraphs: ['Ein Absatz.'], ...extra });

const EINS = post('eins', 'Eins', '2026-05-05');
const ZWEI = post('zwei', 'Zwei', '2026-06-06');
const BASE = feedXml({ labels, posts: [EINS, ZWEI] }).split('\n'); // 26 lines and the empty one after the last line feed
const EMPTY = feedXml({ labels, posts: [] }).split('\n');
const with_ = (base, change) => { const copy = [...base]; change(copy); return copy.join('\n'); };
const line = (n) => BASE[n - 1];

await run(async () => {
  // the picture of the base feed, so that every line number below is a fact
  same('FD-3 base feed: line 2 is the feed element, 10 and 18 open the entries, 11 and 12 are the id and title of the newest', [line(2).slice(0, 5), line(10), line(18), line(11), line(12), line(26)],
    ['<feed', '<entry>', '<entry>', '<id>https://dreambau.com/blog/2026/zwei/</id>', '<title>Zwei</title>', '</feed>']);

  // ---- good feeds pass ----
  same('FD-1 the generated feed of two posts passes', lines(BASE.join('\n')), []);
  same('FD-5 the generated empty feed passes', lines(EMPTY.join('\n')), []);
  const fifty = feedXml({ labels, posts: Array.from({ length: 60 }, (_, i) => post(`p-${String(i).padStart(2, '0')}`, `Titel ${i}`, `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, '0')}`, i === 59 ? { lang: 'en' } : {})) });
  same('FD-3 the generated feed of 60 posts (50 entries, one English) passes', lines(fifty), []);

  // ---- not well-formed: the line of the first fault, in the right rule ----
  same('FD-4 an unescaped & in a title', lines(with_(BASE, (c) => { c[11] = '<title>Zwei & Co</title>'; })), ['FAIL FD-4 feed.xml:12: not well-formed XML at column 13: "&" starts a reference but is not followed by a name and ";" (write &amp;)']);
  same('FD-4 CDATA in a summary', lines(with_(BASE, (c) => { c[15] = '<summary type="text"><![CDATA[x]]></summary>'; })), ['FAIL FD-4 feed.xml:16: not well-formed XML at column 22: CDATA sections are not used; the feed escapes its text']);
  same('FD-1 an end tag that does not match', lines(with_(BASE, (c) => { c[11] = '<title>Zwei</titel>'; })), ['FAIL FD-1 feed.xml:12: not well-formed XML at column 12: the end tag </titel> does not match <title> (opened at line 12)']);
  same('FD-1 the encoding named in the declaration is not UTF-8', lines(with_(BASE, (c) => { c[0] = '<?xml version="1.0" encoding="ISO-8859-1"?>'; })), ['FAIL FD-1 feed.xml:1: not well-formed XML at column 1: the XML declaration must be <?xml version="1.0" encoding="UTF-8"?>']);
  same('FD-1 no XML declaration', lines(with_(BASE, (c) => { c.shift(); })), ['FAIL FD-1 feed.xml:1: the file must start with <?xml version="1.0" encoding="UTF-8"?>']);
  same('FD-1 a root that is not the Atom feed', lines(with_(BASE, (c) => { c[1] = c[1].replace(` xmlns="${ATOM}"`, ''); })), ['FAIL FD-1 feed.xml:2: the root element must be <feed> in the Atom 1.0 namespace']);
  same('FD-1 an empty file', lines(''), ['FAIL FD-1 feed.xml:1: not well-formed XML at column 1: no root element']);

  // ---- the feed level (FD-2) ----
  same('FD-2 a missing feed id', lines(with_(BASE, (c) => { c.splice(2, 1); })), ['FAIL FD-2 feed.xml:2: the feed has no <id>']);
  same('FD-2 the wrong feed id', lines(with_(BASE, (c) => { c[2] = '<id>https://dreambau.com/blog</id>'; })), ['FAIL FD-2 feed.xml:3: <id> is "https://dreambau.com/blog" but must be "https://dreambau.com/blog/"']);
  same('FD-2 the wrong title', lines(with_(BASE, (c) => { c[3] = '<title>Blog</title>'; })), ['FAIL FD-2 feed.xml:4: <title> is "Blog" but must be "Blog · dreambau.com"']);
  same('FD-2 the wrong subtitle', lines(with_(BASE, (c) => { c[4] = '<subtitle>Etwas anderes.</subtitle>'; })), ['FAIL FD-2 feed.xml:5: <subtitle> is "Etwas anderes." but must be the German text of blog.sub: "Zitate und Links, dazu warum es lohnt."']);
  same('FD-2 the wrong self link', lines(with_(BASE, (c) => { c[5] = '<link rel="self" type="application/atom+xml" href="https://dreambau.com/blog/atom.xml"/>'; })), ['FAIL FD-2 feed.xml:6: the rel="self" link is "https://dreambau.com/blog/atom.xml" but must be "https://dreambau.com/blog/feed.xml"']);
  same('FD-2 a missing alternate link', lines(with_(BASE, (c) => { c.splice(6, 1); })), ['FAIL FD-2 feed.xml:2: the feed has no rel="alternate" link']);
  same('FD-2 the feed updated is not the newest entry\'s', lines(with_(BASE, (c) => { c[7] = '<updated>2026-01-01T00:00:00Z</updated>'; })), ['FAIL FD-2 feed.xml:8: <updated> is 2026-01-01T00:00:00Z but must be the newest entry\'s, 2026-06-06T00:00:00Z']);
  same('FD-2 a missing author', lines(with_(BASE, (c) => { c.splice(8, 1); })), ['FAIL FD-2 feed.xml:2: the feed has no <author>']);
  same('FD-2 the wrong author name', lines(with_(BASE, (c) => { c[8] = '<author><name>Jemand</name></author>'; })), ['FAIL FD-2 feed.xml:9: the author name is "Jemand" but must be "dreambau.com"']);
  same('FD-2 no xml:lang on the feed', lines(with_(BASE, (c) => { c[1] = c[1].replace(' xml:lang="de"', ''); })), ['FAIL FD-2 feed.xml:2: the feed must have xml:lang="de"']);
  same('FD-5 an empty feed whose updated is not 1970', lines(with_(EMPTY, (c) => { c[7] = '<updated>2026-01-01T00:00:00Z</updated>'; })), ['FAIL FD-5 feed.xml:8: an empty feed must have <updated>1970-01-01T00:00:00Z</updated>']);

  // ---- the entries (FD-3) ----
  same('FD-3 an entry without an id', lines(with_(BASE, (c) => { c.splice(10, 1); })), ['FAIL FD-3 feed.xml:10: the entry has no <id>']);
  same('FD-3 an entry without a title', lines(with_(BASE, (c) => { c.splice(11, 1); })), ['FAIL FD-3 feed.xml:10: the entry has no <title>']);
  same('FD-3 an entry without an alternate link', lines(with_(BASE, (c) => { c.splice(12, 1); })), ['FAIL FD-3 feed.xml:10: the entry has no rel="alternate" link']);
  same('FD-3 an entry without a summary', lines(with_(BASE, (c) => { c.splice(15, 1); })), ['FAIL FD-3 feed.xml:10: the entry has no <summary>']);
  same('FD-3 an id that is no post address (AD-1)', lines(with_(BASE, (c) => { c[10] = '<id>https://dreambau.com/blog/zwei</id>'; c[12] = '<link rel="alternate" type="text/html" href="https://dreambau.com/blog/zwei"/>'; })), ['FAIL FD-3 feed.xml:11: the id "https://dreambau.com/blog/zwei" is not a post address https://dreambau.com/blog/<year>/<slug>/ (AD-1)']);
  same('FD-3 an alternate link that differs from the id', lines(with_(BASE, (c) => { c[12] = '<link rel="alternate" type="text/html" href="https://dreambau.com/blog/2026/eins/"/>'; })), ['FAIL FD-3 feed.xml:13: the alternate link "https://dreambau.com/blog/2026/eins/" is not the id "https://dreambau.com/blog/2026/zwei/"']);
  same('FD-3 the same id twice', lines(with_(BASE, (c) => { c[18] = c[10]; c[20] = c[12]; })), ['FAIL FD-3 feed.xml:19: the id https://dreambau.com/blog/2026/zwei/ is used by two entries (first at line 11)']);
  same('FD-3 published with a clock time', lines(with_(BASE, (c) => { c[13] = '<published>2026-06-06T10:00:00Z</published>'; })), ['FAIL FD-3 feed.xml:14: <published> is "2026-06-06T10:00:00Z" but must be a day + T00:00:00Z']);
  same('FD-3 published and updated apart', lines(with_(BASE, (c) => { c[13] = '<published>2026-06-05T00:00:00Z</published>'; })), ['FAIL FD-3 feed.xml:14: <published> 2026-06-05T00:00:00Z and <updated> 2026-06-06T00:00:00Z of an entry must be equal']);
  same('FD-3 a day that does not exist', lines(with_(BASE, (c) => { c[21] = '<published>2026-02-30T00:00:00Z</published>'; c[22] = '<updated>2026-02-30T00:00:00Z</updated>'; })), ['FAIL FD-3 feed.xml:22: <published> is "2026-02-30T00:00:00Z" but must be a day + T00:00:00Z', 'FAIL FD-3 feed.xml:23: <updated> is "2026-02-30T00:00:00Z" but must be a day + T00:00:00Z']);
  same('FD-3 a summary that is not plain text', lines(with_(BASE, (c) => { c[15] = '<summary type="html">Ein Absatz.</summary>'; })), ['FAIL FD-3 feed.xml:16: <summary> must have type="text"']);
  same('FD-3 paragraphs more than one blank line apart', lines(with_(BASE, (c) => { c[15] = '<summary type="text">A\n\n\nB</summary>'; })), ['FAIL FD-3 feed.xml:16: paragraphs in the summary must be separated by exactly one blank line']);
  same('FD-3 an empty summary', lines(with_(BASE, (c) => { c[15] = '<summary type="text"></summary>'; })), ['FAIL FD-3 feed.xml:16: <summary> is empty']);
  same('FD-3 a related link that is not https', lines(with_(BASE, (c) => { c.splice(13, 0, '<link rel="related" href="http://x.example.test/a"/>'); })), ['FAIL FD-3 feed.xml:14: the related link "http://x.example.test/a" must start with https://']);
  same('FD-3 two related links', lines(with_(BASE, (c) => { c.splice(13, 0, '<link rel="related" href="https://x.example.test/a"/>', '<link rel="related" href="https://x.example.test/b"/>'); })), ['FAIL FD-3 feed.xml:15: an entry has at most one rel="related" link']);
  same('FD-3 an element the spec does not name', lines(with_(BASE, (c) => { c.splice(15, 0, '<content>x</content>'); })), ['FAIL FD-3 feed.xml:16: unexpected element <content> in an entry']);
  same('FD-3 xml:lang="de" on an entry', lines(with_(BASE, (c) => { c[9] = '<entry xml:lang="de">'; })), ['FAIL FD-3 feed.xml:10: xml:lang on an entry is only written when the language is not de']);
  same('FD-3 xml:lang="fr" on an entry', lines(with_(BASE, (c) => { c[9] = '<entry xml:lang="fr">'; })), ['FAIL FD-3 feed.xml:10: xml:lang="fr" is not one of de, en']);
  same('FD-3 the older entry first', lines(with_(BASE, (c) => { c.splice(9, 16, ...BASE.slice(17, 25), ...BASE.slice(9, 17)); })), [
    'FAIL FD-2 feed.xml:8: <updated> is 2026-06-06T00:00:00Z but must be the newest entry\'s, 2026-05-05T00:00:00Z',
    'FAIL FD-3 feed.xml:18: the entry is newer than the one before it (2026-06-06T00:00:00Z after 2026-05-05T00:00:00Z); entries must be newest first',
  ]);
  const SAME = feedXml({ labels, posts: [post('aaa-eins', 'Eins', '2026-05-05'), post('zzz-zwei', 'Zwei', '2026-05-05')] }).split('\n');
  same('FD-3 two posts on one day: the later address first is good', lines(SAME.join('\n')), []);
  same('FD-3 two posts on one day in the wrong order', lines(with_(SAME, (c) => { c.splice(9, 16, ...SAME.slice(17, 25), ...SAME.slice(9, 17)); })), ['FAIL FD-3 feed.xml:18: the entries of one day must be in descending order of their address (https://dreambau.com/blog/2026/zzz-zwei/ must come before https://dreambau.com/blog/2026/aaa-eins/)']);
  const many = fifty.split('\n');
  const entryLines = many.slice(9, 9 + 8); // the first of the 50 entries
  const extra = with_(many, (c) => { c.splice(many.length - 2, 0, ...entryLines.map((l) => l.replace(/p-\d+\/|2026-0\d-\d\d/g, (m) => (m.startsWith('p-') ? 'p-ex/' : '2025-01-01')))); });
  same('FD-3 51 entries', lines(extra), ['FAIL FD-3 feed.xml:410: the feed has 51 entries; at most 50']);

  // ---- addresses (AD-3) ----
  same('AD-3 the www host in an id and in the alternate link of an entry', lines(with_(BASE, (c) => { c[10] = c[10].replace('//dreambau.com', `//${WWW}`); c[12] = c[12].replace('//dreambau.com', `//${WWW}`); })), [
    `FAIL AD-3 feed.xml:11: the address https://${WWW}/blog/2026/zwei/ must use the host dreambau.com, not ${WWW}`,
    `FAIL AD-3 feed.xml:13: the address https://${WWW}/blog/2026/zwei/ must use the host dreambau.com, not ${WWW}`,
  ]);
  same('AD-3 the www host in the self link', lines(with_(BASE, (c) => { c[5] = c[5].replace('//dreambau.com', `//${WWW}`); })), [
    `FAIL AD-3 feed.xml:6: the address https://${WWW}/blog/feed.xml must use the host dreambau.com, not ${WWW}`,
    `FAIL FD-2 feed.xml:6: the rel="self" link is "https://${WWW}/blog/feed.xml" but must be "https://dreambau.com/blog/feed.xml"`,
  ]);
  check('AD-3 a related link may point to any https host (it is the source, not an address of the Blog)', lines(with_(BASE, (c) => { c.splice(13, 0, `<link rel="related" href="https://${WWW}/x"/>`); })).length === 0);

  // ---- more than one fault: all of them, in the order of the lines (BD-4) ----
  same('BD-4 every fault is reported, not the first', lines(with_(BASE, (c) => { c[3] = '<title>Blog</title>'; c[11] = '<title></title>'; c[15] = '<summary type="html">x</summary>'; })), [
    'FAIL FD-2 feed.xml:4: <title> is "Blog" but must be "Blog · dreambau.com"',
    'FAIL FD-3 feed.xml:12: <title> is empty',
    'FAIL FD-3 feed.xml:16: <summary> must have type="text"',
  ]);
  same('BD-4 the name of the file is the one given', checkFeed(with_(BASE, (c) => { c[3] = '<title>Blog</title>'; }), { labels, file: 'dist/public/feed.xml' }).map(format), ['FAIL FD-2 dist/public/feed.xml:4: <title> is "Blog" but must be "Blog · dreambau.com"']);
});
