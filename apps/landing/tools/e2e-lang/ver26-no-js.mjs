// VER-26 (spec section 9; ERR-8): with JavaScript off the page is the German static page: the Tagline as a large centred text, the
// mailto: link, no Sprachumschalter, an empty #blind. Served as the live server serves it (the policy has no inline style).
import { checker, part, openPage } from './_helpers.mjs';

export const rows = ['VER-26'];

export default async function ({ base, browser, sizes }) {
  const check = checker();
  for (const { w, h } of sizes) {
    const at = `${w}x${h}:`;
    await part(check, at, async () => {
      const t = await openPage(browser, { w, h, javaScript: false });
      try {
        const res = await t.page.goto(`${base}/?anim=4k`);
        await t.page.waitForLoadState('load');
        check(`${at} the page is answered`, res.status() === 200, String(res.status()));
        const tag = t.page.locator('#tag'), link = t.page.locator('#cta a'), sw = t.page.locator('.sw'), blind = t.page.locator('#blind');
        const box = await tag.boundingBox();
        const css = await tag.evaluate(el => { const s = getComputedStyle(el); return { position: s.position, display: s.display, textAlign: s.textAlign, justify: s.justifyContent, align: s.alignItems, size: parseFloat(s.fontSize), weight: s.fontWeight }; });
        check(`${at} the Tagline is a large centred text over the whole page`, !!box && Math.abs(box.width - w) <= 1 && Math.abs(box.height - h) <= 1
          && css.position === 'fixed' && css.display === 'flex' && css.textAlign === 'center' && css.justify === 'center' && css.align === 'center' && css.size >= 30 && css.weight === '800', JSON.stringify({ box, css }));
        check(`${at} the three lines are there`, JSON.stringify(await tag.locator('span').allTextContents()) === JSON.stringify(['Jeht nich…', 'jibs nich…', 'dreambau.com']));
        check(`${at} the mailto: link is there and shown`, (await link.getAttribute('href')) === 'mailto:info@dreambau.com' && (await link.isVisible()) && (await link.textContent()) === 'info@dreambau.com');
        check(`${at} .sw is hidden`, (await sw.count()) === 1 && (await sw.evaluate(el => el.hidden && getComputedStyle(el).display === 'none')));
        check(`${at} #blind is there and empty`, (await blind.count()) === 1 && (await blind.textContent()) === '');
        const dark = await t.page.evaluate(() => {
          const hidden = id => getComputedStyle(document.getElementById(id)).display === 'none';
          return { image: getComputedStyle(document.body).backgroundImage, canvas: hidden('c'), snd: hidden('snd'), skip: hidden('skip') };
        });
        check(`${at} the style of the static page applies (its gradient; no canvas, no sound button, no skip button)`, /^radial-gradient/.test(dark.image) && dark.canvas && dark.snd && dark.skip, JSON.stringify(dark));
        check(`${at} no script ran: the page is not marked ready or static`, (await t.page.evaluate('document.documentElement.className')) === '');
        for (const f of t.seen.failed) check(`${at} no failed request`, false, f.url);
        for (const x of t.seen.http) check(`${at} no HTTP error`, false, `${x.status} ${x.url}`);
      } finally { await t.close(); }
    });
  }
  check.done();
}
