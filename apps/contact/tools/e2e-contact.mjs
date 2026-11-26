#!/usr/bin/env node
// Browser checks (spec 9, runner B): the handler as a child process with a fake mail server, Playwright 1.56.1.
//   node tools/e2e-contact.mjs                     Chromium
//   ENGINES=chromium,firefox,webkit node tools/e2e-contact.mjs
// Screenshots go to dist/e2e/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import * as pw from 'playwright';
import { startFakeSmtp } from './fake-smtp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist/e2e'); fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  (' + detail + ')' : ''}`); };

const smtp = await startFakeSmtp();
const port = 20000 + Math.floor(Math.random() * 20000);
const child = spawn(process.execPath, ['src/server.mjs'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env,
  CONTACT_PORT: String(port), CONTACT_LISTEN_HOST: '127.0.0.1', CONTACT_SIGNING_SECRET: crypto.randomBytes(32).toString('base64'),
  CONTACT_MAIL_TO: 'info@dreambau.com', CONTACT_MAIL_FROM: 'info@dreambau.com', CONTACT_SMTP_HOST: '127.0.0.1',
  CONTACT_SMTP_PORT: String(smtp.port), CONTACT_SMTP_SECURITY: 'none', CONTACT_MIN_AGE_S: '1', CONTACT_TRUSTED_PROXIES: '0' } });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/kontakt/')).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }

try {
  for (const engine of (process.env.ENGINES || 'chromium').split(',')) {
    console.log(`\n== ${engine} ==`);
    const browser = await pw[engine].launch();
    try {
      // no script: fill, send, thanks page, exactly one mail
      const before = smtp.messages.length;
      const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      const foreign = [], problems = [];
      page.on('request', r => { if (!r.url().startsWith(base)) foreign.push(r.url()); });
      page.on('console', m => { if (m.type() === 'error') problems.push(m.text().slice(0, 120)); });
      await page.goto(base + '/kontakt/');
      const geo = await page.evaluate(() => {
        const f = document.getElementById('f-name').getBoundingClientRect(), b = document.querySelector('button[type=submit]').getBoundingClientRect();
        return { first: f.top / innerHeight, submit: (b.top + b.height / 2) / innerHeight, scrolls: document.documentElement.scrollHeight > innerHeight + 1, wide: document.documentElement.scrollWidth > innerWidth };
      });
      await page.screenshot({ path: path.join(OUT, `${engine}-form-390.png`), fullPage: true });
      check('P7 390x844: first field top at >= 25 % and submit centre at >= 70 % of the height (thumb zone), no scroll', geo.first >= .25 && geo.submit >= .7 && !geo.scrolls && !geo.wide, JSON.stringify(geo));
      await page.fill('#f-name', 'Erika Mustermann');
      await page.fill('#f-email', 'erika@example.test');
      await page.fill('#f-message', 'Guten Tag,\nich habe eine Frage.');
      await page.waitForTimeout(1300);
      await Promise.all([page.waitForURL(/\/kontakt\/danke\/\?r=r1\./), page.click('button[type=submit]')]);
      check('P3: without script the form sends and the thanks page confirms', /Die Nachricht ist abgeschickt/.test(await page.textContent('main')));
      await page.screenshot({ path: path.join(OUT, `${engine}-thanks-390.png`) });
      check('H6: exactly one mail reached the mail server', smtp.messages.length === before + 1, `${smtp.messages.length - before}`);
      await page.reload();
      check('H9: a reload of the thanks page sends nothing', smtp.messages.length === before + 1);
      check('X2/X3: no request to another origin, no cookie', foreign.length === 0 && (await ctx.cookies()).length === 0, foreign.join(' '));
      check('X5: no console error (policy violations included)', problems.length === 0, problems.join(' | '));
      await ctx.close();

      // desktop layout and keyboard
      const desk = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await desk.goto(base + '/kontakt/');
      const g2 = await desk.evaluate(() => {
        const f = document.getElementById('f-name').getBoundingClientRect(), b = document.querySelector('button[type=submit]').getBoundingClientRect();
        return { first: f.top / innerHeight, submit: (b.top + b.height / 2) / innerHeight };
      });
      await desk.screenshot({ path: path.join(OUT, `${engine}-form-1280.png`) });
      check('P8 1280x720: first field top at <= 20 % and submit centre at <= 80 % of the height', g2.first <= .2 && g2.submit <= .8, JSON.stringify(g2));
      const sizes = await desk.evaluate(() => [...document.querySelectorAll('a, button, input:not([type=hidden]):not(#f-web), textarea')].map(e => [e.id || e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height]));
      check('P9: every link, field and the submit control is at least 44 px high', sizes.every(([, h]) => h >= 44), JSON.stringify(sizes.filter(([, h]) => h < 44)));
      // a wrong field: focus lands on it
      await desk.fill('#f-email', 'kaputt'); await desk.fill('#f-message', 'x');
      await desk.evaluate(() => { document.getElementById('f-email').type = 'text'; });   // let the server judge the address
      await desk.waitForTimeout(1300);
      await Promise.all([desk.waitForResponse(r => r.request().method() === 'POST'), desk.click('button[type=submit]')]);
      await desk.waitForLoadState('load'); await desk.waitForTimeout(300);
      check('P12: a wrong address comes back with aria-invalid and focus on it', await desk.evaluate(() => document.activeElement && document.activeElement.id === 'f-email' && document.activeElement.getAttribute('aria-invalid') === 'true'));
      await desk.close();
    } finally { await browser.close(); }
  }
} finally { child.kill('SIGTERM'); await smtp.close(); }
console.log(failed ? `\ne2e-contact: ${failed} check(s) failed` : '\ne2e-contact: all checks passed');
process.exit(failed ? 1 : 0);
