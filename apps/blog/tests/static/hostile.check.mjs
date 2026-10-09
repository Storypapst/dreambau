// V15 (PR-5, FD-4, PF-7, PF-12): the hostile fixture. One post whose title is <script>alert(1)</script>, whose first
// paragraph and quote are "><img src=x onerror=1>, whose source title holds an ampersand and whose quote source holds a
// tag, builds; nothing in any output file becomes an element, an attribute or a link that the same post with harmless
// text does not have (the twin, same fields, same address); the visible text equals the typed text; the feed is
// well-formed and reads back as typed. A javascript: source link, a ]]> and a bidirectional control are refused by the
// file rules with the exact line.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { addressesOf, attributeNames, tagNames, textsOf, tokens } from '../lib/html.mjs';
import { BODY, FIRST_PARAGRAPH, SECOND_PARAGRAPH } from '../lib/posts.mjs';
import { withScratch, writePost } from '../lib/scratch.mjs';
import { BuildRefused, buildBlog } from '../../src/generate.mjs';
import { checkFeed } from '../../src/lib/feed-check.mjs';
import { format } from '../../src/lib/findings.mjs';
import { LABELS_FILE, loadLabels } from '../../src/lib/labels.mjs';
import { parseXml } from '../../src/lib/xml.mjs';

const labels = loadLabels(LABELS_FILE);
const TITLE = '<script>alert(1)</script>';
const PARAGRAPH = '"><img src=x onerror=1>';
const QUOTE = '"><img src=x onerror=1>';
const QUOTE_SOURCE = '<b>fett</b> & "mehr"';
const SOURCE_TITLE = 'Tom & Jerry';
const SOURCE_LINK = 'https://quelle.example.test/a?x=1&y=2';

const file = ({ title, first, quote, quoteSource, sourceTitle }) => `---\ntitle: ${JSON.stringify(title)}\ndate: 2026-09-01\nsourceLink: ${JSON.stringify(SOURCE_LINK)}\nsourceTitle: ${JSON.stringify(sourceTitle)}\nquote: ${JSON.stringify(quote)}\nquoteSource: ${JSON.stringify(quoteSource)}\n---\n\n${first}\n\n${BODY}\n`;
const HOSTILE = file({ title: TITLE, first: PARAGRAPH, quote: QUOTE, quoteSource: QUOTE_SOURCE, sourceTitle: SOURCE_TITLE });
const TWIN = file({ title: 'Ein harmloser Titel', first: 'Ein harmloser erster Absatz.', quote: 'Ein harmloses Zitat.', quoteSource: 'Eine harmlose Quelle', sourceTitle: 'Tom und Jerry' });

function build(dir, name, text) {
  const posts = path.join(dir, `${name}-posts`);
  writePost(posts, '2026/boeser-text.md', text);
  buildBlog({ postsDir: posts, outDir: path.join(dir, name), mode: 'preview' });
  const read = (relative) => fs.readFileSync(path.join(dir, name, 'public', relative), 'utf8');
  return { read, files: ['index.html', '2026/boeser-text/index.html', 'feed.xml', 'blog.css', 'blog.js'] };
}
function refusal(dir, name, text, slug = 'boeser-text') {
  const posts = path.join(dir, `${name}-posts`);
  writePost(posts, `2026/${slug}.md`, text);
  try { buildBlog({ postsDir: posts, outDir: path.join(dir, name), mode: 'preview', displayDir: 'posts' }); } catch (error) { return error instanceof BuildRefused ? error.message.split('\n') : [`not a BuildRefused: ${error.message}`]; }
  return ['built'];
}

