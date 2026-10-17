// The list page in a real Chromium behind the real nginx (spec 5.5, V26, V27, V28): no script and two requests, the rows
// newest first with their numbers, previews, marks and one link per row, the legend (open at 1440, a closed <details> at
// 390), and the empty list. The expected values are typed from the seven fixture files (tests/lib/demo.mjs), not read
// from the page.
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { BLOG_ORIGIN, withBrowser, withBuild, withDemoServer, serveFromDirectory } from '../lib/browser.mjs';
import { DEMO, firstParagraph, points } from '../lib/demo.mjs';

const urlOf = (request) => new URL(request.url());

// The lines of a text element as { text, count }: characters per rendered line (the line breaks of the browser, also
// the lines that line-clamp hides).
const linesOf = (selector) => (rootSelector) => {
  const element = document.querySelector(rootSelector);
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const lines = new Map();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let index = 0; index < node.data.length; index += 1) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const rects = range.getClientRects();
      if (rects.length === 0) continue;
      const top = Math.round(rects[0].top);
      lines.set(top, (lines.get(top) || '') + node.data[index]);
    }
  }
  return [...lines.values()].map((text) => text.trim()).filter(Boolean);
};

await run(async () => {
  await withDemoServer(async ({ url, origin }) => {
    await withBrowser(async (browser) => {
      // ---- V26: with scripts blocked ----
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
        const page = await context.newPage();
        const requests = [];
        page.on('request', (request) => { if (!request.url().startsWith('data:')) requests.push(`${request.method()} ${urlOf(request).pathname}`); });
        const response = await page.goto(url, { waitUntil: 'networkidle' });
        same('V26 the list answers 200', response.status(), 200);
        same('V26 with scripts blocked the network log shows two requests: the HTML and the CSS', requests, ['GET /blog/', 'GET /blog/blog.css']);
        const facts = await page.evaluate(() => ({
          scripts: document.querySelectorAll('script').length,
          eventAttributes: [...document.querySelectorAll('*')].flatMap((el) => [...el.attributes].filter((attr) => /^on/i.test(attr.name)).map((attr) => `${el.localName}[${attr.name}]`)),
          rows: document.querySelectorAll('ol > li').length,
          links: [...document.querySelectorAll('ol a')].map((a) => a.getAttribute('href')),
          lang: document.documentElement.getAttribute('lang'), dir: document.documentElement.getAttribute('dir'),
          stylesheets: [...document.querySelectorAll('link[rel~="stylesheet"]')].map((link) => link.getAttribute('href')),
          icon: [...document.querySelectorAll('link[rel~="icon"]')].map((link) => link.getAttribute('href')),
          externalFiles: [...document.querySelectorAll('[src], link[href]')].map((el) => el.getAttribute('src') || el.getAttribute('href')).filter((value) => !/^(\/blog\/blog\.css|data:,)$/.test(value)),
          reversed: document.querySelector('ol').hasAttribute('reversed'), role: document.querySelector('ol').getAttribute('role'), label: document.querySelector('ol').getAttribute('aria-label'),
        }));
        same('V26 LI-1 no <script> element and no on* attribute', [facts.scripts, facts.eventAttributes], [0, []]);
        same('V26 LI-2 all seven rows and links are present, newest first, root-relative', facts.links, DEMO.map((post) => `/blog/2026/${post.slug}/`));
        same('LI-1 LG-1 <html lang="de" dir="ltr">', [facts.lang, facts.dir], ['de', 'ltr']);
        same('LI-1 exactly one other file is loaded: /blog/blog.css; the icon is data:,', [facts.stylesheets, facts.icon, facts.externalFiles.filter((value) => value !== '/blog/feed.xml' && value !== 'https://dreambau.com/blog/' && value !== '/')], [['/blog/blog.css'], ['data:,'], []]);
        same('LI-2 <ol reversed role="list" aria-label="Beiträge, neueste zuerst">', [facts.reversed, facts.role, facts.label], [true, 'list', 'Beiträge, neueste zuerst']);
        await context.close();
      }
      {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        const requests = [];
        page.on('request', (request) => { if (!request.url().startsWith('data:')) requests.push(`${request.method()} ${urlOf(request).pathname}`); });
        await page.goto(url, { waitUntil: 'networkidle' });
        same('LI-9 with scripts on, the list still makes two requests (no image, no script)', requests, ['GET /blog/', 'GET /blog/blog.css']);
        await context.close();
      }

      // ---- V27: the rows ----
      for (const [width, height] of [[1440, 900], [390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        const rows = await page.evaluate(() => [...document.querySelectorAll('ol > li')].map((li) => {
          const ex = li.querySelector('.ex');
          const style = getComputedStyle(ex);
          const line = parseFloat(style.lineHeight);
          return {
            number: li.querySelector('.no').textContent, numberHidden: li.querySelector('.no').getAttribute('aria-hidden'),
            date: li.querySelector('time').textContent, datetime: li.querySelector('time').getAttribute('datetime'),
            heading: li.querySelector('h2 a').textContent, headingLang: li.querySelector('h2 a').getAttribute('lang'),
            marks: [...li.querySelectorAll('.mk, .en')].map((mark) => ({ text: [...mark.childNodes].filter((node) => !(node.classList && node.classList.contains('sr'))).map((node) => node.textContent).join('').trim(), cls: mark.className, title: mark.getAttribute('title'), hidden: mark.querySelector('.sr') ? mark.querySelector('.sr').textContent : null })),
            links: li.querySelectorAll('a').length, previewLinks: ex.querySelectorAll('a').length, previewText: ex.textContent, previewLang: ex.getAttribute('lang'),
            exHeight: ex.getBoundingClientRect().height, lineHeight: line, clamp: style.webkitLineClamp, overflow: style.overflow, scrolls: ex.scrollHeight > ex.clientHeight + 1,
          };
        }));
        const where = `at ${width}`;
        same(`V27 ${where}: numbers 07 to 01, aria-hidden, newest first`, rows.map((row) => [row.number, row.numberHidden]), DEMO.map((post) => [post.n, 'true']));
        same(`V27 ${where}: dates and titles`, rows.map((row) => [row.date, row.datetime, row.heading]), DEMO.map((post) => [post.date, post.date, post.title]));
        same(`V27 ${where}: a row has one link and its preview has none`, rows.map((row) => [row.links, row.previewLinks]), DEMO.map(() => [1, 0]));
        same(`V27 LI-5 ${where}: the visible mark Quelle only where the post has a source, EN only where lang is en, nothing else`,
          rows.map((row) => row.marks.map((mark) => mark.text.replace(/\s+/g, ' ').trim())), DEMO.map((post) => [...(post.source ? ['Quelle'] : []), ...(post.en ? ['EN'] : [])]));
        const marks = rows.flatMap((row) => row.marks);
        check(`V27 LI-5 ${where}: the marks carry their titles; EN has the same words as hidden text`, marks.every((mark) => (mark.text.startsWith('Quelle') ? mark.title === 'Dieser Beitrag verweist auf eine Quelle' : mark.title === 'Beitrag auf Englisch' && mark.hidden === 'Beitrag auf Englisch')), JSON.stringify(marks));
        same(`V27 LG-2 ${where}: the English post carries lang="en" on its title and its preview, the others carry none`, rows.map((row) => [row.headingLang, row.previewLang]), DEMO.map((post) => (post.en ? ['en', 'en'] : [null, null])));
        // previews: the first paragraph, cut at a word boundary with an ellipsis when over 200 code points
        DEMO.forEach((post, index) => {
          const full = firstParagraph(post);
          const shown = rows[index].previewText;
          if (points(full) <= 200) same(`V27 LI-4 ${where}: "${post.slug}" first paragraph (${points(full)} code points) is shown whole`, shown, full);
          else {
            const body = shown.slice(0, -1);
            check(`V27 LI-4 ${where}: "${post.slug}" first paragraph (${points(full)} code points) is cut at a word boundary within 200 code points, with an ellipsis`,
              shown.endsWith('…') && points(body) <= 200 && full.startsWith(body) && /\s/.test(full[body.length]) && !/\s$/.test(body), `${points(body)}: ${shown}`);
          }
        });
        check(`V27 LI-4 ${where}: at least one preview is over 200 code points and one is not (the fixtures exercise both)`, DEMO.some((post) => points(firstParagraph(post)) > 200) && DEMO.some((post) => points(firstParagraph(post)) <= 200));
        check(`V27 LI-4 ${where}: every preview box is two lines tall at most and clamps to two lines`, rows.every((row) => row.clamp === '2' && row.exHeight <= row.lineHeight * 2 + 1), JSON.stringify(rows.map((row) => [row.exHeight, row.lineHeight, row.clamp])));
        check(`V27 LI-4 ${where}: the clamp is really at work (a preview has more than two lines of text)`, rows.some((row) => row.scrolls));
        for (let index = 0; index < DEMO.length; index += 1) {
          const lines = await page.evaluate(linesOf('.ex'), `ol > li:nth-child(${index + 1}) .ex`);
          check(`V27 LI-4 ${where}: "${DEMO[index].slug}" preview is at most 68 characters wide on every rendered line`, lines.length > 0 && lines.every((text) => [...text].length <= 68), JSON.stringify(lines.map((text) => [...text].length)));
        }
        await context.close();
      }

      // ---- V28: the legend ----
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        const wide = await page.evaluate(() => {
          const aside = document.querySelector('aside.legend');
          const details = document.querySelector('details');
          const visible = (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
          const rect = aside.getBoundingClientRect();
          const list = document.querySelector('ol').getBoundingClientRect();
          return { asideVisible: visible(aside), text: [aside.querySelector('h2, h3').textContent, ...[...aside.querySelectorAll('li')].map((li) => [...li.children].map((child) => child.textContent).join(' | '))].join(' / '), detailsVisible: visible(details), beside: rect.left >= list.right - 1, label: aside.getAttribute('aria-labelledby') && document.getElementById(aside.getAttribute('aria-labelledby')).textContent };
        });
        same('V28 LI-6 at 1440 the legend is open: the sheet is visible with its heading and both entries', [wide.asideVisible, wide.label, wide.text], [true, 'Zeichen', 'Zeichen / Quelle | verweist auf eine Quelle / EN | Beitrag auf Englisch']);
        same('V28 LI-6 at 1440 the <details> of the phone is not shown, so the legend is in the accessibility tree once', wide.detailsVisible, false);
        check('V28 LI-6 at 1440 the legend stands beside the list', wide.beside);
        await context.close();
      }
      {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle' });
        const narrow = await page.evaluate(() => {
          const details = document.querySelector('details');
          const summary = details.querySelector('summary');
          const visible = (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
          return { open: details.open, summaryText: summary.textContent, summaryHeight: summary.getBoundingClientRect().height, summaryWidth: summary.getBoundingClientRect().width, asideVisible: visible(document.querySelector('aside.legend')), contentVisible: details.querySelector('ul').checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }), below: details.getBoundingClientRect().top >= document.querySelector('ol').getBoundingClientRect().bottom - 1 };
        });
        same('V28 LI-6 at 390 it is a native <details>, closed, with the summary "Zeichen"', [narrow.open, narrow.summaryText, narrow.asideVisible, narrow.contentVisible], [false, 'Zeichen', false, false]);
        check('V28 LI-6 at 390 the summary is at least 44 px tall (and wide)', narrow.summaryHeight >= 44 && narrow.summaryWidth >= 44, `${narrow.summaryWidth} x ${narrow.summaryHeight}`);
        check('V28 LI-6 at 390 the legend is below the list', narrow.below);
        await page.locator('details > summary').click();
        const opened = await page.evaluate(() => { const d = document.querySelector('details'); return { open: d.open, text: d.querySelector('ul').innerText.replace(/\s+/g, ' ').trim(), visible: d.querySelector('ul').getBoundingClientRect().height > 0 }; });
        same('V28 LI-6 a tap on the summary opens it, with scripts blocked, and shows both entries', opened, { open: true, text: 'Quelle verweist auf eine Quelle EN Beitrag auf Englisch', visible: true });
        await context.close();
      }

      // ---- V28: the empty list ----
      await withBuild(async ({ publicDir }) => {
        for (const [width, height] of [[1440, 900], [390, 844]]) {
          const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled: false });
          const requests = await serveFromDirectory(context, publicDir);
          const page = await context.newPage();
          await page.goto(`${BLOG_ORIGIN}/blog/`, { waitUntil: 'networkidle' });
          const empty = await page.evaluate(() => ({
            lines: [...document.querySelectorAll('.elog .cmt')].map((el) => ({ tag: el.localName, text: el.textContent, before: getComputedStyle(el, '::before').content })),
            rows: document.querySelectorAll('ol, li').length, feed: [...document.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/blog/feed.xml').length,
            legend: document.querySelectorAll('aside.legend, details').length, h1: document.querySelectorAll('h1').length, group: document.querySelector('.elog').getAttribute('role'),
          }));
          same(`V28 LI-7 at ${width} the empty list shows the heading and the line as two comment lines`, empty.lines.map((line) => [line.tag, line.text]), [['h2', 'Noch keine Beiträge'], ['p', 'Neue Beiträge stehen hier und im Feed.']]);
          check(`V28 LI-7 at ${width} both lines are drawn as comments ("// " from CSS, empty alternative text)`, empty.lines.every((line) => /^"\/\/ "/.test(line.before)), JSON.stringify(empty.lines.map((line) => line.before)));
          same(`V28 LI-7 at ${width} the page is valid and plain: no list, no legend, one h1, the feed link present`, [empty.rows, empty.legend, empty.h1, empty.feed, empty.group], [0, 0, 1, 1, 'group']);
          await context.close();
          check(`V28 LI-7 at ${width} the empty list also makes only the two requests`, requests.filter((request) => request.method === 'GET').length === 2, JSON.stringify(requests.map((request) => request.url)));
        }
      }, { postsDir: path.join(process.cwd(), 'tests', 'no-such-folder') });
    });
  });
});
