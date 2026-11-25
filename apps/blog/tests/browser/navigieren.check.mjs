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
import { buildMap, cutLink, readTopics } from '../../prototypes/navigieren/build.mjs';
import { FIXTURES, REPO, ROOT } from '../lib/paths.mjs';

const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const URL_BASE = 'http://blog.test/blog/navigieren/';
const NUMBERS = DEMO.map((post) => post.n);

async function open(browser, dir, { query = '', page: change = null, init = null, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...options });
  const requests = [], problems = [];
  await context.route('http://blog.test/**', (route) => {
    requests.push(route.request().url());
    const name = new URL(route.request().url()).pathname.replace('/blog/navigieren/', '') || 'index.html';
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    const body = name === 'index.html' && change ? change(fs.readFileSync(file, 'utf8')) : fs.readFileSync(file);
    return route.fulfill({ status: 200, contentType: MIME[path.extname(file)], headers: { 'content-security-policy': POLICY }, body });
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(String(error.message)));
  page.on('request', (request) => { if (!request.url().startsWith('http://blog.test/')) problems.push(`foreign request ${request.url()}`); });
  await page.goto(`${URL_BASE}${query}`, { waitUntil: 'networkidle' });
  const state = () => page.evaluate(() => window.karte.state());
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  return { context, page, requests, problems, state, overflow };
}
const worldOf = (figure) => ((figure.i - figure.j) * 26) / 2;   // the x of the camera when it rests on the figure
const visibleMark = (state, box) => state.marks.find((mark) => mark.kind === 'post' && mark.x > 60 && mark.x < box.width - 60 && mark.y > 60 && mark.y < box.height - 80);

