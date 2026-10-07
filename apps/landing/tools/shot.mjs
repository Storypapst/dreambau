#!/usr/bin/env node
// Renders frames of a production at fixed times (software WebGL, manual clock) and builds a contact sheet.
//
//   node tools/shot.mjs <id> [--t 0,6,12,...] [--every 5] [--size 960x540] [--out dir] [--q 1] [--sheet]
//
// Frames are written to <out>/t_<seconds>.png (default out: verification/<id>/frames). With --sheet (or --every)
// a contact sheet <out>/sheet.png is made (needs python3 + Pillow).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openProduction, seekShot, parseArgs, mkdir } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const id = a._[0];
if (!id) { console.error('usage: node tools/shot.mjs <id> [--t 0,6,12] [--every 5] [--size 960x540] [--out dir] [--sheet]'); process.exit(2); }
const [w, h] = String(a.size || '960x540').split('x').map(Number);
const out = mkdir(path.resolve(a.out || path.join(ROOT, 'verification', id, 'frames')));

const browser = await launch();
try {
  const { page, logs, audioMs } = await openProduction(browser, id, { w, h, q: a.q ? +a.q : 1 });
  const def = await page.evaluate(() => window.Dream.test.def());
  let times;
  if (a.t && a.t !== true) times = String(a.t).split(',').map(Number);
  else { const step = +(a.every || 5); times = []; for (let t = 0; t <= def.dur + .01; t += step) times.push(t); }
  const t0 = Date.now();
  for (const t of times) {
    await seekShot(page, t, path.join(out, `t_${t.toFixed(1).padStart(5, '0')}.png`));
  }
  console.log(`${id}: ${times.length} frames at ${w}x${h} in ${((Date.now() - t0) / 1000).toFixed(1)} s (audio render ${audioMs} ms) → ${out}`);
  const bad = logs.filter(l => /error|warn/i.test(l));
  if (bad.length) console.log(bad.join('\n'));
  if (a.sheet || a.every) {
    const r = spawnSync('python3', [path.join(ROOT, 'tools', 'sheet.py'), out, String(a.cols || 4)], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('sheet.py failed' + (r.error ? ': ' + r.error.message : '')); process.exitCode = r.status ?? 1; }
  }
} finally { await browser.close(); }
