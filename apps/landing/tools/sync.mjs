#!/usr/bin/env node
// How strongly does the picture follow the music? Compares the bass energy of the rendered music (the same signal the
// picture receives as E.x) with the picture itself: whole-frame brightness and frame-to-frame activity at 30 Hz,
// high-passed to look at beat-scale changes, with a lag search of ±250 ms (the best lag should be near 0).
//
//   node tools/sync.mjs <id> [--from 14] [--to 50]
import { launch, openProduction, parseArgs } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const id = a._[0];
if (!id) { console.error('usage: node tools/sync.mjs <id> [--from 14] [--to 50]'); process.exit(2); }
const from = +(a.from || 14), to = +(a.to || 50), fps = 30;
const browser = await launch();
try {
  const { page } = await openProduction(browser, id, { w: 160, h: 90, params: { px: 160 * 90 } });
  const s = await page.evaluate(([from, to, fps]) => {
    const n = Math.round((to - from) * fps), E = [], L = [], A = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = from + i / fps;
      E.push(window.Dream.test.env(t)[0]);
      const th = window.Dream.test.thumb(t, 32, 18);
      L.push(th.reduce((x, y) => x + y, 0) / th.length);
      A.push(prev ? th.reduce((x, y, k) => x + Math.abs(y - prev[k]), 0) / th.length : 0);
      prev = th;
    }
    return { E, L, A };
  }, [from, to, fps]);
  const mean = x => x.reduce((p, q) => p + q, 0) / x.length;
  const hp = x => x.map((v, i) => v - mean(x.slice(Math.max(0, i - 15), i + 16)));
  const corr = (x, y, lag) => {
    const xs = [], ys = [];
    for (let i = 0; i < x.length; i++) { const j = i + lag; if (j >= 0 && j < y.length) { xs.push(x[i]); ys.push(y[j]); } }
    const mx = mean(xs), my = mean(ys); let c = 0, vx = 0, vy = 0;
    for (let i = 0; i < xs.length; i++) { c += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
    return c / (Math.sqrt(vx * vy) + 1e-12);
  };
  const E = hp(s.E);
  for (const [name, y] of [['brightness', hp(s.L)], ['activity  ', hp(s.A)]]) {
    let best = { c: -2, lag: 0 };
    for (let lag = -8; lag <= 8; lag++) { const c = corr(E, y, lag); if (c > best.c) best = { c, lag }; }
    console.log(`${id}  bass energy vs ${name}: r(0 ms) = ${corr(E, y, 0).toFixed(2)}   best r = ${best.c.toFixed(2)} at lag ${(best.lag * 1000 / fps).toFixed(0)} ms`);
  }
} finally { await browser.close(); }
