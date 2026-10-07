#!/usr/bin/env node
// End-to-end behaviour of the real page (not the manual-clock test mode):
//   sound allowed by the browser → plays on its own, mute button works
//   sound blocked by the browser → picture runs, button invites, first click starts the music in sync
//   Esc skips to the final composition and shows the closing line
//   prefers-reduced-motion → still final frame, no sound, "Animation abspielen"
//   no WebGL → static fallback with tagline and closing line
//   a failure → the page stays silent; no audio support → no sound button; low frame rate → the clock keeps real time
//   no request leaves the page
//
//   node tools/e2e.mjs <id|all|clock|random> [--dev]      (clock: runtime clock checks with the light test production; random: choice)
import { launch, pageUrl, parseArgs, playwright } from './lib.mjs';
import { IDS } from './budget.mjs';

const a = parseArgs(process.argv.slice(2));
const mode = a._[0] || 'all';                     // all | clock | random | <production id>
const ids = mode === 'all' ? IDS : (mode === 'clock' || mode === 'random') ? [] : [mode];
const extra = a.dev ? { dev: 1 } : {};
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a request is the page's own when it is a local file/data/blob URL or has exactly the origin of BASE_URL
const baseOrigin = process.env.BASE_URL ? new URL(process.env.BASE_URL).origin : null;
const ownRequest = u => { try { const x = new URL(u); return ['file:', 'data:', 'blob:'].includes(x.protocol) || (!!baseOrigin && x.origin === baseOrigin); } catch (e) { return false; } };
const dbg = page => page.evaluate(() => ({ ...window.Dream.dbg(), state: window.Dream.state }));

async function newPage(browser, id, params = {}, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...opts });
  const page = await ctx.newPage();
  const logs = [], reqs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('request', r => reqs.push(r.url()));
  await page.goto(pageUrl({ anim: id, q: .5, lang: 'de', ...extra, ...params }));
  return { page, logs, reqs, ctx };
}

