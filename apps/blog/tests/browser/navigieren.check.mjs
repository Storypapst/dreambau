// The prototype of the map "Navigieren" (prototypes/navigieren) in a real Chromium, under the policy of the live site.
// It is a prototype, so the lines are named KARTE-n and not after a rule of the spec:
// KARTE-1 readable without JavaScript · KARTE-2 nothing but its own three files, nothing the policy refuses ·
// KARTE-3 hover shows the short text · KARTE-4 a click walks the figure and opens the full text, Esc closes ·
// KARTE-5 the list drives the map · KARTE-6 keys move the figure · KARTE-7 the map goes on in every direction ·
// KARTE-8 de, fi, ar (right to left) · KARTE-9 phone · KARTE-10 reduced motion is a still picture.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { withBrowser } from '../lib/browser.mjs';
import { DEMO } from '../lib/demo.mjs';
import { withScratch } from '../lib/scratch.mjs';
import { buildMap } from '../../prototypes/navigieren/build.mjs';

const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const URL_BASE = 'http://blog.test/blog/navigieren/';
const NUMBERS = DEMO.map((post) => post.n);

async function open(browser, dir, { query = '', ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const requests = [], problems = [];
  await context.route('http://blog.test/**', (route) => {
    requests.push(route.request().url());
    const name = new URL(route.request().url()).pathname.replace('/blog/navigieren/', '') || 'index.html';
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)], headers: { 'content-security-policy': POLICY }, body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(String(error.message)));
  page.on('request', (request) => { if (!request.url().startsWith('http://blog.test/')) problems.push(`foreign request ${request.url()}`); });
  await page.goto(`${URL_BASE}${query}`, { waitUntil: 'networkidle' });
  const state = () => page.evaluate(() => window.karte.state());
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { context, page, requests, problems, state, overflow };
}
const visibleMark = (state, box) => state.marks.find((mark) => mark.x > 60 && mark.x < box.width - 60 && mark.y > 60 && mark.y < box.height - 80);

