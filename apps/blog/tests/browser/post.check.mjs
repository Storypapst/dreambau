// The post page in a real Chromium (spec 5.6, V30, V31): the numbered lines, the side sheet at 900 and the dock at 899,
// the links at the ends of the list, plain <a> elements, and no inner scroll container. The expected values are typed
// from the fixture files (tests/lib/demo.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { BLOG_ORIGIN, withBrowser, withBuild, withDemoServer, serveFromDirectory } from '../lib/browser.mjs';
import { DEMO, paragraphsOf } from '../lib/demo.mjs';
import { FIXTURES } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';

const bySlug = (slug) => DEMO.find((post) => post.slug === slug);
const MIDDLE = bySlug('warum-bei-uns-der-text-zuerst-kommt'); // quote, image, source; neither the oldest nor the newest
const OLDEST = DEMO[DEMO.length - 1];
const NEWEST = DEMO[0];
const pathOf = (post) => `/blog/2026/${post.slug}/`;

const navFacts = () => {
  const nav = document.querySelector('article nav');
  return nav ? [...nav.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.querySelector('small').textContent]) : null;
};

await run(async () => {
  await withDemoServer(async ({ origin }) => {
    await withBrowser(async (browser) => {
      const open = async (post, width, height = 900, options = {}) => {
        const context = await browser.newContext({ viewport: { width, height }, ...options });
        const page = await context.newPage();
        await page.goto(`${origin}${pathOf(post)}`, { waitUntil: 'networkidle' });
        return { context, page };
      };

      // ---- V30: the numbered lines ----
      for (const width of [1440, 390]) {
        const { context, page } = await open(MIDDLE, width, 900, { reducedMotion: 'reduce' });
        const blocks = 1 + 1 + 1 + paragraphsOf(MIDDLE).length + 1; // meta, title, quote, paragraphs, source
        const lines = await page.evaluate(() => [...document.querySelectorAll('.ln')].map((ln) => ({
          content: getComputedStyle(ln, '::before').content, increment: getComputedStyle(ln).counterIncrement,
          text: ln.querySelector('.tx').localName, pseudoWidth: ln.getBoundingClientRect().width,
        })));
        same(`V30 PO-3 at ${width}: one numbered block each for meta line, title, quote, ${paragraphsOf(MIDDLE).length} paragraphs and source`, lines.length, blocks);
        check(`V30 PO-3 at ${width}: every block draws its number from the counter in ::before, with an empty alternative text`, lines.every((line) => line.content === 'counter(line, decimal-leading-zero) / ""'), JSON.stringify([...new Set(lines.map((line) => line.content))]));
        check(`V30 PO-3 at ${width}: every block counts up the same counter`, lines.every((line) => line.increment === 'line 1'), JSON.stringify([...new Set(lines.map((line) => line.increment))]));
        // the numbers really are painted: the pseudo-elements exist as nodes of the render tree with a width
        const session = await context.newCDPSession(page);
        await session.send('DOM.enable');
        const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
        const pseudo = [];
        const walk = (node) => {
          if (node.pseudoType === 'before') pseudo.push(node.nodeId);
          for (const child of [...(node.children || []), ...(node.pseudoElements || [])]) walk(child);
        };
        walk(root);
        let painted = 0;
        for (const nodeId of pseudo) {
          try {
            const { model } = await session.send('DOM.getBoxModel', { nodeId });
            if (model.width > 0 && model.height > 0) painted += 1;
          } catch { /* a pseudo-element without a box */ }
        }
        check(`V30 PO-3 at ${width}: at least ${blocks} ::before boxes are laid out (the numbers are painted)`, painted >= blocks, `${painted} of ${pseudo.length}`);
        await session.detach();
        // the accessibility tree and the copied text hold no number that the post lacks
        const source = fs.readFileSync(path.join(FIXTURES, '2026', `${MIDDLE.slug}.md`), 'utf8');
        const allowed = new Set(source.match(/\d+/g) || []);
        const tree = (await page.locator('article').ariaSnapshot()).split('\n').filter((line) => !/^\s*- \/url:/.test(line)).join('\n').replace(/\[level=\d\]/g, '');
        const treeNumbers = (tree.match(/\d+/g) || []);
        check(`V30 PO-3 at ${width}: the accessible tree of the article holds no number the post lacks`, treeNumbers.every((number) => allowed.has(number)), JSON.stringify(treeNumbers));
        const copied = await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('article')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString(); });
        const copiedNumbers = (copied.match(/\d+/g) || []);
        check(`V30 PO-3 at ${width}: the copied text of the article holds no number the post lacks`, copiedNumbers.length > 0 && copiedNumbers.every((number) => allowed.has(number)), JSON.stringify(copiedNumbers));
        check(`V30 PO-3 at ${width}: the copied text still holds the post (title and last paragraph)`, copied.includes(MIDDLE.title) && copied.includes(paragraphsOf(MIDDLE).at(-1)));
        await context.close();
      }

      // ---- V31: 900 against 899, on one page, by resizing it ----
      {
        const { context, page } = await open(MIDDLE, 900, 800, { reducedMotion: 'reduce' });
        await page.evaluate(() => { window.__nodes = { figure: document.querySelector('figure'), nav: document.querySelector('article nav'), image: document.querySelector('figure img'), back: document.querySelector('.back'), aside: document.querySelector('aside') }; });
        const measure = () => page.evaluate(() => {
          const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          const texts = [...document.querySelectorAll('.ln .tx, .ln')].map(rect);
          const aside = document.querySelector('aside');
          return {
            columnRight: Math.max(...[...document.querySelectorAll('.ln > .tx')].map((el) => el.getBoundingClientRect().right)),
            figure: rect(document.querySelector('figure')), nav: rect(document.querySelector('article nav')),
            aside: getComputedStyle(aside).display === 'none' ? null : rect(aside), asideDisplay: getComputedStyle(aside).display,
            lastBlockBottom: Math.max(...texts.map((box) => box.bottom)),
            sameNodes: ['figure', 'nav', 'image', 'back', 'aside'].map((name) => [name, window.__nodes[name].isConnected && window.__nodes[name] === (name === 'figure' ? document.querySelector('figure') : name === 'nav' ? document.querySelector('article nav') : name === 'image' ? document.querySelector('figure img') : name === 'back' ? document.querySelector('.back') : document.querySelector('aside'))]),
            back: rect(document.querySelector('.back')), inner: innerWidth,
          };
        });
        const wide = await measure();
        const wideTree = await page.locator('body').ariaSnapshot();
        same('V31 PO-7 at 900: the aside is shown', wide.asideDisplay !== 'none', true);
        check('V31 PO-7 at 900: the image, the older/newer links and the facts stand in the side sheet, right of the column', wide.figure.left >= wide.columnRight - 1 && wide.nav.left >= wide.columnRight - 1 && wide.aside.left >= wide.columnRight - 1, JSON.stringify([wide.columnRight, wide.figure.left, wide.nav.left, wide.aside.left]));
        check('V31 PO-7 at 900: the three sheet items share one left edge and stay inside the window', Math.abs(wide.figure.left - wide.nav.left) < 1.5 && Math.abs(wide.figure.left - wide.aside.left) < 1.5 && wide.figure.right <= 900 && wide.nav.right <= 900, JSON.stringify([wide.figure, wide.nav, wide.aside]));
        const facts = (tree) => ({ date: tree.split('2026-09-24').length - 1, language: tree.split('definition: Deutsch').length - 1, address: tree.split(`definition: ${pathOf(MIDDLE)}`).length - 1, aside: tree.split('complementary').length - 1, back: tree.split('link "Zurück zur Liste"').length - 1 });
        same('V31 PO-7 at 900: date, language and address appear once in the accessibility tree; the aside is there; so is the back link', facts(wideTree), { date: 1, language: 1, address: 1, aside: 1, back: 1 });
        await page.setViewportSize({ width: 899, height: 800 });
        await page.waitForTimeout(150);
        const narrow = await measure();
        const narrowTree = await page.locator('body').ariaSnapshot();
        same('V31 PO-7 at 899: the aside is display: none', narrow.asideDisplay, 'none');
        same('V31 PO-7 at 899: it is out of the accessibility tree; the date is still there once; the dock holds the back link once', facts(narrowTree), { date: 1, language: 0, address: 0, aside: 0, back: 1 });
        check('V31 PO-7 at 899: the image sits in the column and the older/newer links follow the last block', narrow.figure.left < 100 && narrow.figure.right <= 899 && narrow.nav.left < 100 && narrow.nav.top >= narrow.lastBlockBottom - 1, JSON.stringify([narrow.figure, narrow.nav, narrow.lastBlockBottom]));
        same('V31 PO-7 the image, the older/newer nodes, the back link and the aside are the same nodes at 900 and 899', [...narrow.sameNodes, ...wide.sameNodes].map(([name, same_]) => [name, same_]), [...narrow.sameNodes, ...wide.sameNodes].map(([name]) => [name, true]));
        check('V31 PO-7 at 899 the back link is inside the window', narrow.back.right <= 899 && narrow.back.left >= 0, JSON.stringify(narrow.back));
        await context.close();
      }

      // ---- V31: the ends of the list ----
      for (const [label, post, expected] of [
        ['the newest post has only the older link', NEWEST, [[pathOf(DEMO[1]), 'Älterer Beitrag']]],
        ['the oldest post has only the newer link', OLDEST, [[pathOf(DEMO[DEMO.length - 2]), 'Neuerer Beitrag']]],
        ['a middle post has both, the newer first', MIDDLE, [[pathOf(DEMO[0]), 'Neuerer Beitrag'], [pathOf(DEMO[2]), 'Älterer Beitrag']]],
      ]) {
        const { context, page } = await open(post, 1440, 900, { reducedMotion: 'reduce' });
        same(`V31 PO-10 ${label}`, await page.evaluate(navFacts), expected);
        const plain = await page.evaluate(() => {
          const links = [...document.querySelectorAll('article nav a, .back')];
          return {
            tags: links.map((el) => el.localName), roles: links.map((el) => el.getAttribute('role')),
            hashes: links.filter((el) => el.getAttribute('href') === '#' || /^javascript:/i.test(el.getAttribute('href'))).length,
            buttons: document.querySelectorAll('button, [role="button"], [aria-disabled], [disabled]').length,
            empty: [...document.querySelectorAll('article nav, article nav a, .dock')].filter((el) => el.textContent.trim() === '').length,
            back: document.querySelector('.back').getAttribute('href'),
            scripts: [...document.querySelectorAll('script')].map((el) => el.getAttribute('src') || 'inline'),
          };
        });
        same(`V31 PO-10 ${label}: older, newer and back are plain <a>; back is /blog/; no button, no empty or disabled element; the only script is /blog/blog.js`, [plain.tags.every((tag) => tag === 'a'), plain.roles.every((role) => role === null), plain.hashes, plain.buttons, plain.empty, plain.back, plain.scripts], [true, true, 0, 0, 0, '/blog/', ['/blog/blog.js']]);
        await context.close();
      }
      {
        const jsResponse = await fetch(`${origin}/blog/blog.js`);
        check('V31 PO-10 no script calls history.back (or touches history at all)', !/history\s*[.[]/.test(await jsResponse.text()));
      }

      // ---- V31: no inner scroll container, at both widths and on the list ----
      for (const [label, post, width] of [['post', MIDDLE, 1440], ['post', MIDDLE, 390], ['post', MIDDLE, 899], ['post', NEWEST, 390]]) {
        const { context, page } = await open(post, width, 844, { reducedMotion: 'reduce' });
        const scrollers = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
          const style = getComputedStyle(el);
          return /auto|scroll/.test(style.overflowX + style.overflowY) && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
        }).map((el) => `${el.localName}.${el.className}`));
        same(`V31 PO-9 ${label} ${post.slug} at ${width}: no element other than the document scrolls`, scrollers, []);
        const sideways = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        check(`V31 PH-1 ${label} ${post.slug} at ${width}: the page does not scroll sideways`, sideways[0] <= sideways[1], JSON.stringify(sideways));
        await context.close();
      }
    });
  });

  // ---- V31: a blog with one post has no older/newer link and no empty element ----
  await withScratch('one', async (dir) => {
    const postsDir = path.join(dir, 'posts');
    fs.mkdirSync(path.join(postsDir, '2026'), { recursive: true });
    const one = bySlug('ein-werkzeug-das-zeichen-zaehlt');
    fs.writeFileSync(path.join(postsDir, '2026', `${one.slug}.md`), fs.readFileSync(path.join(FIXTURES, '2026', `${one.slug}.md`), 'utf8').replace(/^example: true\n/m, ''));
    await withBuild(async ({ publicDir }) => {
      await withBrowser(async (browser) => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await serveFromDirectory(context, publicDir);
        const page = await context.newPage();
        await page.goto(`${BLOG_ORIGIN}${pathOf(one)}`, { waitUntil: 'networkidle' });
        const single = await page.evaluate(() => ({ nav: document.querySelectorAll('article nav').length, links: document.querySelectorAll('article nav a').length, back: document.querySelector('.back').getAttribute('href'), empty: [...document.querySelectorAll('article *')].filter((el) => el.localName === 'a' && el.textContent.trim() === '').length, number: document.querySelector('.pmeta').textContent }));
        same('V31 PO-10 the only post of a blog has no older and no newer link and no empty element; the way back stays', [single.links, single.empty, single.back], [0, 0, '/blog/']);
        check('V31 PO-10 the only post has no navigation element at all', single.nav === 0, JSON.stringify(single));
        await context.close();
      });
    }, { postsDir });
  });
});
