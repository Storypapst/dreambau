#!/usr/bin/env node
// Renders the music of a production offline in the browser, writes a WAV and analyses it
// (loudness per second, peak, silence at the start and end, tempo estimate, spectrogram PNG).
//
//   node tools/audio.mjs <id> [--out dir]
//
// Output (default dir verification/<id>/audio): audio.wav, spectrogram.png, report.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, openProduction, parseArgs, mkdir, wavHeader } from './lib.mjs';

const a = parseArgs(process.argv.slice(2));
const id = a._[0];
if (!id) { console.error('usage: node tools/audio.mjs <id> [--out dir]'); process.exit(2); }
const out = mkdir(path.resolve(a.out || path.join(ROOT, 'verification', id, 'audio')));

const browser = await launch();
try {
  const { page, logs, audioMs } = await openProduction(browser, id, { w: 320, h: 180 });
  const info = await page.evaluate(() => window.Dream.test.audioInfo());
  const def = await page.evaluate(() => window.Dream.test.def());
  if (!info) { console.error('no audio was rendered\n' + logs.join('\n')); process.exit(1); }
  const parts = [];
  for (let off = 0; off < info.dur; off += 5) {
    const b64 = await page.evaluate(([o, l]) => window.Dream.test.pcm16(o, l), [off, 5]);
    parts.push(Buffer.from(b64, 'base64'));
  }
  const pcm = Buffer.concat(parts);
  const wav = path.join(out, 'audio.wav');
  fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length / 4, info.sr), pcm]));
  console.log(`${id}: audio ${info.dur.toFixed(2)} s @ ${info.sr} Hz rendered in ${audioMs} ms → ${wav}`);
  const r = spawnSync('python3', [path.join(ROOT, 'tools', 'audioreport.py'), wav, out, String(def.dur), String(def.fin)], { stdio: 'inherit' });
  if (r.status) process.exitCode = r.status;
} finally { await browser.close(); }
