// The map "Navigieren" on the list page /blog/ of the real build of posts/, in a real Chromium under the policy of the
// live site (no container needed). Lines MAP-n (owner's decision of 2026-11-26): MAP-4 without JavaScript only the list ·
// MAP-5 the map starts with its help and finds every post of the list · MAP-6 a place opens the post in a sheet with its
// full text, its source and the way to its page; Esc closes · MAP-7 a title of the list is a plain link to the post page ·
// MAP-8 the phone: no sideways scroll, the sheet from below, the read button · MAP-9 a fault gives the list back.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { withBrowser, withBuild } from '../lib/browser.mjs';
import { ROOT } from '../lib/paths.mjs';

const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.xml': 'application/atom+xml' };
const ORIGIN = 'http://blog.test';

async function open(browser, publicDir, { init = null, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const requests = [], problems = [];
  await context.route(`${ORIGIN}/**`, (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/blog\//, '');
    requests.push(relative);
    let file = path.join(publicDir, relative);
    if (relative === '' || relative.endsWith('/')) file = path.join(file, 'index.html');
    if (!file.startsWith(publicDir) || !fs.existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)], headers: { 'content-security-policy': POLICY }, body: fs.readFileSync(file) });
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(String(error.message)));
  page.on('request', (request) => { if (!request.url().startsWith(`${ORIGIN}/`) && !request.url().startsWith('data:')) problems.push(`foreign request ${request.url()}`); });
  await page.goto(`${ORIGIN}/blog/`, { waitUntil: 'networkidle' });
  const state = () => page.evaluate(() => window.karte.state());
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { context, page, requests, problems, state, overflow };
}
const visibleMark = (state, box) => state.marks.find((mark) => mark.kind === 'post' && mark.x > 60 && mark.x < box.width - 60 && mark.y > 60 && mark.y < box.height - 80);

