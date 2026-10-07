// Long translated Play/Sound labels must remain separate, tappable and inside the viewport.
// Removing the narrow-layout separation must reproduce the pt-BR 390 px collision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib.mjs';
import { parseLangFile } from '../lib-languages.mjs';
import { openPage, problems } from './_helpers.mjs';

export const rows = ['Mobile control geometry', 'RTL-6', 'APP-8'];

export default async function ({ base, browser, langs, sizes }) {
  let combinations = 0;
  for (const code of langs) {
    const text = parseLangFile(fs.readFileSync(path.join(SITE, 'i18n', code + '.js'), 'utf8')).texts;
    const t = await openPage(browser, { w: 390, h: 844, contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
    try {
      await t.page.goto(`${base}/?lang=${encodeURIComponent(code)}&anim=4k`);
      await t.page.waitForFunction(() => Dream.state.mode === 'still' || Dream.state.error);
      assert.equal(await t.page.evaluate(() => Dream.state.lang), code);
      assert.equal(await t.page.locator('#play').textContent(), text['play.label']);
      assert.equal(await t.page.locator('#snd .lbl').textContent(), text['snd.on_label']);
      for (const { w, h } of sizes) {
        await t.page.setViewportSize({ width: w, height: h });
        for (const muted of [true, false]) {
          if (await t.page.evaluate(() => Dream.state.muted) !== muted) await t.page.locator('#snd').click();
          assert.equal(await t.page.locator('#snd').getAttribute('title'), text[muted ? 'snd.hint_on' : 'snd.hint_off']);
          const layout = await t.page.evaluate(() => {
            const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
            const play = box('#play'), sound = box('#snd');
            return { play, sound, overlapX: Math.max(0, Math.min(play.right, sound.right) - Math.max(play.left, sound.left)), overlapY: Math.max(0, Math.min(play.bottom, sound.bottom) - Math.max(play.top, sound.top)), overflow: document.documentElement.scrollWidth > innerWidth };
          });
          const label = `${code} ${w}x${h} sound ${muted ? 'off' : 'on'}`;
          assert.ok(layout.overlapX <= .5 || layout.overlapY <= .5, `${label}: controls overlap ${JSON.stringify(layout)}`);
          assert.equal(layout.overflow, false, label + ': horizontal overflow');
          for (const [name, r] of Object.entries({ play: layout.play, sound: layout.sound })) {
            assert.ok(r.left >= -.5 && r.right <= w + .5 && r.top >= 0 && r.bottom <= h, `${label}: ${name} outside viewport`);
            if (w <= 600) assert.ok(r.width >= 44 && r.height >= 44, `${label}: ${name} tap target below 44 px`);
          }
          if (w > 600) {
            assert.ok(Math.abs((layout.play.left + layout.play.right) / 2 - w / 2) <= .5, label + ': wide Play is no longer centered');
            assert.equal(layout.play.top, 14, label + ': wide Play moved');
            assert.equal(layout.sound.top, 12, label + ': wide Sound moved');
          }
          combinations++;
        }
      }
      assert.deepEqual(await problems(t), [], code + ': browser errors');
    } finally { await t.close(); }
  }
  console.log(`  header controls: ${langs.length} languages, ${combinations} viewport/sound cases`);
}