await run(async () => {
  // ---- KARTE-13: the files of the prototype ----
  const labels = JSON.parse(fs.readFileSync(path.join(ROOT, 'prototypes', 'navigieren', 'labels.json'), 'utf8'));
  const keysOf = (lang) => Object.keys(labels[lang]).sort();
  for (const lang of Object.keys(labels)) same(`KARTE-13 the labels of "${lang}" have the same keys as the German ones and none is empty`, [keysOf(lang), Object.values(labels[lang]).filter((text) => typeof text !== 'string' || text.trim() === '').length], [keysOf('de'), 0]);
  const tokens = (file) => Object.fromEntries([...fs.readFileSync(file, 'utf8').matchAll(/--(old|draft):\s*([\d,\s]+)/g)].map((match) => [match[1], match[2].replace(/\s/g, '')]));
  same('KARTE-13 the two colours that karte.css adds are the ones of /referenzen/', tokens(path.join(ROOT, 'prototypes', 'navigieren', 'karte.css')), tokens(path.join(REPO, 'apps', 'website', 'site', 'website-assets', 'references.css')));
  same('KARTE-13 the start of a cut is a query parameter, also for an address without one', [cutLink({ link: 'https://videos.example.test/watch?v=a', start: 95 }), cutLink({ link: 'https://videos.example.test/abc', start: 95 })], ['https://videos.example.test/watch?v=a&t=95s', 'https://videos.example.test/abc?t=95s']);
  check('KARTE-13 a cut that is not an https address is refused', (() => { try { cutLink({ link: 'http://videos.example.test/a', start: 1 }); return false; } catch { return true; } })());
  await withScratch('navigieren-rules', async (scratch) => {
    const real = path.join(scratch, 'posts');
    fs.mkdirSync(path.join(real, '2026'), { recursive: true });
    const fixture = fs.readFileSync(path.join(FIXTURES, '2026', 'notiz-aus-der-werkstatt.md'), 'utf8').replace(/^example: true\n/m, '');
    fs.writeFileSync(path.join(real, '2026', 'notiz-aus-der-werkstatt.md'), fixture);
    const refused = (options) => { try { buildMap({ outDir: path.join(scratch, 'out'), ...options }); return ''; } catch (error) { return String(error.message); } };
    check('KARTE-13 the invented trees are not built together with posts that are not the fixtures', /invented example/.test(refused({ postsDir: real })), refused({ postsDir: real }));
    const bad = path.join(scratch, 'themen.json');
    fs.writeFileSync(bad, JSON.stringify({ example: true, topics: { ki: { de: 'KI', en: 'AI' } }, posts: { '01': 'nix' }, trees: [{ id: 'x', topic: 'ki', title: { de: 'T', en: 'T' }, aspects: [{ id: 'a', stance: 2, water: -1, label: { de: 'L' }, say: { de: 'S', en: 'S' }, video: { title: 'V', link: 'http://videos.example.test/a', start: 9, end: 3 } }] }] }));
    const faults = (() => { try { readTopics(bad); return ''; } catch (error) { return String(error.message); } })();
    check('KARTE-13 a themen.json with faults is refused with every fault named', ['posts.01', 'stance', 'water', 'label.en', 'start and end', 'video.link'].every((word) => faults.includes(word)), faults);
    // many posts: the tile of places grows, and every row of the list still reaches its post
    const many = path.join(scratch, 'many');
    fs.mkdirSync(path.join(many, '2026'), { recursive: true });
    for (let n = 0; n < 160; n += 1) {
      const day = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
      fs.writeFileSync(path.join(many, '2026', `beitrag-nummer-${String(n).padStart(3, '0')}.md`), fixture.replace(/^title: .*$/m, `title: Beitrag Nummer ${n}`).replace(/^date: .*$/m, `date: ${day}`));
    }
    const none = path.join(scratch, 'none.json');
    fs.writeFileSync(none, JSON.stringify({ topics: {}, posts: {}, trees: [] }));
    const manyOut = path.join(scratch, 'many-out');
    buildMap({ postsDir: many, outDir: manyOut, topicsFile: none });
    await withBrowser(async (browser) => {
      const { context, page, problems, state } = await open(browser, manyOut, { reducedMotion: 'reduce' });
      const first = await state();
      check('KARTE-4 with 160 posts the search reaches a whole tile of places', first.posts === 160 && first.reach >= first.tile[0] * first.tile[1] * 6, JSON.stringify([first.posts, first.reach, first.tile]));
      const opened = [];
      for (const index of [159, 80, 1]) {
        await page.locator('#posts li.row').nth(index).locator('.tt a').click();
        await page.locator('#panel').waitFor({ state: 'visible' });
        opened.push((await state()).opened === await page.locator('#posts li.row').nth(index).getAttribute('data-no'));
        await page.keyboard.press('Escape');
      }
      same('KARTE-4 with 160 posts a row of the list still brings the figure to its post', [opened, problems], [[true, true, true], []]);
      await context.close();
    });
  });

  await withScratch('navigieren', async (dir) => {
    buildMap({ outDir: dir });
    await withBrowser(async (browser) => {
      // ---- KARTE-1: without JavaScript ----
      {
        const { context, page, overflow } = await open(browser, dir, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
        same('KARTE-1 without JavaScript the seven posts stand in the list, newest first', await page.locator('#posts li.row').evaluateAll((rows) => rows.map((row) => row.dataset.no)), NUMBERS);
        same('KARTE-1 without JavaScript every post shows its full text', await page.locator('#posts .voll').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 20).length), DEMO.length);
        same('KARTE-11 without JavaScript the two trees show their ten aspects with statement and clip', await page.locator('#trees .asp li').evaluateAll((items) => [items.length, items.filter((li) => li.querySelector('.say').getBoundingClientRect().height > 10 && /\d:\d\d–\d+:\d\d/.test(li.querySelector('.clip').textContent)).length]), [10, 10]);
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
        for (let n = 0; n < 200; n += 1) {
          await page.mouse.move(box.x + 1100, box.y + 450);
          await page.mouse.down();
          await page.mouse.move(box.x + 100, box.y + 60, { steps: 2 });
          await page.mouse.up();
        }
        const far = await state();
        check('KARTE-12 after a very long way the map still shows places', far.camera.x - before.camera.x > 150000 && far.marks.length >= 1, `${Math.round(far.camera.x - before.camera.x)} px, ${far.marks.length} places`);
        check('KARTE-12 what the map remembers stays bounded however far one goes (it was emptied on the way)', far.caches.emptied >= 1 && far.caches.mesas <= far.caches.limit + 400 && far.caches.bridges <= far.caches.limit * 2 + 800 && far.caches.chunks <= 4001, JSON.stringify(far.caches));
        await page.locator('#center').click();
        await page.waitForFunction((x) => Math.abs(window.karte.state().camera.x - x) < 200, before.camera.x + 0, { timeout: 5000 }).catch(() => {});
        check('KARTE-12 "Zur Figur" brings the map back at once', Math.abs((await state()).camera.x - worldOf(before.figure)) < 300, JSON.stringify((await state()).camera));
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
        // ---- KARTE-11: a tree island, zoomed in ----
        await page.locator('#t-ki-programmieren .tt a').click();
        await page.locator('#grove').waitFor({ state: 'visible' });
        same('KARTE-11 a tree opens zoomed in with one leaf per aspect', [(await state()).opened, (await state()).leaves], ['ki-programmieren', 6]);
        const xs = await page.locator('#zoom .leaf').evaluateAll((leaves) => leaves.map((leaf) => Math.round(leaf.getBoundingClientRect().x + leaf.getBoundingClientRect().width / 2)));
        same('KARTE-11 the aspects stand from left (untrue, hype) to right (great)', xs, [...xs].sort((a, b) => a - b));
        await page.locator('#zoom .leaf').nth(4).click();
        check('KARTE-11 an aspect shows its statement and the cut of the video', /Beispiel-Aussage/.test(await page.locator('#leafbox').innerText()) && /5:00–6:00/.test(await page.locator('#leafbox').innerText()), await page.locator('#leafbox').innerText());
        same('KARTE-11 the link starts the video at the cut', await page.locator('#leafbox a.sk').getAttribute('href'), 'https://videos.example.test/watch?v=beispiel-4&t=300s');
        await page.locator('#leafbox button').click();
        same('KARTE-11 watering counts once: 8 becomes 9 and the button is spent', [await page.locator('#zoom .leaf').nth(4).locator('.wn').innerText(), await page.locator('#leafbox button').isDisabled()], ['9', true]);
        same('KARTE-11 after watering the focus is on the aspect, not lost', await page.evaluate(() => document.activeElement.className.includes('leaf')), true);
        const inside = [];
        for (let n = 0; n < 14; n += 1) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => Boolean(document.activeElement.closest('#grove')))); }
        check('KARTE-11 the Tab key never leaves the open tree', inside.every(Boolean), JSON.stringify(inside));
        same('KARTE-11 the page behind the tree cannot be reached', await page.evaluate(() => [document.getElementById('stage').inert, document.querySelector('.logp').inert]), [true, true]);
        same('KARTE-11 no aspect of the tree covers another', await page.locator('#zoom .leaf').evaluateAll((leaves) => { const boxes = leaves.map((leaf) => leaf.getBoundingClientRect()); let count = 0; for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) if (boxes[a].left < boxes[b].right && boxes[b].left < boxes[a].right && boxes[a].top < boxes[b].bottom && boxes[b].top < boxes[a].bottom) count += 1; return count; }), 0);
        await page.locator('#zin').click();
        same('KARTE-11 the tree can be zoomed', (await state()).zoom, 1.5);
        await page.locator('#cloud button').nth(1).click();
        same('KARTE-11 the cloud changes the topic: another tree', [(await state()).opened, (await state()).leaves], ['politik-regeln', 4]);
        await page.keyboard.press('Escape');
        check('KARTE-11 Esc closes the tree and the page behind is usable again', await page.locator('#grove').isHidden() && !(await page.evaluate(() => document.getElementById('stage').inert)));
        await page.locator('#posts li.row').nth(2).locator('.tt a').click();
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

      // ---- KARTE-12: a fault switches the map off once and gives the list back ----
      for (const [label, options] of [
        ['a fault while drawing', { init: () => { let calls = 0; const real = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function fillText(...args) { calls += 1; if (calls > 20000) throw new Error('made-up fault in fillText'); return real.apply(this, args); }; } }],
        ['a page without the tree view', { page: (html) => html.replace(/<section class="grove"[\s\S]*?<\/section>/, '') }],
      ]) {
        const { context, page, problems } = await open(browser, dir, options);
        await page.waitForFunction(() => !document.documentElement.classList.contains('js'), null, { timeout: 20000 });
        await page.waitForTimeout(1200);
        same(`KARTE-12 ${label}: one line in the console, not one per frame`, [problems.length, /karte\.js: the map was switched off/.test(problems[0] || '')], [1, true]);
        check(`KARTE-12 ${label}: the stage is gone and every post shows its full text again`, await page.locator('#stage').isHidden() && (await page.locator('#posts .voll').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height > 20).length)) === DEMO.length);
        await page.locator('#posts li.row').nth(1).locator('.tt a').click();
        check(`KARTE-12 ${label}: a row is a plain link again and nothing opens`, (await page.evaluate(() => location.hash)) === `#b-${NUMBERS[1]}` && await page.locator('#panel').isHidden());
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
        same('KARTE-9 on the phone: jump and read buttons, no box over the map', [await page.locator('#jump').isVisible(), await page.locator('#read').isVisible(), await page.locator('#tip').isVisible()], [true, true, false]);
        const box = await page.locator('#map').boundingBox();
        const mark = visibleMark(await state(), box);
        check('KARTE-9 a post is in view on the phone', Boolean(mark));
        await page.touchscreen.tap(box.x + mark.x, box.y + mark.y);
        await page.locator('#panel').waitFor({ state: 'visible' });
        const sheet = await page.locator('#panel').boundingBox();
        check('KARTE-9 the sheet comes from below and is as wide as the phone', Math.round(sheet.width) === 390 && Math.round(sheet.y + sheet.height) === 844, JSON.stringify(sheet));
        await page.keyboard.press('Escape');
        same('KARTE-9 after closing the sheet on the phone no box covers the map', [await page.locator('#panel').isHidden(), await page.locator('#tip').isHidden()], [true, true]);
        await page.locator('#t-ki-programmieren .tt a').click();
        await page.locator('#grove').waitFor({ state: 'visible' });
        const overlaps = await page.locator('#zoom .leaf').evaluateAll((leaves) => { const boxes = leaves.map((leaf) => leaf.getBoundingClientRect()); let count = 0; for (let a = 0; a < boxes.length; a += 1) for (let b = a + 1; b < boxes.length; b += 1) if (boxes[a].left < boxes[b].right && boxes[b].left < boxes[a].right && boxes[a].top < boxes[b].bottom && boxes[b].top < boxes[a].bottom) count += 1; return count; });
        same('KARTE-9 on the phone no aspect of the tree covers another', overlaps, 0);
        same('KARTE-9 on the phone the tree does not make the page scroll sideways', await page.evaluate(() => document.getElementById('grove').scrollWidth - document.getElementById('grove').clientWidth), 0);
        await page.locator('#grove-close').click();
        await page.locator('#posts li.row').first().locator('.tt a').click();
        await page.locator('#panel').waitFor({ state: 'visible' });
        const small = await page.locator('#close, #center').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).filter((rect) => rect.width < 44 || rect.height < 44).length);
        same('KARTE-9 the buttons are at least 44 px', small, 0);
        same('KARTE-9 the console is clean on the phone', problems, []);
        await context.close();
      }
    });
  });
});