await run(async () => {
  await withScratch('navigieren', async (dir) => {
    buildMap({ outDir: dir });
    await withBrowser(async (browser) => {
      // ---- KARTE-1: without JavaScript ----
      {
        const { context, page, overflow } = await open(browser, dir, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
        same('KARTE-1 without JavaScript the seven posts stand in the list, newest first', await page.locator('#posts li.row').evaluateAll((rows) => rows.map((row) => row.dataset.no)), NUMBERS);
        same('KARTE-1 without JavaScript every post shows its full text', await page.locator('#posts .voll').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 20).length), DEMO.length);
        check('KARTE-1 without JavaScript there is no empty stage and no sheet', await page.locator('#stage').isHidden() && await page.locator('#panel').isHidden());
        same('KARTE-9 without JavaScript the phone page does not scroll sideways', await overflow(), 0);
        await context.close();
      }

      // ---- KARTE-2 to KARTE-4, KARTE-7: the map with a mouse ----
      {
        const { context, page, requests, problems, state } = await open(browser, dir);
        same('KARTE-2 the page asks for its own three files and nothing else', requests.map((url) => url.replace(URL_BASE, '')).sort(), ['', 'karte.css', 'karte.js']);
        const first = await state();
        same('KARTE-2 the map found the seven posts of the list', first.posts, DEMO.length);
        check('KARTE-2 the newest post and at least two more are in view at the start', first.marks.some((mark) => mark.no === NUMBERS[0]) && new Set(first.marks.map((mark) => mark.no)).size >= 3, first.marks.map((mark) => mark.no).join(' '));
        const box = await page.locator('#map').boundingBox();
        const mark = visibleMark(first, box);
        check('KARTE-3 a post is in view at the start', Boolean(mark));
        await page.mouse.move(box.x + mark.x, box.y + mark.y);
        await page.locator('#tip').waitFor({ state: 'visible' });
        const demo = DEMO.find((post) => post.n === mark.no);
        check('KARTE-3 hover shows number, date, title and the short text', (await page.locator('#tip').innerText()).includes(demo.title) && (await page.locator('#tip .th').innerText()).includes(demo.date) && (await page.locator('#tip .tx').innerText()).length > 20);
        same('KARTE-3 hover opens nothing', (await state()).opened, null);
        await page.mouse.click(box.x + mark.x, box.y + mark.y);
        await page.locator('#panel').waitFor({ state: 'visible', timeout: 30000 });
        same('KARTE-4 a click walks the figure to the post and opens it', (await state()).opened, mark.no);
        same('KARTE-4 the sheet shows the title', await page.locator('#panel-title').innerText(), demo.title);
        check('KARTE-4 the sheet shows the full text', (await page.locator('#panel-body p').count()) >= 1 && (await page.locator('#panel-body').innerText()).length > 250);
        same('KARTE-4 the focus is on the close button', await page.evaluate(() => document.activeElement.id), 'close');
        await page.keyboard.press('Escape');
        check('KARTE-4 Esc closes the sheet', await page.locator('#panel').isHidden() && (await state()).opened === null);

        await page.locator('#stage').focus();
        const free = (await state()).free.find((top) => top.x > 80 && top.x < box.width - 80 && top.y > 80 && top.y < box.height - 120);
        await page.mouse.click(box.x + free.x, box.y + free.y);
        await page.waitForFunction(() => window.karte.state().near === null && !window.karte.state().walking, null, { timeout: 30000 });
        same('KARTE-6 walking to a place without a post opens nothing', (await state()).opened, null);
        await page.locator('#stage').focus();
        await page.keyboard.press('Space');
        check('KARTE-6 away from a post the space bar makes the figure jump', (await state()).jumping);
        check('KARTE-6 the keys are written in the corner of the map', (await page.locator('.hud .keys').innerText()).includes('Leertaste'));
        const before = await state();
        for (let n = 0; n < 6; n += 1) {
          await page.mouse.move(box.x + 900, box.y + 400);
          await page.mouse.down();
          await page.mouse.move(box.x + 200, box.y + 150, { steps: 4 });
          await page.mouse.up();
        }
        const after = await state();
        check('KARTE-7 dragging moves the map far beyond the first view', after.camera.x - before.camera.x > 3500, `${Math.round(after.camera.x - before.camera.x)} px`);
        check('KARTE-7 there are posts there too: the landscape goes on', after.marks.length >= 3, `${after.marks.length} places`);
        same('KARTE-7 dragging does not move the figure', after.figure, before.figure);
        same('KARTE-2 the console is clean and the policy refused nothing', problems, []);
        same('KARTE-2 no cookie and nothing in the storage of the browser', [(await context.cookies()).length, await page.evaluate(() => localStorage.length + sessionStorage.length)], [0, 0]);
        await context.close();
      }

      // ---- KARTE-5, KARTE-6, KARTE-10: reduced motion, the list and the keys ----
      {
        const { context, page, problems, state } = await open(browser, dir, { reducedMotion: 'reduce' });
        const still = () => page.evaluate(() => document.getElementById('map').toDataURL());
        const one = await still();
        await page.waitForTimeout(700);
        check('KARTE-10 with reduced motion the map is a still picture', one === await still());
        await page.locator('#posts li.row').nth(2).locator('.tt a').click();
        await page.locator('#panel').waitFor({ state: 'visible' });
        same('KARTE-5 a row of the list brings the figure to its post and opens it', (await state()).opened, NUMBERS[2]);
        await page.keyboard.press('Escape');
        same('KARTE-5 after closing the focus is back on the row', await page.evaluate(() => document.activeElement.getAttribute('href')), `#b-${NUMBERS[2]}`);
        await page.locator('#stage').focus();
        same('KARTE-6 at a post the sign says so and the read button shows', [(await state()).near, await page.locator('#read').isVisible()], [NUMBERS[2], true]);
        await page.keyboard.press('Space');
        same('KARTE-6 the space bar opens the post the figure stands at', (await state()).opened, NUMBERS[2]);
        await page.keyboard.press('Escape');
        const from = (await state()).figure;
        await page.locator('#stage').focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        const to = (await state()).figure;
        check('KARTE-6 the arrow keys move the figure', to.i !== from.i || to.j !== from.j, `${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
        same('KARTE-10 the console is clean with reduced motion', problems, []);
        await context.close();
      }

      // ---- KARTE-8: languages ----
      for (const [lang, dir_, title] of [['en', 'ltr', 'Navigate'], ['fi', 'ltr', 'Navigointi'], ['ar', 'rtl', 'التنقّل']]) {
        const { context, page, problems, overflow } = await open(browser, dir, { query: `?lang=${lang}` });
        same(`KARTE-8 ${lang}: language and direction of the page`, await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]), [lang, dir_]);
        same(`KARTE-8 ${lang}: the title is translated`, await page.locator('h1 [data-l="title"]').innerText(), title);
        same(`KARTE-8 ${lang}: a post keeps its own language and direction`, await page.locator('#posts li.row .tt a').first().evaluate((a) => [a.lang, a.dir]), ['de', 'ltr']);
        same(`KARTE-8 ${lang}: no sideways scrolling, clean console`, [await overflow(), problems], [0, []]);
        await context.close();
      }

      // ---- KARTE-9: phone ----
      {
        const { context, page, problems, state, overflow } = await open(browser, dir, { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
        same('KARTE-9 the phone page does not scroll sideways', await overflow(), 0);
        const box = await page.locator('#map').boundingBox();
        const mark = visibleMark(await state(), box);
        check('KARTE-9 a post is in view on the phone', Boolean(mark));
        await page.touchscreen.tap(box.x + mark.x, box.y + mark.y);
        await page.locator('#panel').waitFor({ state: 'visible' });
        const sheet = await page.locator('#panel').boundingBox();
        check('KARTE-9 the sheet comes from below and is as wide as the phone', Math.round(sheet.width) === 390 && Math.round(sheet.y + sheet.height) === 844, JSON.stringify(sheet));
        const small = await page.locator('#close, #center').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width < 44 || rect.height < 44).length);
        same('KARTE-9 the buttons are at least 44 px', small, 0);
        same('KARTE-9 the console is clean on the phone', problems, []);
        await context.close();
      }
    });
  });
});
