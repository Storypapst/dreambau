// Tap targets, the dock and the footer in a real Chromium (spec 5.9 PH-1..PH-3, 5.10 NV-1, NV-3, NV-6; V39, V41).
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { BLOG_ORIGIN, withBrowser, withBuild, withDemoServer, serveFromDirectory } from '../lib/browser.mjs';
import { DEMO } from '../lib/demo.mjs';
import { REPO } from '../lib/paths.mjs';
import { withScratch } from '../lib/scratch.mjs';

const MIDDLE = DEMO[1];
const PAGES = [['list', '/blog/'], ['post with image', `/blog/2026/${MIDDLE.slug}/`], ['English post', '/blog/2026/small-is-a-habit/'], ['post without source', '/blog/2026/notiz-aus-der-werkstatt/']];

// The links and controls of a page with the rectangle that a finger can hit. A stretched link (the row of the list) is as
// big as its row.
const targets = () => [...document.querySelectorAll('a, button, summary, input, select, textarea, [role="button"]')]
  .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && !el.closest('[hidden]'))
  .map((el) => {
    const stretched = getComputedStyle(el, '::after').position === 'absolute' && el.closest('li');
    const rect = (stretched ? el.closest('li') : el).getBoundingClientRect();
    return { name: `${el.localName}${el.className ? `.${el.className}` : ''} "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}"`, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
  });

// The items of a footer nav: ['span:Text', 'a:Text:href', ...]
const footerItems = () => [...document.querySelector('nav.foot').children].map((el) => (el.localName === 'a' ? `a:${el.textContent}:${el.getAttribute('href')}` : el.localName === 'span' ? `span:${el.textContent}` : `${el.localName}:${el.textContent}`));

// Colour alpha times the opacity of the element and of every ancestor.
const effectiveOpacity = (selector) => {
  const el = document.querySelector(selector);
  const alpha = (/^rgba\(.*,\s*([\d.]+)\)$/.exec(getComputedStyle(el).color) || [0, 1])[1];
  let opacity = Number(alpha);
  for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
  return opacity;
};

await run(async () => {
  await withDemoServer(async ({ origin }) => {
    await withBrowser(async (browser) => {
      // ---- V39: tap targets and the dock ----
      for (const [width, height] of [[390, 844], [844, 390]]) {
        for (const [label, route] of PAGES) {
          const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
          const page = await context.newPage();
          await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
          const all = await page.evaluate(targets);
          const small = all.filter((target) => target.width < 44 || target.height < 44);
          same(`V39 PH-2 ${label} at ${width}x${height}: all ${all.length} links and controls are at least 44 x 44 px`, small, []);
          // the skip link is off screen until it is focused; it is a target too
          await page.keyboard.press('Tab');
          const skip = await page.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); return { text: el.textContent, width: r.width, height: r.height, left: r.left, top: r.top }; });
          check(`V39 PH-2 ${label} at ${width}x${height}: the skip link, once focused, is on screen and at least 44 x 44 px`, skip.text === 'Zum Inhalt springen' && skip.width >= 44 && skip.height >= 44 && skip.left >= 0 && skip.top >= 0, JSON.stringify(skip));
          await context.close();
        }
      }

      for (const [width, height, sticky] of [[390, 844, true], [844, 390, false]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${origin}/blog/2026/${MIDDLE.slug}/`, { waitUntil: 'networkidle' });
        const dock = await page.evaluate(() => { const style = getComputedStyle(document.querySelector('.dock')); return { position: style.position, bottom: style.bottom, paddingBottom: style.paddingBottom }; });
        same(`V39 PH-3 at ${width}x${height}: the dock is ${sticky ? '' : 'not '}sticky`, dock.position === 'sticky', sticky);
        if (sticky) {
          const rects = async () => page.evaluate(() => { const r = document.querySelector('.dock').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, innerHeight }; });
          const first = await rects();
          check('V39 PH-3 at 390x844: at the top of the page the dock sits on the lower edge of the window', Math.abs(first.bottom - first.innerHeight) <= 1, JSON.stringify(first));
          await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(100);
          const end = await page.evaluate(() => {
            const dockRect = document.querySelector('.dock').getBoundingClientRect();
            const last = [...document.querySelectorAll('.prose')].at(-1).getBoundingClientRect();
            const footerRect = document.querySelector('footer.site').getBoundingClientRect();
            const sourceRect = document.querySelector('.srcbox').getBoundingClientRect();
            return { dock: [dockRect.top, dockRect.bottom], lastParagraphBottom: last.bottom, sourceBottom: sourceRect.bottom, footer: [footerRect.top, footerRect.bottom], innerHeight, covered: [...document.querySelectorAll('main *, footer *')].filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.bottom > dockRect.top + 1 && r.top < dockRect.bottom - 1 && !el.contains(document.querySelector('.dock')) && el.closest('.dock') === null && el.localName !== 'article' && el.localName !== 'main' && el.localName !== 'footer' && getComputedStyle(el).position !== 'absolute'; }).map((el) => el.localName) };
          });
          check('V39 PH-3 at 390x844: scrolled to the end, the last paragraph and the source end above the dock', end.lastParagraphBottom <= end.dock[0] + 1 && end.sourceBottom <= end.dock[0] + 1, JSON.stringify(end));
          same('V39 PH-3 at 390x844: scrolled to the end, nothing of the content lies behind the dock (the footer stays reachable)', end.footer[0] >= end.dock[1] - 1 || end.covered.length === 0, true);
          // a focused link scrolls into view and is not covered by the dock
          await page.evaluate(() => scrollTo(0, 0));
          const hits = [];
          for (let step = 0; step < 30; step += 1) {
            await page.keyboard.press('Tab');
            if (await page.evaluate(() => document.activeElement === document.body)) break; // past the last link
            hits.push(await page.evaluate(() => {
              const el = document.activeElement; const r = el.getBoundingClientRect(); const d = document.querySelector('.dock').getBoundingClientRect();
              const overlap = el.closest('.dock') === null && r.bottom > d.top + 1 && r.top < d.bottom - 1;
              return { text: el.textContent.trim().slice(0, 20), visible: r.top >= 0 && r.bottom <= innerHeight, overlap };
            }));
          }
          check('V39 PH-3 at 390x844: the Tab walk visits every link of the page (skip, pill, feed, source, 2 more, back, 5 footer links)', hits.length === 12, String(hits.length));
          check('V39 PH-3 at 390x844: every focused link scrolls into view and is never behind the dock', hits.every((hit) => hit.visible && !hit.overlap), JSON.stringify(hits.filter((hit) => !hit.visible || hit.overlap)));
        } else {
          const rect = await page.evaluate(() => { const r = document.querySelector('.dock').getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, content: document.querySelector('footer.site').getBoundingClientRect().top + scrollY }; });
          check('V39 PH-3 at 844x390: the dock is in the flow, above the footer', rect.bottom <= rect.content + 1, JSON.stringify(rect));
        }
        await context.close();
      }
    });
  });

  // ---- V41: the footer, measured in the browser ----
  const liveHtml = fs.readFileSync(path.join(REPO, 'apps', 'website', 'site', 'referenzen', 'index.html'), 'utf8');
  const run41 = async (publicDir, real) => {
    await withBrowser(async (browser) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const livePage = await context.newPage();
      await livePage.setContent(liveHtml);
      const live = await livePage.evaluate(footerItems);
      await serveFromDirectory(context, publicDir);
      const live4 = live.slice(0, 4);
      const expected = [...live4, 'a:Referenzen:/referenzen/', ...live.slice(4)];
      const wanted = real ? [`a:Impressum:/impressum.html`, 'i:·', `a:Datenschutz:/datenschutz.html`, ...expected.slice(3)] : expected;
      for (const [label, route] of [['list', '/blog/'], ['post', `/blog/2026/${MIDDLE.slug}/`]]) {
        const page = await context.newPage();
        await page.goto(`${BLOG_ORIGIN}${route}`, { waitUntil: 'networkidle' });
        const items = await page.evaluate(footerItems);
        same(`V41 NV-1 ${real ? 'real addresses' : 'footer.json as it is'}, ${label}: the live items and order plus Referenzen at its place`, items, wanted);
        const facts = await page.evaluate(() => {
          const foot = document.querySelector('footer.site');
          const nav = foot.querySelector('nav.foot');
          return { landmark: foot.localName, navLabel: nav.getAttribute('aria-label'), verantwortlich: /Verantwortlich/i.test(foot.textContent), header: [...document.querySelectorAll('header nav, header a')].map((el) => el.localName + ':' + el.textContent.trim()), headerNav: document.querySelectorAll('header nav').length, headerLinks: [...document.querySelectorAll('header a')].map((a) => a.getAttribute('href')), footInHeader: document.querySelector('header nav.foot') !== null };
        });
        same(`V41 NV-1 ${label}: a footer landmark with a nav named Website, no Verantwortlich line (LE-7)`, [facts.landmark, facts.navLabel, facts.verantwortlich], ['footer', 'Website', false]);
        same(`V41 NV-3 ${label}: the header holds no nav; its links are the pill Startseite and the feed link`, [facts.headerNav, facts.headerLinks], [0, ['/', '/blog/feed.xml']]);
        if (!real) {
          const spans = await page.evaluate(() => [...document.querySelectorAll('nav.foot > :nth-child(-n+3)')].map((el) => [el.localName, el.getAttribute('href'), el.getAttribute('lang'), el.getAttribute('dir')]));
          same(`V41 NV-2 ${label}: with null items the first two are spans (not links), as on /referenzen/`, [spans[0], spans[2]], [['span', null, 'de', 'ltr'], ['span', null, 'de', 'ltr']]);
        } else {
          const styles = await page.evaluate((measure) => {
            const out = {};
            for (const [name, selector] of [['impressum', 'nav.foot > a:nth-child(1)'], ['datenschutz', 'nav.foot > a:nth-child(3)']]) {
              const el = document.querySelector(selector);
              out[name] = { size: parseFloat(getComputedStyle(el).fontSize), opacity: new Function(`return (${measure})(arguments[0])`)(selector), text: el.textContent };
            }
            return out;
          }, effectiveOpacity.toString());
          check(`V41 NV-6 ${label}: the Impressum and Datenschutz links are at least 14 px with effective opacity of at least 0.75`, Object.values(styles).every((style) => style.size >= 14 && style.opacity >= 0.75), JSON.stringify(styles));
        }
        await page.close();
      }
      await context.close();
    });
  };
  await withBuild(async ({ publicDir }) => run41(publicDir, false));
  await withScratch('real-footer', async (dir) => {
    const footerFile = path.join(dir, 'footer.json');
    fs.writeFileSync(footerFile, '{"impressum":"/impressum.html","datenschutz":"/datenschutz.html"}\n');
    await withBuild(async ({ publicDir }) => run41(publicDir, true), { footerFile });
  });
});
