#!/usr/bin/env node
// Acceptance run for the three productions and the page. Writes verification/report.json and verification/SUMMARY.md.
//
//   node tools/verify.mjs [4k|16k|64k ...] [--quick] [--env]
//
// per production: build + size budget · static scan (no network/asset APIs) · timeline (dur 50-70 s, fin, cta) ·
// first frame dark · three or more distinct phases · no dead period · order independence (no stale render targets) · flash safety · tagline revealed in order,
// legible (contrast) and complete at fin · calm dark bottom band at 16:9, 21:9, 4:3 and portrait · music (audio.mjs) ·
// real-time behaviour (e2e.mjs) · picture cost (software GL, informational)
// and once for the whole page, the section "languages": e2e:lang --quick (tools/e2e-lang.mjs), the end-to-end checks of the language mechanism
// --quick skips music, e2e and the contact sheet (and runs e2e:lang --quick, as it always does here). --env also (re)writes ENVIRONMENT.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SITE, launch, openProduction, parseArgs, mkdir, playwright } from './lib.mjs';
import { BUDGET, IDS } from './budget.mjs';
import { scanSite } from './scan-rules.mjs';

const a = parseArgs(process.argv.slice(2));
const ids = a._.length ? a._ : IDS;
const report = { generated: new Date().toISOString(), productions: {} };
let failures = 0;
const log = (...x) => console.log(...x);

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

