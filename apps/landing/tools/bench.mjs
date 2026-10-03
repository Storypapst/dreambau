#!/usr/bin/env node
// Rough cost of a production's picture: milliseconds per frame in SOFTWARE WebGL (SwiftShader, 4-core CPU) at a small size.
// Only meaningful as a relative number. Rule of thumb: ≤ ~150 ms per frame at 640x360 here ≈ 60 fps at 1080p on an
// integrated laptop GPU. The worst frame matters (usually near the end of the transformation).
//
//   node tools/bench.mjs <id> [--size 640x360] [--step 3]
import { launch, openProduction, parseArgs } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const id = a._[0];
if (!id) { console.error('usage: node tools/bench.mjs <id> [--size 640x360] [--step 3]'); process.exit(2); }
const [w, h] = String(a.size || '640x360').split('x').map(Number);
const step = +(a.step || 3);

const browser = await launch();
try {
  const { page } = await openProduction(browser, id, { w, h, q: 1, params: { px: w * h } });
  const def = await page.evaluate(() => window.Dream.test.def());
  const res = await page.evaluate(async ([dur, step]) => {
    const out = [];
    for (let t = 0; t <= dur + 5; t += step) {
      window.Dream.test.seek(t);                 // warm-up (first draw compiles state)
      const t0 = performance.now();
      for (let i = 0; i < 2; i++) window.Dream.test.seek(t + i * .016);
      out.push([t, (performance.now() - t0) / 2]);
    }
    return out;
  }, [def.dur, step]);
  const ms = res.map(r => r[1]);
  const worst = res.reduce((m, r) => r[1] > m[1] ? r : m);
  console.log(`${id}: ${w}x${h} software GL  mean ${(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(0)} ms  worst ${worst[1].toFixed(0)} ms at t=${worst[0]} s`);
  console.log('per time: ' + res.map(r => `${r[0]}s:${r[1].toFixed(0)}`).join('  '));
} finally { await browser.close(); }