await run(async () => {
  await withBuild(async ({ publicDir, manifest }) => {
    const numbers = manifest.posts.map((post) => String(post.number).padStart(2, '0')).reverse();
    const addressOf = Object.fromEntries(manifest.posts.map((post) => [String(post.number).padStart(2, '0'), `/blog/${post.address}/`]));
    await withBrowser(async (browser) => {
      // ---- MAP-4: without JavaScript ----
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const { context, page, overflow } = await open(browser, publicDir, { javaScriptEnabled: false, viewport });
        same(`MAP-4 at ${viewport.width} without JavaScript the map and its sheet are not shown`, await page.evaluate(() => [getComputedStyle(document.querySelector('.karte')).display, document.getElementById('panel').hidden]), ['none', true]);
        same(`MAP-4 at ${viewport.width} without JavaScript the list shows every post, newest first`, await page.locator('#posts li.row').evaluateAll((rows) => rows.map((row) => row.dataset.no)), numbers);
        check(`MAP-4 at ${viewport.width} the full texts for the sheet are not on the page`, (await page.locator('#posts template.voll').count()) === numbers.length && !(await page.locator('#posts').innerText()).includes('Nichts ist eingebettet'));
        same(`MAP-4 at ${viewport.width} no sideways scrolling`, await overflow(), 0);
        await context.close();
      }

      // ---- MAP-5, MAP-6, MAP-7: desktop with a mouse ----
      {
        const { context, page, requests, problems, state } = await open(browser, publicDir);
        same('MAP-5 the page asks for its own three files and nothing else', [...requests].sort(), ['', 'blog.css', 'karte.js']);
        const first = await state();
        same('MAP-5 the map found every post of the list and no tree', [first.posts, first.trees], [numbers.length, 0]);
        check('MAP-5 the map is in view above the list, the help lies over it', await page.locator('#stage').isVisible() && await page.locator('#help').isVisible() && (await page.locator('#stage').boundingBox()).y < (await page.locator('#posts').boundingBox()).y);
        await page.locator('#help-go').click();
        check('MAP-5 "Los geht’s" closes the help and the map has the keyboard', await page.locator('#help').isHidden() && await page.evaluate(() => document.activeElement.id === 'stage'));
        const box = await page.locator('#map').boundingBox();
        const mark = visibleMark(await state(), box);
        check('MAP-5 a post is in view at the start', Boolean(mark), JSON.stringify(first.marks));
        await page.mouse.move(box.x + mark.x, box.y + mark.y);
        await page.locator('#tip').waitFor({ state: 'visible' });
        const row = page.locator(`#posts li.row[data-no="${mark.no}"]`);
        const demo = (await row.locator('.draft').count()) === 1;
        check('MAP-5 pointing at a place shows its title, and the sign "Demo" for a demo post', (await page.locator('#tip').innerText()).includes(await row.locator('.tt a').innerText()) && (await page.locator('#tip .draft').count()) === (demo ? 1 : 0));
        await page.mouse.click(box.x + mark.x, box.y + mark.y);
        await page.locator('#panel').waitFor({ state: 'visible', timeout: 30000 });
        same('MAP-6 a click walks the figure to the place and opens its post', (await state()).opened, mark.no);
        same('MAP-6 the sheet shows the title of the post', await page.locator('#panel-title').innerText(), await row.locator('.tt a').innerText());
        const body = await page.locator('#panel-body').evaluate((el) => ({ paragraphs: el.querySelectorAll(':scope > p:not(.pmore)').length, text: el.innerText.length, source: el.querySelector('a.sk') && el.querySelector('a.sk').getAttribute('href'), page: el.querySelector('.pmore a') && el.querySelector('.pmore a').getAttribute('href'), size: parseFloat(getComputedStyle(el).fontSize), width: el.getBoundingClientRect().width }));
        check('MAP-6 the sheet holds the full text, the source link and the way to the post page', body.paragraphs >= 2 && body.text > 300 && /^https:\/\//.test(body.source || '') && body.page === addressOf[mark.no], JSON.stringify(body));
        check('MAP-6 the text reads like a post page: 17 px, at most about 36 em wide', body.size === 17 && body.width <= 17 * 36 + 1, JSON.stringify(body));
        same('MAP-6 the sign "Demo" is in the head of the sheet of a demo post', await page.locator('#panel-meta .draft').count(), demo ? 1 : 0);
        same('MAP-6 the focus is on the close button', await page.evaluate(() => document.activeElement.id), 'close');
        await page.keyboard.press('Escape');
        check('MAP-6 Esc closes the sheet', await page.locator('#panel').isHidden() && (await state()).opened === null);
        await page.locator('#stage').focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        check('MAP-6 the arrow keys move the figure', JSON.stringify((await state()).figure) !== JSON.stringify(first.figure));
        same('MAP-5 the console is clean and the policy refused nothing', problems, []);
        same('MAP-5 no cookie and nothing in the storage of the browser', [(await context.cookies()).length, await page.evaluate(() => localStorage.length + sessionStorage.length)], [0, 0]);
        await page.locator('#posts li.row').nth(1).locator('.tt a').click();
        await page.waitForURL(`${ORIGIN}${addressOf[numbers[1]]}`);
        same('MAP-7 a title of the list is a plain link: it opens the post page', new URL(page.url()).pathname, addressOf[numbers[1]]);
        await context.close();
      }

      // ---- MAP-8: phone ----
      {
        const { context, page, problems, state, overflow } = await open(browser, publicDir, { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
        same('MAP-8 the phone page does not scroll sideways', await overflow(), 0);
        check('MAP-8 on the phone the help shows the finger pictures', await page.locator('#help .htouch').isVisible() && await page.locator('#help .hdesk').isHidden());
        await page.locator('#help-go').click();
        same('MAP-8 on the phone: the jump and read buttons, no box over the map', [await page.locator('#jump').isVisible(), await page.locator('#read').isVisible(), await page.locator('#tip').isVisible()], [true, true, false]);
        const box = await page.locator('#map').boundingBox();
        const mark = visibleMark(await state(), box);
        await page.touchscreen.tap(box.x + mark.x, box.y + mark.y);
        await page.locator('#panel').waitFor({ state: 'visible' });
        const sheet = await page.locator('#panel').boundingBox();
        check('MAP-8 the sheet comes from below and is as wide as the phone', Math.round(sheet.width) === 390 && Math.round(sheet.y + sheet.height) === 844, JSON.stringify(sheet));
        const small = await page.locator('#close, #panel-body .pmore a, #panel-body a.sk').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width < 44 || rect.height < 44).length);
        same('MAP-8 the buttons and links of the sheet are at least 44 px', small, 0);
        await page.keyboard.press('Escape');
        same('MAP-8 the console is clean on the phone', problems, []);
        await context.close();
      }

      // ---- MAP-9: a fault switches the map off once and gives the list back ----
      {
        const init = () => { let calls = 0; const real = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function fillText(...args) { calls += 1; if (calls > 20000) throw new Error('made-up fault in fillText'); return real.apply(this, args); }; };
        const { context, page, problems } = await open(browser, publicDir, { init });
        await page.waitForFunction(() => !document.documentElement.classList.contains('js'), null, { timeout: 20000 });
        await page.waitForTimeout(1200);
        same('MAP-9 a fault while drawing: one line in the console, not one per frame', [problems.length, /karte\.js: the map was switched off/.test(problems[0] || '')], [1, true]);
        check('MAP-9 the map is gone and the list is there', await page.locator('.karte').isHidden() && await page.locator('#posts').isVisible());
        await context.close();
      }
    });
  }, { postsDir: path.join(ROOT, 'posts') });
});
