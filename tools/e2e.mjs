#!/usr/bin/env node
// End-to-end behaviour of the real page (not the manual-clock test mode):
//   sound allowed by the browser → plays on its own, mute button works
//   sound blocked by the browser → picture runs, button invites, first click starts the music in sync
//   Esc skips to the final composition and shows the closing line
//   prefers-reduced-motion → still final frame, no sound, "Animation abspielen"
//   no WebGL → static fallback with tagline and closing line
//   no request leaves the page
//
//   node tools/e2e.mjs <id|all> [--dev]
import { launch, pageUrl, parseArgs, playwright } from './lib.mjs';
import { IDS } from './budget.mjs';

const a = parseArgs(process.argv.slice(2));
const ids = a._[0] && a._[0] !== 'all' ? [a._[0]] : IDS;
const extra = a.dev ? { dev: 1 } : {};
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = page => page.evaluate(() => ({ ...window.Dream.dbg(), state: window.Dream.state }));

async function newPage(browser, id, params = {}, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...opts });
  const page = await ctx.newPage();
  const logs = [], reqs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('request', r => reqs.push(r.url()));
  await page.goto(pageUrl({ anim: id, q: .5, ...extra, ...params }));
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
    check('Esc jumps to the final composition and shows the closing line', cta.on && cta.done && d5.T >= (await page.evaluate(() => window.Dream.dbg().T)) - 1, `T=${d5.T.toFixed(1)}`);
    const a11y = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent.trim(),
      snd: document.getElementById('snd').getAttribute('aria-label'),
      skip: document.getElementById('skip').textContent.trim(),
      mail: document.querySelector('#cta a')?.getAttribute('href'),
      lang: document.documentElement.lang,
    }));
    check('accessible: tagline as heading, labelled buttons, mailto link, lang=de', /Jeht nich….*jibs nich….*dreambau\.com/.test(a11y.h1) && /^Ton (an|aus)$/.test(a11y.snd) && /überspringen/.test(a11y.skip) && a11y.mail === 'mailto:info@dreambau.com' && a11y.lang === 'de', JSON.stringify(a11y));
    check('no console errors', !logs.some(l => /^\[(error|pageerror)\]/.test(l)), logs.filter(l => /^\[(error|pageerror)\]/.test(l)).join(' | '));
    const offsite = reqs.filter(u => !/^file:|^data:|^blob:/.test(u) && !u.startsWith('http://127.0.0.1') && !u.startsWith('http://localhost'));
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
if (!a._[0] || a._[0] === 'all') {
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
}

// random choice: many loads without ?anim, every production must come up, none may dominate; ?anim forces one
if (!a._[0] || a._[0] === 'all') {
  console.log('\n== random choice ==');
  const browser = await launch({ autoplay: true });
  const count = {}, N = 60;
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 180 } });
    const page = await ctx.newPage();
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
    await page.goto(pageUrl({ anim: id, q: .3 }));
    const got = await page.waitForFunction(() => window.Dream && window.Dream.state.id, null, { timeout: 20000 }).then(h => h.jsonValue());
    check(`?anim=${id} forces that production`, got === id, got);
    await ctx.close();
  }
  await browser.close();
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall end-to-end checks passed');
process.exit(fails ? 1 : 0);