for (const id of ids) {
  console.log(`\n== ${id} ==`);

  // 1. browser allows autoplay
  {
    const browser = await launch({ autoplay: true });
    const { page, logs, reqs, ctx } = await newPage(browser, id);
    let d;
    for (let i = 0; i < 60; i++) { await sleep(500); d = await dbg(page); if (d.playing) break; }
    check('autoplay allowed: music starts without interaction', d.playing && d.state.audio === 'on', `audio=${d.state.audio} ctx=${d.ctx}`);
    const g0 = d.frames; await sleep(2500);
    const d2 = await dbg(page);
    const gfps = Math.max(.5, (d2.frames - g0) / 2.5), gtol = Math.max(.25, 2.5 / gfps);
    check('clock follows the audio', d2.audioT != null && Math.abs(d2.T - d2.audioT) < gtol, `T=${d2.T.toFixed(2)} audioT=${d2.audioT && d2.audioT.toFixed(2)}, ${gfps.toFixed(1)} fps in software GL, tolerance ${gtol.toFixed(2)} s`);
    await page.click('#snd');
    await sleep(400);
    const d3 = await dbg(page);
    check('mute button mutes', d3.muted && d3.state.audio === 'off' && d3.gain < .2, `gain=${d3.gain}`);
    await page.keyboard.press('m'); await sleep(400);
    const d4 = await dbg(page);
    check('M key unmutes', !d4.muted && d4.state.audio === 'on', `gain=${d4.gain}`);
    // Esc → final composition
    await page.keyboard.press('Escape'); await sleep(1200);
    const d5 = await dbg(page);
    const cta = await page.evaluate(() => ({ on: document.getElementById('cta').classList.contains('on'), done: document.documentElement.classList.contains('done') }));
    check('Esc jumps to the final composition and shows the closing line', cta.on && cta.done && d5.T >= d5.fin && !d5.playing, `T=${d5.T.toFixed(1)}, fin=${d5.fin}`);
    const a11y = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent.trim(),
      snd: document.getElementById('snd').getAttribute('aria-label'), role: document.getElementById('snd').getAttribute('role'), checked: document.getElementById('snd').getAttribute('aria-checked'),
      skip: document.getElementById('skip').textContent.trim(),
      mail: document.querySelector('#cta a')?.getAttribute('href'),
      lang: document.documentElement.lang,
    }));
    check('accessible: tagline as heading, sound switch (role, state), skip button, mailto link, lang=de', /Jeht nich….*jibs nich….*dreambau\.com/.test(a11y.h1) && a11y.snd === 'Ton' && a11y.role === 'switch' && a11y.checked === 'true' && /überspringen/.test(a11y.skip) && a11y.mail === 'mailto:info@dreambau.com' && a11y.lang === 'de', JSON.stringify(a11y));
    check('no console errors', !logs.some(l => /^\[(error|pageerror)\]/.test(l)), logs.filter(l => /^\[(error|pageerror)\]/.test(l)).join(' | '));
    const offsite = reqs.filter(u => !ownRequest(u));
    check('no network request leaves the page', offsite.length === 0, offsite.join(', '));
    await ctx.close(); await browser.close();
  }

  // 2. browser blocks autoplay until a gesture
  {
    const browser = await launch({ autoplay: false });
    const { page, ctx } = await newPage(browser, id);
    let d;
    for (let i = 0; i < 20; i++) { await sleep(300); d = await dbg(page); if (d.state.audio === 'blocked') break; }
    check('autoplay blocked: button invites to switch the sound on', d.state.audio === 'blocked' && !d.playing, `audio=${d.state.audio} ctx=${d.ctx}`);
    const t1 = d.T;
    for (let i = 0; i < 60; i++) { await sleep(500); d = await dbg(page); if (d.T > t1 + .3) break; }
    check('autoplay blocked: picture keeps running', d.T > t1 + .3, `T ${t1.toFixed(2)} → ${d.T.toFixed(2)} (software rendering can be slow, the clock only needs to advance)`);
    for (let i = 0; i < 40 && !(await dbg(page)).ready; i++) await sleep(500);
    await page.mouse.click(300, 300);
    for (let i = 0; i < 20; i++) { await sleep(300); d = await dbg(page); if (d.playing) break; }
    check('first click starts the music', d.playing && d.state.audio === 'on', `audio=${d.state.audio} ctx=${d.ctx}`);
    const f0 = d.frames; await sleep(2500); d = await dbg(page);
    const fps = Math.max(.5, (d.frames - f0) / 2.5), tol = Math.max(.3, 2.5 / fps);      // a frame-bound clock cannot be closer than a few frames
    check('music joins in sync', d.audioT != null && Math.abs(d.T - d.audioT) < tol, `T=${d.T.toFixed(2)} audioT=${d.audioT && d.audioT.toFixed(2)}, ${fps.toFixed(1)} fps in software GL, tolerance ${tol.toFixed(2)} s`);
    await ctx.close(); await browser.close();
  }

  // 2b. blocked autoplay, the visitor taps the sound button itself: that must switch the sound ON and leave it on
  {
    const browser = await launch({ autoplay: false });
    const { page, ctx } = await newPage(browser, id);
    let d;
    for (let i = 0; i < 20; i++) { await sleep(300); d = await dbg(page); if (d.state.audio === 'blocked') break; }
    for (let i = 0; i < 80 && !(await dbg(page)).ready; i++) await sleep(500);
    await page.hover('#snd'); await page.mouse.down(); await sleep(900); await page.mouse.up();      // a press that is held for a moment
    for (let i = 0; i < 20; i++) { await sleep(300); d = await dbg(page); if (d.playing) break; }
    await sleep(600); d = await dbg(page);
    check('blocked autoplay: pressing the sound button switches the sound on and keeps it on', d.playing && !d.muted && d.state.audio === 'on', `playing=${d.playing} muted=${d.muted} audio=${d.state.audio}`);
    await ctx.close(); await browser.close();
  }

  // 2c. after a failure (lost WebGL context) the static page stays silent, also when the tab is hidden and shown again
  {
    const browser = await launch({ autoplay: true });
    const { page, ctx } = await newPage(browser, id);
    let d;
    for (let i = 0; i < 60; i++) { await sleep(500); d = await dbg(page); if (d.playing) break; }
    await page.evaluate(() => document.getElementById('c').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await sleep(500);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(1500);
    d = await dbg(page);
    const st = await page.evaluate(() => document.documentElement.classList.contains('static'));
    check('after a failure the static page stays silent (also after hiding and showing the tab)', st && !d.playing && (d.ctx == null || d.ctx === 'closed'), `static=${st} playing=${d.playing} ctx=${d.ctx}`);
    await ctx.close(); await browser.close();
  }

  // 2d. no audio support: the sound button stays hidden, whatever the visitor presses
  {
    const browser = await launch({ autoplay: true });
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => { window.OfflineAudioContext = undefined; window.webkitOfflineAudioContext = undefined; });
    await page.goto(pageUrl({ anim: id, q: .5, ...extra }));
    await sleep(3000);
    await page.mouse.click(300, 300); await page.keyboard.press('m'); await sleep(500);
    const hid = await page.evaluate(() => ({ hidden: document.getElementById('snd').hidden, vis: getComputedStyle(document.getElementById('snd')).display }));
    const dd = await dbg(page);
    check('no audio support: no sound button, the show runs silently', hid.hidden && hid.vis === 'none' && !dd.playing && dd.T > 0, JSON.stringify(hid));
    await ctx.close(); await browser.close();
  }

  // 3. reduced motion
  {
    const browser = await launch({ autoplay: true });
    const { page, ctx } = await newPage(browser, id, {}, { reducedMotion: 'reduce' });
    await sleep(2500);
    const d = await dbg(page);
    const ui = await page.evaluate(() => ({ cta: document.getElementById('cta').classList.contains('on'), still: document.documentElement.classList.contains('still') }));
    check('reduced motion: still final frame, no sound, closing line visible', d.state.mode === 'still' && !d.playing && ui.cta && ui.still, `mode=${d.state.mode}`);
    await ctx.close(); await browser.close();
  }

  // 3b. reduced motion, then "Animation abspielen": the click is the gesture, so the sound can start right away
  {
    const browser = await launch({ autoplay: false });
    const { page, ctx } = await newPage(browser, id, {}, { reducedMotion: 'reduce' });
    await sleep(2000);
    await page.click('#play');
    let d;
    for (let i = 0; i < 60; i++) { await sleep(400); d = await dbg(page); if (d.playing) break; }
    const ui = await page.evaluate(() => ({ cta: document.getElementById('cta').classList.contains('on'), still: document.documentElement.classList.contains('still') }));
    check('"Animation abspielen" starts picture and sound without a second click', d.playing && d.T < 20 && !ui.cta && !ui.still, `playing=${d.playing} T=${d.T.toFixed(1)} ctx=${d.ctx}`);
    await ctx.close(); await browser.close();
  }

  // 4. no WebGL → static fallback
  {
    const browser = await launch({ autoplay: true, extra: ['--disable-3d-apis'] });
    const { page, ctx } = await newPage(browser, id);
    await sleep(1500);
    const ui = await page.evaluate(() => ({ st: document.documentElement.classList.contains('static'), cta: document.getElementById('cta').classList.contains('on'), h1: getComputedStyle(document.getElementById('tag')).display }));
    check('no WebGL: static fallback with tagline and closing line', ui.st && ui.cta && ui.h1 !== 'none', JSON.stringify(ui));
    await ctx.close(); await browser.close();
  }
}
// runtime clock with a light production: the picture runs at full speed, so the sync must be tight
const singleFile = !process.env.BASE_URL && !!process.env.PAGE && !/(^|\/)site\/index\.html$/.test(process.env.PAGE);
if ((mode === 'all' || mode === 'clock') && singleFile) console.log('\n== runtime clock ==\n  SKIP  needs the test production (site/p/test.js), which the single-file build does not contain');
else if (mode === 'all' || mode === 'clock') {
  console.log('\n== runtime clock (light test production) ==');
  const { spawnSync } = await import('node:child_process');
  spawnSync('node', ['tools/build.mjs', 'test', '--dev'], { cwd: new URL('..', import.meta.url).pathname });
  const browser = await launch({ autoplay: true });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  await page.goto(pageUrl({ anim: 'test', dev: 1, q: .5 }));
  let d;
  for (let i = 0; i < 60; i++) { await sleep(500); d = await dbg(page); if (d.playing) break; }
  await sleep(3000); d = await dbg(page);
  check('clock follows the audio within 0.1 s at full frame rate', d.playing && d.audioT != null && Math.abs(d.T - d.audioT) < .1, `T=${d.T.toFixed(3)} audioT=${d.audioT && d.audioT.toFixed(3)}`);
  await ctx.close(); await browser.close();

  // free-running clock (sound blocked) at a low frame rate: the show must still take its 60 s, not twice as long
  const b2 = await launch({ autoplay: false });
  const c2 = await b2.newContext({ viewport: { width: 960, height: 540 } });
  const p2 = await c2.newPage();
  await p2.goto(pageUrl({ anim: 'test', dev: 1, q: .5 }));
  await sleep(1500);
  await p2.evaluate(() => { const busy = () => { const t = performance.now(); while (performance.now() - t < 180); requestAnimationFrame(busy); }; busy(); });   // every frame costs 180 ms: about 5 fps
  const before = await dbg(p2), w0 = Date.now();
  await sleep(6000);
  const after = await dbg(p2), wall = (Date.now() - w0) / 1000;
  const fpsLow = (after.frames - before.frames) / wall;
  check(`free-running clock keeps real time at a low frame rate (${fpsLow.toFixed(1)} fps: T advanced ${(after.T - before.T).toFixed(1)} s in ${wall.toFixed(1)} s)`, fpsLow < 12 && after.T - before.T > wall * .8 && after.T - before.T < wall * 1.25, `${fpsLow.toFixed(1)} fps`);
  await c2.close(); await b2.close();

  // idle stop: after the end plus ?idlestop seconds the loop stops for good (no more frame requests); a resize still redraws
  const b3 = await launch({ autoplay: false });
  const c3 = await b3.newContext({ viewport: { width: 640, height: 360 } });
  const p3 = await c3.newPage();
  await p3.goto(pageUrl({ anim: 'test', dev: 1, q: .5, idlestop: 2 }));
  await p3.evaluate(() => {
    window.__raf = 0; window.__draws = 0;
    const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => (window.__raf++, o(f));
    const gp = WebGL2RenderingContext.prototype, dr = gp.drawArrays; gp.drawArrays = function (...x) { window.__draws++; return dr.apply(this, x); };
  });
  await sleep(1500); await p3.keyboard.press('Escape');                      // jump to the final composition (T = fin + 0.3)
  let st;
  for (let i = 0; i < 80; i++) { await sleep(500); st = await dbg(p3); if (!st.running) break; }
  const r0 = await p3.evaluate(() => window.__raf); await sleep(1500); const r1 = await p3.evaluate(() => window.__raf);
  check('idle stop: the frame loop stops for good after the limit (no further frame requests)', !st.running && r1 === r0, `running=${st.running}, frame requests ${r0} → ${r1}`);
  const dw0 = await p3.evaluate(() => window.__draws); await p3.setViewportSize({ width: 700, height: 500 }); await sleep(600);
  const dw1 = await p3.evaluate(() => window.__draws);
  check('idle stop: a resize still redraws the final frame', dw1 > dw0, `draw calls ${dw0} → ${dw1}`);
  await c3.close(); await b3.close();
}

