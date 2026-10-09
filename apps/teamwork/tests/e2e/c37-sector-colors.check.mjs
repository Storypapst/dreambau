// The approved sectors are centred on north/east/south/west, not bounded by
// those axes. Check off-axis pixels too, and the generalized six-zone layout.
import { check, run } from '../lib/check.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';

const palette = [['cyan', [56, 214, 255]], ['pink', [255, 94, 200]], ['amber', [255, 178, 62]], ['violet', [169, 139, 255]], ['lime', [198, 242, 58]], ['slate', [200, 208, 224]]];
let browser, server;
try {
  await run(async () => {
    browser = await launchBrowser();
    for (const count of [4, 6]) {
      const colours = palette.slice(0, count);
      const catalogue = { format: 1, zones: colours.map(([color], i) => ({ id: `zone-${i}`, name: `Sample ${i}`, color })),
        programs: colours.map((_, i) => ({ id: `sample-${i}`, name: `Sample ${i}`, purpose: 'Synthetic sector check', zone: `zone-${i}`, url: `https://sample-${i}.example.test/` })) };
      server = await startPageServer({ list: catalogue });
      const { context, page } = await openObserved(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      try {
        await page.route('**/teamwork.js', async route => {
          const response = await route.fetch(), source = await response.text();
          const boot = "if (typeof document !== 'undefined') boot(document);";
          if (!source.includes(boot)) throw new Error('The test boot seam changed');
          await route.fulfill({ response, body: source.replace(boot, "if (typeof document !== 'undefined') window.__teamwork = boot(document);") });
        });
        // Retain the offscreen field bitmap for pixel inspection. It is the
        // actual cached field used by drawImage, not a test reconstruction.
        await context.addInitScript(() => {
          const fill = CanvasRenderingContext2D.prototype.fillText;
          CanvasRenderingContext2D.prototype.fillText = function (...args) {
            if (!this.canvas.id) window.__fieldCanvas = this.canvas;
            return fill.apply(this, args);
          };
        });
        await page.goto(server.url); await page.locator('.tile').last().waitFor(); await page.waitForTimeout(250);
        const result = await page.evaluate((colours) => {
          const capture = (time) => {
            window.__teamwork.reduced = time === 4.6;
            window.__teamwork.draw(time);
            const canvas = document.getElementById('characters'), field = window.__fieldCanvas;
            const map = canvas.getBoundingClientRect(), hub = document.querySelector('.hub').getBoundingClientRect();
            const dpr = canvas.width / map.width, cx = (hub.x + hub.width / 2 - map.x) * dpr, cy = (hub.y + hub.height / 2 - map.y) * dpr;
            const radius = hub.width / 2 * dpr, ring = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            const fieldInk = field.getContext('2d').getImageData(0, 0, field.width, field.height).data;
            const sample = (pixels, width, height, centerX, centerY, inner, outer, angle, alpha) => {
              const found = new Array(colours.length).fill(0);
              for (let y = Math.max(0, Math.floor(centerY - outer)); y < Math.min(height, centerY + outer); y++) {
                for (let x = Math.max(0, Math.floor(centerX - outer)); x < Math.min(width, centerX + outer); x++) {
                  const dx = x - centerX, dy = y - centerY, distance = Math.hypot(dx, dy), i = (y * width + x) * 4;
                  if (distance < inner || distance > outer || pixels[i + 3] < alpha) continue;
                  const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
                  if (Math.abs(delta) > .12) continue;
                  const distances = colours.map(([, rgb]) => rgb.reduce((sum, value, c) => sum + (value - pixels[i + c]) ** 2, 0));
                  found[distances.indexOf(Math.min(...distances))]++;
                }
              }
              return found;
            };
            return colours.flatMap((_, zone) => [-1, 1].map(side => {
              const angle = -Math.PI / 2 + zone * Math.PI * 2 / colours.length + side * Math.PI / colours.length * 2 / 3;
              return { time, zone, side,
                ring: sample(ring, canvas.width, canvas.height, cx, cy, radius + 7 * dpr, radius + 34 * dpr, angle, 80),
                field: sample(fieldInk, field.width, field.height, field.width / 2, field.height / 2, 120 * dpr, 190 * dpr, angle, 4) };
            }));
          };
          return [4.6, 1000].flatMap(capture);
        }, colours);
        for (const sample of result) {
          const correct = values => values[sample.zone] > 5 && values[sample.zone] > values.reduce((sum, value, i) => sum + (i === sample.zone ? 0 : value), 0);
          check(`C37 ${count} zones t=${sample.time} ${colours[sample.zone][0]} ${sample.side < 0 ? 'before' : 'after'} axis ring pixels match their sector`, correct(sample.ring), JSON.stringify(sample.ring));
          check(`C37 ${count} zones t=${sample.time} ${colours[sample.zone][0]} ${sample.side < 0 ? 'before' : 'after'} axis field pixels match their sector`, correct(sample.field), JSON.stringify(sample.field));
        }
      } finally { await context.close(); await server.stop(); server = null; }
    }
  });
} finally { if (browser) await browser.close(); if (server) await server.stop(); }
