#!/usr/bin/env node
// Renders a preview video of a production: every frame is drawn at its exact time (software WebGL, manual clock),
// the music is the same buffer the page plays. Useful to look at and listen to a production without a GPU or a browser
// session, and as a record of the result.
//
//   node tools/video.mjs <id> [--fps 15] [--size 960x540] [--out file.mp4]      (needs ffmpeg)
//
// Default output: verification/<id>/preview.mp4
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openProduction, parseArgs, mkdir, wavHeader } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const id = a._[0];
if (!id) { console.error('usage: node tools/video.mjs <id> [--fps 15] [--size 960x540] [--out file.mp4]'); process.exit(2); }
const fps = +(a.fps || 15);
const [w, h] = String(a.size || '960x540').split('x').map(Number);
const out = path.resolve(a.out || path.join(mkdir(path.join(ROOT, 'verification', id)), 'preview.mp4'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dreambau-${id}-`));

const browser = await launch();
try {
  const { page } = await openProduction(browser, id, { w, h });
  const def = await page.evaluate(() => window.Dream.test.def());
  const info = await page.evaluate(() => window.Dream.test.audioInfo());
  // the music
  const parts = [];
  for (let off = 0; off < Math.min(info.dur, def.dur + 1); off += 5) parts.push(Buffer.from(await page.evaluate(([o, l]) => window.Dream.test.pcm16(o, l), [off, 5]), 'base64'));
  const pcm = Buffer.concat(parts);
  fs.writeFileSync(path.join(tmp, 'a.wav'), Buffer.concat([wavHeader(pcm.length / 4, info.sr), pcm]));
  // the frames (a few seconds of the final composition at the end)
  const total = def.dur + 2, n = Math.round(total * fps), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.Dream.test.seek(t), i / fps);
    await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88 });
    if (i % (fps * 5) === 0) console.log(`  ${(i / fps).toFixed(0)} s of ${total} s  (${((Date.now() - t0) / 1000).toFixed(0)} s elapsed)`);
  }
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(tmp, 'f%05d.jpg'), '-i', path.join(tmp, 'a.wav'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg failed');
  console.log(`${id}: ${out}  ${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${total} s at ${fps} fps, ${w}x${h}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); await browser.close(); }
