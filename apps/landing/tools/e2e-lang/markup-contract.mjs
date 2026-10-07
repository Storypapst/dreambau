// The markup of the page as a visitor without JavaScript gets it (spec 7.10; APP-6, APP-7, APP-9, TXT-5, CHO-10, FIL-13): the German page is complete
// in the file, every bound element repeats its German text from site/i18n/de.js, and the bindings the runtime will read are there.
// Until check:languages has its rule C10 for the text of the bound elements, this is where TXT-5 is checked.
import fs from 'node:fs';
import path from 'node:path';
import { SITE } from '../lib.mjs';
import { parseLangFile } from '../lib-languages.mjs';
import { checker, part, openPage } from './_helpers.mjs';

export const rows = ['TXT-5', 'APP-6', 'APP-7', 'APP-9', 'CHO-10', 'FIL-13'];

// the bound elements of the start page: where they are, the key, and what the attribute or text is called
const TEXTS = [['#snd .lbl', 'snd.on_label'], ['#skip span', 'skip.label'], ['#play', 'play.label'], ['#cta .words', 'cta.words'], ['#blind', 'blind.{anim}']];
const ATTRS = [['#snd', 'aria-label', 'snd.aria'], ['#lang', 'aria-label', 'lang.aria']];

export default async function ({ base, browser }) {
  const check = checker();
  const de = parseLangFile(fs.readFileSync(path.join(SITE, 'i18n', 'de.js'), 'utf8')).texts;
  await part(check, 'the static markup', async () => {
    const t = await openPage(browser, { javaScript: false });
    try {
      await t.page.goto(`${base}/?anim=4k`);
      const m = await t.page.evaluate(({ TEXTS, ATTRS }) => {
        const q = sel => document.querySelector(sel), box = el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; };
        const tag = q('#tag'), blind = q('#blind'), cta = q('#cta'), lang = q('#lang'), head = document.head;
        return {
          texts: TEXTS.map(([sel]) => { const el = q(sel); return el && { key: el.dataset.i18n, text: el.textContent }; }),
          attrs: ATTRS.map(([sel, name]) => { const el = q(sel); return el && { spec: el.dataset.i18nAttr, value: el.getAttribute(name) }; }),
          bound: [...document.querySelectorAll('[data-i18n]')].map(el => ({ key: el.dataset.i18n, text: el.textContent })),
          boundAttrs: [...document.querySelectorAll('[data-i18n-attr]')].map(el => { const [name, key] = el.dataset.i18nAttr.split(':'); return { key, value: el.getAttribute(name) }; }),
          tag: { lines: tag.dataset.lines, spans: [...tag.querySelectorAll('span')].map(s => s.textContent), describedby: tag.getAttribute('aria-describedby'), box: box(tag) },
          blind: { tag: blind.tagName, cls: blind.className, text: blind.textContent, afterTag: tag.nextElementSibling === blind, box: box(blind) },
          cta: { order: [...cta.children].map(c => c.tagName + '.' + c.className), mail: [cta.querySelector('a').getAttribute('href'), cta.querySelector('a').getAttribute('dir')],
            swHidden: cta.querySelector('.sw').hasAttribute('hidden'), lang: [lang.getAttribute('aria-haspopup'), lang.getAttribute('aria-expanded'), lang.textContent.trim()] },
          head: { first: head.firstElementChild.getAttribute('charset'), title: document.title, locale: q('meta[property="og:locale"]').content, hreflang: !!q('[hreflang]'), alternate: !!q('link[rel~="alternate"]') },
          html: [document.documentElement.lang, document.documentElement.dir],
        };
      }, { TEXTS, ATTRS });

      // TXT-5: the German text of each bound element is the German text of its key
      TEXTS.forEach(([sel, key], i) => {
        const el = m.texts[i];
        check(`TXT-5: ${sel} is bound to ${key}`, !!el && el.key === key, JSON.stringify(el));
        if (!key.includes('{')) check(`TXT-5: ${sel} shows the German text of ${key}`, !!el && el.text === de[key], JSON.stringify([el && el.text, de[key]]));
      });
      ATTRS.forEach(([sel, name, key], i) => {
        const el = m.attrs[i], german = de[key] && de[key].replace('{code}', 'DE').replace('{name}', 'Deutsch');
        check(`TXT-5: ${sel} is bound to ${name}:${key}`, !!el && el.spec === `${name}:${key}`, JSON.stringify(el));
        check(`TXT-5: ${sel} has the German ${name} of ${key}`, !!el && el.value === german, JSON.stringify([el && el.value, german]));
      });
      for (const b of m.bound) check(`TXT-5: a bound element's key exists in de.js: ${b.key}`, b.key.includes('{') || (b.key in de && b.text === de[b.key]), JSON.stringify(b));
      for (const b of m.boundAttrs) check(`TXT-5: a bound attribute's key exists in de.js: ${b.key}`, b.key in de, JSON.stringify(b));

      // APP-6: the Tagline of the markup is the Tagline of the German file
      const lines = [de['tag.1'], de['tag.2'], 'dreambau.com'];
      check('APP-6: #tag has data-lines made of tag.1, tag.2 and the brand', m.tag.lines === lines.join('|'), m.tag.lines);
      check('APP-6: its three spans show the same three lines', JSON.stringify(m.tag.spans) === JSON.stringify(lines), JSON.stringify(m.tag.spans));
      // APP-7: #blind is empty, follows #tag, is the description of #tag, is no .sr and shows nothing
      check('APP-7: #blind is an empty paragraph right after #tag', m.blind.tag === 'P' && m.blind.text === '' && m.blind.afterTag, JSON.stringify(m.blind));
      check('APP-7: #tag has aria-describedby="blind"', m.tag.describedby === 'blind', String(m.tag.describedby));
      check('APP-7: #blind has its own class (not .sr: the static page turns .sr into the large Tagline)', m.blind.cls === 'blind', m.blind.cls);
      check('APP-7: #blind takes no room, while #tag does', Math.max(...m.blind.box) <= 1 && Math.min(...m.tag.box) > 100, JSON.stringify([m.blind.box, m.tag.box]));
      // APP-9: the contact line is the address, the words, the Sprachumschalter
      check('APP-9: the contact line is the address, then .words, then .sw', JSON.stringify(m.cta.order) === JSON.stringify(['A.', 'SPAN.words', 'SPAN.sw']), JSON.stringify(m.cta.order));
      check('APP-9: the address link is the same mailto: link, left to right', JSON.stringify(m.cta.mail) === JSON.stringify(['mailto:info@dreambau.com', 'ltr']), JSON.stringify(m.cta.mail));
      check('APP-9: .sw is hidden, its button is closed and shows the code DE', m.cta.swHidden && JSON.stringify(m.cta.lang) === JSON.stringify(['dialog', 'false', 'DE']), JSON.stringify(m.cta));
      // CHO-10, FIL-13: the head stays German and has no per-language link; the charset comes first
      check('FIL-13: <meta charset="utf-8"> is the first element of <head>', m.head.first === 'utf-8', String(m.head.first));
      check('CHO-10: the page is lang="de" dir="ltr", the head is German, and there is no hreflang or alternate link',
        JSON.stringify(m.html) === JSON.stringify(['de', 'ltr']) && m.head.title === 'dreambau.com' && m.head.locale === 'de_DE' && !m.head.hreflang && !m.head.alternate, JSON.stringify([m.html, m.head]));
    } finally { await t.close(); }
  });
  check.done();
}
