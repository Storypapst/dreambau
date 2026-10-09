// M11: inspect the rendered pixels, not just drawing calls. A glyph hidden behind
// a card or omitted in the narrow fallback must fail this check.
import fs from 'node:fs';
import path from 'node:path';
import { check, run } from '../lib/check.mjs';
import { launchBrowser, openObserved } from '../lib/browser.mjs';
import { startPageServer } from '../lib/page-server.mjs';
import { readList } from '../lib/tree.mjs';

async function visibleGlyphs(page) {
  const orbs = [];
  // Scroll each orb clear of the fixed phone bar before sampling its actual
  // composed pixels; a full-page screenshot keeps that bar over some rows.
  for (const orb of await page.locator('.orb').all()) {
    await orb.evaluate(e => e.scrollIntoView({ block: 'center' }));
    const image = (await orb.screenshot()).toString('base64');
    orbs.push(await page.evaluate(async base64 => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
      const surface = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = surface.getContext('2d');
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = ctx.getImageData(0, 0, surface.width, surface.height).data;
      let bright = 0;
      for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
        if (Math.hypot(x - surface.width / 2, y - surface.height / 2) > surface.width * .3) continue;
        const i = (y * surface.width + x) * 4;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 85) bright++;
      }
      return bright;
    }, image));
  }
  await page.evaluate(() => scrollTo(0, 0));
  return page.evaluate((orbs) => {
    const hub = document.querySelector('.hub'), radius = hub.getBoundingClientRect().width / 2;
    // Read the background surface itself: title text can spill past its small
    // hub box and must not be mistaken for the missing decorative rings.
    const canvas = document.getElementById('characters'), box = canvas.getBoundingClientRect(), h = hub.getBoundingClientRect();
    const scale = canvas.width / box.width, cx = (h.x + h.width / 2 - box.x) * scale, cy = (h.y + h.height / 2 - box.y) * scale;
    const ink = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let rings = 0;
    for (let y = Math.max(0, Math.floor(cy - (radius + 34) * scale)); y < Math.min(canvas.height, cy + (radius + 34) * scale); y++) {
      for (let x = Math.max(0, Math.floor(cx - (radius + 34) * scale)); x < Math.min(canvas.width, cx + (radius + 34) * scale); x++) {
        const d = Math.hypot(x - cx, y - cy) / scale;
        if (d > radius + 7 && d < radius + 34 && ink[(y * canvas.width + x) * 4 + 3] > 80) rings++;
      }
    }
    return {
      orbs,
      rings,
      layout: document.getElementById('page').dataset.layout,
    };
  }, orbs);
}

let browser, server;
try {
  await run(async () => {
    browser = await launchBrowser();
    const list = readList();
    const sparse = { ...list, programs: list.zones.flatMap(z => list.programs.filter(p => p.zone === z.id).slice(0, 1)) };
    const dense = { ...list, programs: [...list.programs, ...Array.from({ length: 4 }, (_, i) => ({ ...list.programs.at(-1), id: `sample-${i}` }))] };
    for (const [name, catalogue, viewport, expected, unknown] of [
      ['phone', list, { width: 390, height: 844 }, 'cluster', false],
      ['tablet', list, { width: 820, height: 1180 }, 'cluster', false],
      ['desktop', sparse, { width: 1440, height: 900 }, 'constellation', false],
      ['dense-fallback', dense, { width: 1440, height: 900 }, 'cluster', false],
      ['unknown', sparse, { width: 1440, height: 900 }, 'constellation', true],
    ]) {
      server = await startPageServer({ list: catalogue, ...(unknown ? { checkedAt: '2000-01-01T00:00:00Z' } : {}) });
      const { context, page, seen, violations } = await openObserved(browser, { viewport, reducedMotion: 'reduce' });
      try {
        await page.goto(server.url); await page.locator('.tile').last().waitFor();
        await page.waitForTimeout(250); // the debounced layout must have settled
        const visible = await visibleGlyphs(page);
        check(`C37 ${name} exercises ${expected}`, visible.layout === expected, visible.layout);
        check(`C37 ${name} renders both hub rings`, visible.rings > 100, String(visible.rings));
        if (!unknown) check(`C37 ${name} visibly fills every orb interior`, visible.orbs.length === catalogue.programs.length && visible.orbs.every(n => n > 20), JSON.stringify(visible.orbs));
        else {
          check('C37 unknown keeps the question markers readable', await page.locator('.unknown').count() === catalogue.programs.length);
          check('C37 unknown leaves the glyph overlay empty as in the mockup', await page.locator('#orb-glyphs').evaluate(e => {
            const pixels = e.getContext('2d').getImageData(0, 0, e.width, e.height).data;
            return pixels.every((value, i) => i % 4 !== 3 || value === 0);
          }));
        }
        const surfaces = () => page.evaluate(() => [...document.querySelectorAll('canvas')].map(e => e.toDataURL()));
        const still = await surfaces(); await page.waitForTimeout(350);
        check(`C42 ${name} reduced motion stays pixel-identical`, JSON.stringify(still) === JSON.stringify(await surfaces()));
        check(`C37 ${name} all drawing surfaces are inert and hidden from assistive technology`, await page.locator('canvas').evaluateAll(nodes => nodes.every(e => e.getAttribute('aria-hidden') === 'true' && getComputedStyle(e).pointerEvents === 'none')));
        check(`C44 ${name} has no policy or runtime errors`, !(await violations()).length && !seen.pageErrors.length && !seen.console.some(e => e.type === 'error'));
        if (process.env.TEAMWORK_GLYPH_EVIDENCE_DIR) {
          fs.mkdirSync(process.env.TEAMWORK_GLYPH_EVIDENCE_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.TEAMWORK_GLYPH_EVIDENCE_DIR, `${name}.png`), fullPage: true });
          await page.screenshot({ path: path.join(process.env.TEAMWORK_GLYPH_EVIDENCE_DIR, `${name}-viewport.png`) });
        }
        if (name === 'phone') {
          const tile = page.locator('.tile').first(), href = await tile.getAttribute('href'), orb = page.locator('.orb').first();
          await page.route('https://aurora.example.test/**', route => route.fulfill({ body: 'Synthetic target' }));
          await orb.click(); await page.waitForURL(href);
          check('C37 tapping an orb follows its actual link through the decoration', page.url() === href);
        }
      } finally { await context.close(); await server.stop(); server = null; }
    }
  });
} finally { if (browser) await browser.close(); if (server) await server.stop(); }
