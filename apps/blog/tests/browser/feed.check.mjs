// V14, V15, FD-6 in a real Chromium: the demo feed read by the browser's own XML parser (a second, independent parser
// besides the strict reader of the build), the feed link in the head of the list and of a post page resolved by the
// browser, and the hostile post page: the typed <script> shows as text, no dialog opens, no image is made of the text,
// and the hostile feed parses with the text as typed. The expected values are typed from the fixture files.
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { BLOG_ORIGIN, withBrowser, withDemoServer, serveFromDirectory } from '../lib/browser.mjs';
import { DEMO } from '../lib/demo.mjs';
import { BODY, FIRST_PARAGRAPH } from '../lib/posts.mjs';
import { withScratch, writePost } from '../lib/scratch.mjs';
import { buildBlog } from '../../src/generate.mjs';

const TITLE = '<script>alert(1)</script>';
const PARAGRAPH = '"><img src=x onerror=1>';
const HOSTILE = `---\ntitle: ${JSON.stringify(TITLE)}\ndate: 2026-09-01\nsourceLink: "https://quelle.example.test/a?x=1&y=2"\nsourceTitle: "Tom & Jerry"\nquote: ${JSON.stringify(PARAGRAPH)}\nquoteSource: "Eine Quelle"\n---\n\n${PARAGRAPH}\n\n${BODY}\n`;

// what the browser's XML parser makes of /blog/feed.xml
const parseInPage = () => fetch('/blog/feed.xml').then((response) => response.text()).then((text) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const entries = [...doc.documentElement.children].filter((child) => child.localName === 'entry');
  const child = (parent, name) => [...parent.children].find((c) => c.localName === name);
  return {
    failed: doc.getElementsByTagName('parsererror').length > 0,
    root: doc.documentElement.localName, namespace: doc.documentElement.namespaceURI, lang: doc.documentElement.getAttribute('xml:lang'),
    title: child(doc.documentElement, 'title').textContent, updated: child(doc.documentElement, 'updated').textContent,
    entries: entries.map((entry) => ({ id: child(entry, 'id').textContent, title: child(entry, 'title').textContent, lang: entry.getAttribute('xml:lang'), summary: child(entry, 'summary').textContent, related: [...entry.children].filter((c) => c.getAttribute('rel') === 'related').length })),
  };
});

await run(async () => {
  await withDemoServer(async ({ origin }) => {
    await withBrowser(async (browser) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // ---- FD-6: the browser resolves the feed link of the list and of a post page ----
      for (const [name, url] of [['the list', `${origin}/blog/`], ['a post page', `${origin}/blog/2026/${DEMO[0].slug}/`]]) {
        await page.goto(url, { waitUntil: 'networkidle' });
        const links = await page.evaluate(() => [...document.querySelectorAll('link[rel="alternate"]')].map((link) => ({ type: link.type, title: link.title, href: link.href })));
        same(`FD-6 ${name}: one alternate link, application/atom+xml, titled Blog · dreambau.com, pointing at /blog/feed.xml`, links, [{ type: 'application/atom+xml', title: 'Blog · dreambau.com', href: `${origin}/blog/feed.xml` }]);
      }

      // ---- V14: the demo feed in the browser's parser ----
      await page.goto(`${origin}/blog/`, { waitUntil: 'networkidle' });
      const feed = await page.evaluate(parseInPage);
      same('V14 the browser parses the demo feed without error, as an Atom feed in German', [feed.failed, feed.root, feed.lang, feed.title, feed.updated], [false, 'feed', 'de', 'Blog · dreambau.com', '2026-10-02T00:00:00Z']);
      same('V14 the browser sees the seven entries, newest first, with their addresses', feed.entries.map((entry) => entry.id), DEMO.map((demo) => `https://dreambau.com/blog/2026/${demo.slug}/`));
      same('V14 the browser sees xml:lang="en" on the English entry only, and a related link on the posts with a source only', [feed.entries.map((entry) => entry.lang), feed.entries.map((entry) => entry.related)], [DEMO.map((demo) => (demo.en ? 'en' : null)), DEMO.map((demo) => (demo.source ? 1 : 0))]);
      check('V14 the browser sees the full text of the first entry in its summary', feed.entries[0].summary.startsWith(FIRST_PARAGRAPH) && feed.entries[0].summary.includes('\n\n'));
      await context.close();
    });
  });

  // ---- V15: the hostile post page in the browser ----
  await withScratch('browser-hostile', async (dir) => {
    const posts = path.join(dir, 'posts');
    writePost(posts, '2026/boeser-text.md', HOSTILE);
    buildBlog({ postsDir: posts, outDir: path.join(dir, 'out'), mode: 'preview' });
    await withBrowser(async (browser) => {
      const context = await browser.newContext();
      await serveFromDirectory(context, path.join(dir, 'out', 'public'));
      const page = await context.newPage();
      const dialogs = [];
      page.on('dialog', (dialog) => { dialogs.push(dialog.message()); dialog.dismiss(); });
      await page.goto(`${BLOG_ORIGIN}/blog/2026/boeser-text/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800); // the title effect runs about 520 ms; any script from the text would have run by now
      const facts = await page.evaluate(() => ({
        heading: document.querySelector('h1').textContent, images: document.images.length, scripts: [...document.scripts].map((script) => script.getAttribute('src')),
        handlers: [...document.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().filter((name) => name.startsWith('on'))), firstParagraph: document.querySelector('p.prose').textContent,
      }));
      same('V15 no dialog opened', dialogs, []);
      same('V15 the heading is the typed title, as text', facts.heading, TITLE);
      same('V15 no image from the text, only the one script of the title effect, no event attribute', [facts.images, facts.scripts, facts.handlers], [0, ['/blog/blog.js'], []]);
      same('V15 the first paragraph is the typed text', facts.firstParagraph, PARAGRAPH);
      await page.goto(`${BLOG_ORIGIN}/blog/`, { waitUntil: 'networkidle' });
      const listed = await page.evaluate(() => [document.querySelector('.tt a').textContent, document.querySelectorAll('img, script').length]);
      same('V15 the list shows the typed title as the link text, with no script and no image', listed, [TITLE, 0]);
      const feed = await page.evaluate(parseInPage);
      same('V15 the browser parses the hostile feed without error and reads the title back as typed', [feed.failed, feed.entries.map((entry) => entry.title), feed.entries[0].summary.startsWith(`${PARAGRAPH}\n\n`)], [false, [TITLE], true]);
      await context.close();
    });
  });
});
