// Both decorative surfaces follow the same deterministic frame and visibility
// lifecycle. A retained bitmap must not make the frame depend on its history.
import { check, run } from '../lib/check.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

let browser, server;
try {
  await run(async () => {
    browser = await launchBrowser(); server = await startPageServer();
    const { context, page } = await openObserved(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    try {
      // Keep the production boot call, exposing only its returned handle to the
      // fixture so an exact time can be compared without depending on a clock.
      await page.route('**/teamwork.js', async route => {
        const response = await route.fetch(), source = await response.text();
        const boot = "if (typeof document !== 'undefined') boot(document);";
        if (!source.includes(boot)) throw new Error('The test boot seam changed');
        await route.fulfill({ response, body: source.replace(boot, "if (typeof document !== 'undefined') window.__teamwork = boot(document);") });
      });
      await context.addInitScript(() => {
        window.__draws = {};
        const clear = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) {
          if (this.canvas.id) window.__draws[this.canvas.id] = (window.__draws[this.canvas.id] || 0) + 1;
          return clear.apply(this, args);
        };
      });
      await page.goto(server.url); await page.locator('.tile').last().waitFor(); await page.waitForTimeout(250);
      const result = await page.evaluate(() => {
        const instance = window.__teamwork;
        const surfaces = () => [...document.querySelectorAll('canvas')].map(e => e.toDataURL());
        instance.draw(4.6); const direct = surfaces();
        instance.draw(40); instance.draw(1); instance.draw(17); instance.draw(4.6);
        const replay = surfaces();
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden === true });
        window.__hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        const before = { ...window.__draws }; instance.draw(70);
        const hidden = { ...window.__draws };
        window.__hidden = false; document.dispatchEvent(new Event('visibilitychange'));
        return { direct, replay, before, hidden, restored: surfaces(), resumed: { ...window.__draws } };
      });
      check('C42 both canvas frames are independent of cached time history', JSON.stringify(result.direct) === JSON.stringify(result.replay));
      check('C42 a hidden document redraws neither surface', JSON.stringify(result.before) === JSON.stringify(result.hidden));
      check('C42 returning to reduced motion restores the exact 4.6 frame', JSON.stringify(result.direct) === JSON.stringify(result.restored));
      check('C42 returning redraws each surface exactly once', ['characters', 'orb-glyphs'].every(id => result.resumed[id] === result.hidden[id] + 1));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForTimeout(100);
      await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
      const hiddenCounts = await page.evaluate(() => ({ ...window.__draws }));
      await page.waitForTimeout(200);
      check('C42 hiding an animated document stops both ongoing animation redraws', JSON.stringify(hiddenCounts) === JSON.stringify(await page.evaluate(() => window.__draws)));
    } finally { await context.close(); }
  });
} finally { if (browser) await browser.close(); if (server) await server.stop(); }
