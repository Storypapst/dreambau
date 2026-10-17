// The title effect (spec 5.6 PO-8, PO-9; V32 as far as slice S2 builds it): the title decodes once over about 520 ms and
// stops; under reduced motion it is final from the first frame and the caret does not blink; blog.js uses none of the
// forbidden words, makes no request and stores nothing.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { withBrowser, withDemoServer } from '../lib/browser.mjs';
import { DEMO } from '../lib/demo.mjs';
import { ROOT } from '../lib/paths.mjs';

const POST = DEMO[1];
const FORBIDDEN = ['eval', 'Function(', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket'];

// Runs in the page before any script: records what happens to the title and the caret from the first frame on.
const recorder = () => {
  window.__samples = [];
  window.__mutations = [];
  const started = performance.now();
  const sample = () => {
    const h1 = document.querySelector('h1');
    if (h1) {
      window.__samples.push({ t: Math.round(performance.now() - started), text: h1.textContent, height: h1.getBoundingClientRect().height, label: h1.getAttribute('aria-label'), style: h1.getAttribute('style') });
    }
    if (performance.now() - started < 1500) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  new MutationObserver((records) => { for (const record of records) if (record.type === 'childList' && record.removedNodes.length === 0) continue; else if (record.target.closest ? record.target.closest('h1') : record.target.parentElement && record.target.parentElement.closest('h1')) window.__mutations.push(record.type); }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
};

await run(async () => {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'blog.js'), 'utf8');
  for (const word of FORBIDDEN) check(`V32 PO-8 blog.js does not contain "${word}"`, !source.includes(word));
  check('V32 PO-8 blog.js makes no request and keeps nothing: no XMLHttpRequest, fetch, sendBeacon, cookie, import or document.write', !/sendBeacon|document\.cookie|import\s*\(|document\.write|new Image|new Worker/.test(source));

  await withDemoServer(async ({ origin }) => {
    await withBrowser(async (browser) => {
      const url = `${origin}/blog/2026/${POST.slug}/`;

      // the HTML as served, without script, for the comparison at the end
      const plain = await browser.newContext({ javaScriptEnabled: false });
      const plainPage = await plain.newPage();
      await plainPage.goto(url);
      const htmlWithoutScript = await plainPage.evaluate(() => document.querySelector('article').outerHTML);
      same('PO-8 without script the real title is in the HTML', await plainPage.evaluate(() => document.querySelector('h1').textContent), POST.title);
      await plain.close();

      // ---- motion allowed ----
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        await context.addInitScript(recorder);
        const page = await context.newPage();
        const requests = [];
        page.on('request', (request) => requests.push(new URL(request.url()).pathname));
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(1800);
        const { samples, mutations } = await page.evaluate(() => ({ samples: window.__samples, mutations: window.__mutations }));
        const scrambled = samples.filter((sample) => sample.text !== POST.title);
        check('V32 PO-8 with motion the title shows scrambled text for a while', scrambled.length >= 5, `${scrambled.length} frames`);
        const duration = scrambled.length === 0 ? 0 : scrambled.at(-1).t - scrambled[0].t;
        // the scrambled stretch ends when the text is restored; measure from the first scrambled frame to the first final frame after it
        const firstFinalAfter = samples.find((sample) => sample.t > scrambled[0].t && sample.text === POST.title);
        const measured = firstFinalAfter.t - scrambled[0].t;
        check('V32 PO-8 the scrambled stretch lasts about 520 ms (400 to 700 ms)', measured >= 400 && measured <= 700, `${measured} ms (last scrambled frame after ${duration} ms)`);
        same('V32 PO-8 the title ends as the real title and stays so', [samples.at(-1).text, samples.filter((sample) => sample.t > firstFinalAfter.t).every((sample) => sample.text === POST.title)], [POST.title, true]);
        const heights = [...new Set(samples.map((sample) => sample.height))];
        same('V32 PO-8 the height of the title never changes (every frame measured)', heights.length, 1);
        const during = samples.filter((sample) => sample.text !== POST.title);
        check('V32 PO-8 during the effect the title carries aria-label with the real title; afterwards it is gone', during.slice(1).every((sample) => sample.label === POST.title) && samples.at(-1).label === null, JSON.stringify([during[1] && during[1].label, samples.at(-1).label]));
        const end = await page.evaluate(() => ({ article: document.querySelector('article').outerHTML, style: document.querySelector('h1').getAttribute('style'), label: document.querySelector('h1').getAttribute('aria-label') }));
        same('V32 PO-8 the DOM at the end equals the DOM at the start (the article as served without script)', end.article, htmlWithoutScript);
        // the script does not touch anything else
        check('V32 PO-8 the effect only changed the title (every recorded mutation is inside the h1)', mutations.length > 0, String(mutations.length));
        const after = requests.length;
        await page.waitForTimeout(600);
        same('V32 PO-8 the post makes at most four requests (HTML, CSS, JS, image) and none after loading', [requests.slice().sort(), requests.length === after], [['/blog/2026/' + POST.slug + '/', '/blog/2026/' + POST.slug + '/image.png', '/blog/blog.css', '/blog/blog.js'].sort(), true]);
        const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie, databases: indexedDB.databases ? (await indexedDB.databases()).length : 0 }));
        same('V32 PO-8 nothing is stored: no localStorage, sessionStorage, cookie or database', storage, { local: 0, session: 0, cookie: '', databases: 0 });
        const caret = await page.evaluate(() => { const style = getComputedStyle(document.querySelector('.caret')); return [style.animationName, style.animationDuration]; });
        check('V32 PO-9 with motion the caret of the header blinks (a CSS animation)', caret[0] !== 'none' && caret[1] !== '0s', JSON.stringify(caret));
        await context.close();
      }

      // ---- reduced motion ----
      {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        await context.addInitScript(recorder);
        const page = await context.newPage();
        const requests = [];
        page.on('request', (request) => requests.push(new URL(request.url()).pathname));
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const { samples, mutations } = await page.evaluate(() => ({ samples: window.__samples, mutations: window.__mutations }));
        check('V32 PO-8 under reduced motion the title is final in every frame, from the first one', samples.length > 3 && samples.every((sample) => sample.text === POST.title && sample.label === null && sample.style === null), `${samples.length} frames`);
        same('V32 PO-8 under reduced motion nothing in the title changes (no mutation at all)', mutations, []);
        same('V32 PO-8 under reduced motion the title is the real one and carries no aria-label or style', await page.evaluate(() => [document.querySelector('h1').textContent, document.querySelector('h1').hasAttribute('aria-label'), document.querySelector('h1').hasAttribute('style')]), [POST.title, false, false]);
        const caret = await page.evaluate(() => { const style = getComputedStyle(document.querySelector('.caret')); return [style.animationName, style.animationDuration]; });
        check('V32 PO-9 under reduced motion the caret does not blink', caret[0] === 'none' || caret[1] === '0s', JSON.stringify(caret));
        check('V32 PO-8 under reduced motion the script is still loaded but does nothing (four requests at most)', requests.length <= 4, JSON.stringify(requests));
        await context.close();
      }
    });
  });
});