// random choice: many loads without ?anim, every production must come up, none may dominate; ?anim forces one
if (mode === 'all' || mode === 'random') {
  console.log('\n== random choice ==');
  const browser = await launch({ autoplay: true });
  const count = {}, N = 60;
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
    const page = await ctx.newPage();
    await page.route('**/p/*.js', r => r.abort());          // only the choice matters here, not the show
    await page.goto(pageUrl({ q: .3 }));
    const id = await page.waitForFunction(() => window.Dream && window.Dream.state.id, null, { timeout: 20000 }).then(h => h.jsonValue());
    count[id] = (count[id] || 0) + 1;
    await ctx.close();
  }
  const vals = IDS.map(k => count[k] || 0), fair = N / IDS.length;
  check(`${N} loads without ?anim: ${vals.map((v, i) => IDS[i] + '=' + v).join(' ')}`, vals.every(v => v >= fair * .3 && v <= fair * 1.8));
  for (const id of IDS) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
    const page = await ctx.newPage();
    await page.route('**/p/*.js', r => r.abort());
    await page.goto(pageUrl({ anim: id, q: .3 }));
    const got = await page.waitForFunction(() => window.Dream && window.Dream.state.id, null, { timeout: 20000 }).then(h => h.jsonValue());
    check(`?anim=${id} forces that production`, got === id, got);
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall end-to-end checks passed');
process.exit(fails ? 1 : 0);