await run(async () => {
  withScratch('hostile', (dir) => {
    const bad = build(dir, 'bad', HOSTILE);
    const good = build(dir, 'good', TWIN);

    // ---- nothing new becomes an element, an attribute or a link (compared with the harmless twin) ----
    for (const page of ['index.html', '2026/boeser-text/index.html']) {
      same(`PR-5 ${page}: the hostile page has exactly the elements of the harmless page`, tagNames(bad.read(page)), tagNames(good.read(page)));
      same(`PR-5 ${page}: ... exactly its attribute names`, attributeNames(bad.read(page)), attributeNames(good.read(page)));
      same(`PR-5 ${page}: ... exactly its links and sources, with the source link as typed`, addressesOf(bad.read(page)), addressesOf(good.read(page)));
    }
    for (const name of bad.files.filter((entry) => /\.(html|xml)$/.test(entry))) {
      const text = bad.read(name);
      check(`PR-5 ${name}: no raw <script> from the text, no <img, no event attribute`, !text.includes('<script>alert') && !text.includes('<img') && !tokens(text).some((token) => token.type === 'tag' && token.attrs.some(([key]) => /^on/i.test(key))));
    }
    const postScripts = tokens(bad.read('2026/boeser-text/index.html')).filter((token) => token.type === 'tag' && !token.close && token.name === 'script');
    same('PR-5 the post page has the one script that every post page has, /blog/blog.js, and the list has none', [postScripts.map((token) => token.attrs), tokens(bad.read('index.html')).some((token) => token.type === 'tag' && token.name === 'script')], [[[['src', '/blog/blog.js'], ['defer', '']]], false]);

    // ---- the visible text equals the typed text ----
    const page = bad.read('2026/boeser-text/index.html');
    same('PR-5 the heading shows the typed title', textsOf(page, 'h1'), [TITLE]);
    same('PR-5 the document title shows the typed title', textsOf(page, 'title'), [`${TITLE} · Blog · dreambau.com`]);
    same('PR-5 the paragraphs show the typed text, the hostile one first', textsOf(page, 'p', 'prose'), [PARAGRAPH, FIRST_PARAGRAPH, SECOND_PARAGRAPH]);
    same('PR-5 the quote and its source show the typed text', [textsOf(page, 'blockquote')[0]], [`${QUOTE}${QUOTE_SOURCE}`]);
    same('PR-5 the source link shows the typed source title', textsOf(page, 'a', 'sk'), [SOURCE_TITLE]);
    const metas = tokens(page).filter((token) => token.type === 'tag' && token.name === 'meta').map((token) => Object.fromEntries(token.attrs));
    same('PR-5 og:title and the description are the typed text, not markup', [metas.find((m) => m.property === 'og:title').content, metas.find((m) => m.name === 'description').content.startsWith(`${PARAGRAPH} Der Vortrag`)], [TITLE, true]);
    const list = bad.read('index.html');
    same('PR-5 the list shows the typed title as the link text and the typed paragraph as the preview', [textsOf(list, 'a').filter((text) => text === TITLE), textsOf(list, 'p', 'ex')], [[TITLE], [PARAGRAPH]]);

    // ---- the feed ----
    const feed = bad.read('feed.xml');
    same('FD-4 the hostile feed passes the validator', checkFeed(feed, { labels }).map(format), []);
    const { root } = parseXml(feed);
    const entry = root.elements().find((element) => element.local === 'entry');
    const names = (element) => element.elements().map((child) => `${child.local}${child.attrs.get('rel') ? `[${child.attrs.get('rel')}]` : ''}`);
    same('FD-4 nothing became an element of the feed: it has the elements of the harmless feed', [names(root), names(entry)], [names(parseXml(good.read('feed.xml')).root), names(parseXml(good.read('feed.xml')).root.elements().find((element) => element.local === 'entry'))]);
    const of = (name) => entry.elements().find((child) => child.local === name);
    same('FD-4 the feed reads back as typed: title, summary, related link and its title', [of('title').text(), of('summary').text().startsWith(`${PARAGRAPH}\n\n${FIRST_PARAGRAPH}`), entry.elements().find((child) => child.attrs.get('rel') === 'related').attrs.get('href'), entry.elements().find((child) => child.attrs.get('rel') === 'related').attrs.get('title')], [TITLE, true, SOURCE_LINK, SOURCE_TITLE]);
    check('FD-4 no CDATA and no raw markup of the text in the feed file', !feed.includes('CDATA') && !feed.includes('<script') && !feed.includes('<img'));
  });

  // ---- refused by the file rules, each with its exact line ----
  withScratch('hostile-refused', (dir) => {
    const base = { title: 'Ein Beitrag', first: FIRST_PARAGRAPH, quote: 'Ein Zitat.', quoteSource: 'Eine Quelle', sourceTitle: 'Titel' };
    const withLine = (text, from, to) => text.replace(from, to);
    same('PR-6 a javascript: source link is refused at the line of the key (PF-7)', refusal(dir, 'js', withLine(file(base), JSON.stringify(SOURCE_LINK), JSON.stringify('javascript:alert(1)')), 'js-link'),
      ['FAIL PF-7 posts/2026/js-link.md:4: the source link must start with https:// (no http:, no other scheme)']);
    same('V15 a text with ]]> in the body is refused (PF-12)', refusal(dir, 'cdata', file(base).replace('Der Vortrag zeigt', 'Der ]]> Vortrag zeigt'), 'cdata'),
      ['FAIL PF-12 posts/2026/cdata.md:10: two closing square brackets in a row at character 5']);
    same('V15 a quote with a bidirectional control is refused (PF-12)', refusal(dir, 'bidi', file(base).replace('quote: "Ein Zitat."', `quote: "Ein Zitat‮mit Steuerzeichen."`), 'bidi'),
      ['FAIL PF-12 posts/2026/bidi.md:6: bidirectional control character U+202E at character 10']);
    same('V15 nothing was written for a refused post', fs.existsSync(path.join(dir, 'cdata')), false);
  });
});