function row(r, name, ok, detail = '', warn = false) {
  r.checks.push({ name, ok, detail, warn });
  if (!ok && !warn) failures++;
  log(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

const diff = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };

// ---- static scan of the shipped files -------------------------------------------------------
// the page, its scripts, the language runtime, the manifest and every language file; the rules are in tools/scan-rules.mjs (a node test applies them to strings)
function staticScan(r) {
  const bad = scanSite(SITE, ids);
  row(r, 'static scan: no network, media or asset APIs, no eval or new Function, in the shipped files', bad.length === 0, bad.join('; '));
}

// ---- the languages: the end-to-end checks of the language mechanism ----------------------------
// one row for each module of tools/e2e-lang/ (the runner prints "PASS|FAIL  <module>  <rows>  <seconds> s" and the reason below a FAIL)
function languagesSection() {
  const r = report.languages = { checks: [] };
  log('\n== languages ==');
  const checked = run(process.execPath, ['tools/check-languages.mjs', '--release', '--complete']);
  row(r, 'check:languages release/complete', checked.status === 0, checked.status ? (checked.stdout + checked.stderr).slice(-1500) : 'all source and pinned release checks passed');
  const e = run(process.execPath, ['tools/e2e-lang.mjs', '--quick'], { timeout: 900000 });
  const out = (e.stdout || '') + (e.stderr || '');
  const lines = out.split('\n');
  let n = 0;
  lines.forEach((l, i) => {
    const m = /^(PASS|FAIL)\s+(\S+)\s+(.*?)\s+([\d.]+) s$/.exec(l);
    if (!m) return;
    n++;
    const why = []; for (let j = i + 1; j < lines.length && /^\s{6}/.test(lines[j]); j++) why.push(lines[j].trim());
    row(r, `e2e:lang --quick: ${m[2]} (${m[3]}), ${m[4]} s`, m[1] === 'PASS', why.join(' | ').slice(0, 600));
  });
  if (e.status !== 0 || !n) row(r, 'e2e:lang --quick: the run itself', e.status === 0 && n > 0, `exit ${e.status}${n ? '' : ', no module ran: ' + out.trim().slice(0, 300)}`);
}

// ---- main per production --------------------------------------------------------------------
const browser = await launch();
try {
  for (const id of ids) {
    const r = report.productions[id] = { checks: [] };
    log(`\n== ${id} ==`);

    // build + budget
    const b = run('node', ['tools/build.mjs', id]);
    const m = /(\d+) bytes\s+\(gzip\s+(\d+)\)/.exec(b.stdout || '');
    r.bytes = m ? +m[1] : null; r.gzip = m ? +m[2] : null; r.budget = BUDGET[id];
    row(r, `size budget: ${r.bytes} of ${r.budget || "n/a"} bytes (gzip ${r.gzip})`, b.status === 0 && (!r.budget || r.bytes <= r.budget), b.status ? (b.stdout + b.stderr).trim() : `${r.budget ? Math.round(r.bytes / r.budget * 100) + " %" : ""}`);
    if (b.status !== 0 && !r.bytes) continue;
    staticScan(r);

    // timeline + picture checks in the manual-clock test mode
    const { page, logs } = await openProduction(browser, id, { w: 160, h: 90, q: 1, params: { px: 160 * 90 } });
    const def = await page.evaluate(() => window.Dream.test.def());
    r.def = def;
    row(r, `timeline: dur ${def.dur} s, fin ${def.fin} s, cta ${def.cta} s`, def.dur >= 50 && def.dur <= 70 && def.fin <= def.dur - 3 && def.cta > def.fin && def.cta < def.dur);

    const l0 = await page.evaluate(() => window.Dream.test.lum(0));
    row(r, `first frame is nearly black (mean luminance ${(l0.mean * 100).toFixed(1)} %)`, l0.mean < .08);

    // phases: four snapshots, consecutive differences
    const fr = [.08, .3, .55, .8, 1.0].map(f => f * def.fin);
    const th = [];
    for (const t of fr) th.push(await page.evaluate(t => window.Dream.test.thumb(t), t));
    const dd = th.slice(1).map((x, i) => diff(x, th[i]));
    r.phaseDiffs = dd.map(x => +x.toFixed(3));
    row(r, `three or more distinct phases (differences between snapshots: ${dd.map(x => x.toFixed(2)).join(' ')})`, dd.filter(x => x >= .04).length >= 3 && Math.min(...dd) >= .02);

    // dead periods: structure must change over every 3 s window before fin
    const thumbs = []; for (let t = 0; t <= def.fin; t++) thumbs.push(await page.evaluate(t => window.Dream.test.thumb(t), t));
    let dead = []; for (let t = 0; t + 3 < thumbs.length; t++) if (diff(thumbs[t], thumbs[t + 3]) < .004) dead.push(t);
    row(r, 'continuous change: no still period of 3 s or more before fin', dead.length === 0, dead.length ? `still around t=${dead.slice(0, 8).join(', ')} s` : '');

    // order independence: the final picture must not depend on the frames drawn before it (a render target that a skipped pass leaves stale shows up here)
    {
      const tf = def.fin + .3;
      const after = await page.evaluate(t => window.Dream.test.thumb(t), tf);
      const { page: pf } = await openProduction(browser, id, { w: 160, h: 90, q: 1, params: { px: 160 * 90 } });
      const fresh = await pf.evaluate(t => window.Dream.test.thumb(t), tf);
      await pf.close();
      const od = diff(after, fresh);
      r.orderDiff = +od.toFixed(5);
      row(r, `order independence: the picture at ${tf.toFixed(1)} s is the same after a full run as on a fresh page (difference ${od.toFixed(4)})`, od < .002);
    }

    // flash safety (heuristic on whole-frame mean luminance at 15 Hz)
    const ser = []; for (let t = 0; t <= def.dur; t += 1 / 15) ser.push((await page.evaluate(t => window.Dream.test.lum(t), t)).mean);
    let maxStep = 0; for (let i = 1; i < ser.length; i++) maxStep = Math.max(maxStep, Math.abs(ser[i] - ser[i - 1]));
    // reversals of at least 0.05 within any 1 s window
    const ext = []; let dir = 0, last = ser[0], base = ser[0];
    for (let i = 1; i < ser.length; i++) {
      const d = ser[i] - last;
      if (dir <= 0 && ser[i] - base >= .05) { ext.push(i); dir = 1; base = ser[i]; }
      else if (dir >= 0 && base - ser[i] >= .05) { ext.push(i); dir = -1; base = ser[i]; }
      else if ((dir === 1 && ser[i] > base) || (dir === -1 && ser[i] < base)) base = ser[i];
      last = ser[i];
    }
    let worst = 0; for (let i = 0; i < ext.length; i++) { let n = 0; for (let j = i; j < ext.length && ext[j] - ext[i] < 15; j++) n++; worst = Math.max(worst, n); }
    r.flash = { maxStep: +maxStep.toFixed(3), maxReversalsPerSecond: worst };
    row(r, `flash safety: largest 66 ms step ${(maxStep * 100).toFixed(1)} % luminance, ${worst} large reversals per second at most`, maxStep < .12 && worst < 3);

    // picture and music: do they move together? (tools/sync.mjs: bass energy vs brightness and activity, with a lag search)
    {
      const sy = run('node', ['tools/sync.mjs', id]);
      const m1 = /brightness: r\(0 ms\) = (-?[\d.]+)\s+best r = (-?[\d.]+) at lag (-?\d+) ms/.exec(sy.stdout || ''), m2 = /activity\s*: r\(0 ms\) = (-?[\d.]+)\s+best r = (-?[\d.]+) at lag (-?\d+) ms/.exec(sy.stdout || '');
      if (m1 && m2) {
        const best = Math.max(+m1[2], +m2[2]), lag = +(+m1[2] >= +m2[2] ? m1[3] : m2[3]);
        r.sync = { brightness: { r: +m1[2], lagMs: +m1[3] }, activity: { r: +m2[2], lagMs: +m2[3] } };
        row(r, `picture follows the music: bass energy vs brightness r=${m1[2]} (lag ${m1[3]} ms), vs activity r=${m2[2]} (lag ${m2[3]} ms)`, best >= .2 && Math.abs(lag) <= 100);
      } else row(r, 'picture follows the music', false, 'sync.mjs failed: ' + ((sy.stdout || '') + (sy.stderr || '')).slice(0, 200));
    }

    // tagline: reveal order, completeness, contrast (a larger frame, so particle typefaces are resolved)
    await page.close();
    const { page: pr } = await openProduction(browser, id, { w: 480, h: 270, q: 1, params: { px: 480 * 270 } });
    const reveal = [null, null, null];
    for (let t = 20; t <= def.fin + .5; t += .5) {
      const c = await pr.evaluate(t => window.Dream.test.textContrast(t), t);
      c.forEach((l, i) => { if (reveal[i] == null && l.pixels > 30 && l.ratio >= 3) reveal[i] = t; });
    }
    await pr.close();
    r.reveal = reveal;
    const ordered = reveal.every(x => x != null) && reveal[0] < reveal[1] && reveal[1] < reveal[2];
    row(r, `tagline revealed line by line, in order: ${reveal.map(x => x == null ? 'never' : x + ' s').join(' → ')}`, ordered && reveal[0] >= 25 && reveal[2] <= def.fin - 1);

    // final composition at several shapes: text contrast and calm bottom band
    for (const [w, h, label, tMin] of [[960, 540, '16:9', 4.5], [1680, 720, '21:9', 3], [1024, 768, '4:3', 3], [390, 844, 'portrait 9:16', 3]]) {
      const { page: p2 } = await openProduction(browser, id, { w, h, q: 1, params: { px: Math.min(w * h, 700000) } });
      const tf = def.fin + .3;
      const c = await p2.evaluate(t => window.Dream.test.textContrast(t), tf);
      const lm = await p2.evaluate(t => window.Dream.test.lum(t), tf);
      if (label === '16:9') { mkdir(path.join(ROOT, 'verification', id)); await p2.evaluate(t => window.Dream.test.seek(t), tf); await p2.screenshot({ path: path.join(ROOT, 'verification', id, 'final-16x9.png') }); }
      if (label === 'portrait 9:16') { await p2.evaluate(t => window.Dream.test.seek(t), tf); await p2.screenshot({ path: path.join(ROOT, 'verification', id, 'final-portrait.png') }); }
      const worstRatio = Math.min(...c.map(x => x.ratio));
      row(r, `final composition ${label}: text contrast ${c.map(x => x.ratio.toFixed(1)).join(' / ')}, bottom band ${(lm.bottom * 100).toFixed(1)} % luminance`, worstRatio >= tMin && lm.bottom < .12);
      await p2.close();
    }

    // picture cost (informational)
    {
      const { page: p3 } = await openProduction(browser, id, { w: 640, h: 360, q: 1, params: { px: 640 * 360 } });
      const ms = await p3.evaluate(async dur => { const o = []; for (let t = 0; t <= dur + 5; t += 4) { window.Dream.test.seek(t); const t0 = performance.now(); window.Dream.test.seek(t + .02); o.push(performance.now() - t0); } return o; }, def.dur);
      r.benchMs = { mean: +(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(1), worst: +Math.max(...ms).toFixed(1) };
      row(r, `picture cost in software GL at 640x360: mean ${r.benchMs.mean} ms, worst ${r.benchMs.worst} ms (rule of thumb ≤ 150 ms ≈ 60 fps on an integrated GPU)`, r.benchMs.worst <= 400, 'informational', r.benchMs.worst > 150);
      await p3.close();
    }

    if (!a.quick) {
      const au = run('node', ['tools/audio.mjs', id]);
      const lines = (au.stdout || '').split('\n').filter(l => /peak|PROBLEMS|^  -|audio checks OK|loudness/.test(l));
      r.audio = lines;
      row(r, 'music: loudness, silent start, fade-out, no clipping, progression', au.status === 0, au.status ? lines.join(' | ') : (lines.find(l => /peak/.test(l)) || '').trim());
      const e2 = run('node', ['tools/e2e.mjs', id]);
      const bad = (e2.stdout || '').split('\n').filter(l => /FAIL/.test(l));
      row(r, 'real-time behaviour: autoplay allowed/blocked, mute, Esc, reduced motion, no WebGL, no network', e2.status === 0, bad.join(' | '));
      const sh = run('node', ['tools/shot.mjs', id, '--every', '5', '--size', '960x540', '--sheet']);
      row(r, 'contact sheet written (verification/' + id + '/frames/sheet.png)', sh.status === 0, sh.status ? sh.stderr : '');
    }
  }

  languagesSection();

  if (a.env || !fs.existsSync(path.join(ROOT, 'ENVIRONMENT.json'))) {
    const p = await browser.newPage();
    await p.goto('file://' + path.join(SITE, 'index.html') + '?test=1&anim=' + ids[0]);
    const env = await p.evaluate(() => {
      const c = document.createElement('canvas'), gl = c.getContext('webgl2'), d = gl && gl.getExtension('WEBGL_debug_renderer_info');
      return {
        user_agent: navigator.userAgent, hardware_concurrency: navigator.hardwareConcurrency,
        webgl2: !!gl, webgl_renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, max_texture_size: gl && gl.getParameter(gl.MAX_TEXTURE_SIZE),
        ext_color_buffer_float: !!(gl && gl.getExtension('EXT_color_buffer_float')),
        audio_context_sample_rate: new (window.AudioContext || window.webkitAudioContext)().sampleRate, offline_audio_context: typeof OfflineAudioContext,
      };
    });
    const pw = playwright();
    fs.writeFileSync(path.join(ROOT, 'ENVIRONMENT.json'), JSON.stringify({
      schema_version: 1, benchmark: 'DreamBau Landing Demo', measured_on: new Date().toISOString().slice(0, 10),
      note: 'Measured values of the reference TEST host. Visitors use their own browsers; the page needs WebGL2 and WebAudio and degrades to a static page without WebGL2.',
      host: { node: process.version, playwright: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version, browser: browser.version(), platform: process.platform },
      browser: env,
      targets: { desktop: '1920x1080, Chrome/Edge/Firefox/Safari current', phone: '390x844 portrait, iOS Safari / Android Chrome current', aspect_ratios: ['16:9', '21:9', '4:3', '9:16'] },
      limits: { development_time: 'none', tokens_or_cost: 'none', iterations: 'none' },
    }, null, 2) + '\n');
    await p.close();
  }
} finally { await browser.close(); }

report.failures = failures;
mkdir(path.join(ROOT, 'verification'));
fs.writeFileSync(path.join(ROOT, 'verification', 'report.json'), JSON.stringify(report, null, 1));
let md = `# Verification summary\n\nGenerated ${report.generated}. ${failures ? failures + ' check(s) FAILED.' : 'All checks passed.'}\n`;
for (const [id, r] of Object.entries(report.productions)) {
  md += `\n## ${id}\n\n| check | result | detail |\n|---|---|---|\n` + r.checks.map(c => `| ${c.name.replace(/\|/g, '/')} | ${c.ok ? 'pass' : c.warn ? 'warn' : '**FAIL**'} | ${(c.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n') + '\n';
}
if (report.languages) md += `\n## languages\n\n| check | result | detail |\n|---|---|---|\n` + report.languages.checks.map(c => `| ${c.name.replace(/\|/g, '/')} | ${c.ok ? 'pass' : '**FAIL**'} | ${(c.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'verification', 'SUMMARY.md'), md);
log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
