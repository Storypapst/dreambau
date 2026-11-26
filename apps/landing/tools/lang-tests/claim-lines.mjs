// A production can close with its own two lead-in lines (keys claim.<id>.1 and claim.<id>.2); the brand stays the third line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ROOT } from '../lib.mjs';
const runtime = fs.readFileSync(ROOT + '/site/i18n.js', 'utf8');
function fixture(id) {
  const spans = [{ textContent: '' }, { textContent: '' }, { textContent: '' }];
  const tag = { dataset: {}, querySelectorAll: () => spans }, blind = { dataset: { i18n: 'blind.{anim}' }, textContent: '' }, window = {};
  const document = { currentScript: { src: 'https://example.test/i18n.js' }, readyState: 'loading', documentElement: {}, head: { appendChild() {} },
    querySelector: s => s === '#tag' ? tag : null, querySelectorAll: s => s === '[data-i18n]' ? [blind] : [], addEventListener() {}, createElement: () => ({ addEventListener() {}, getContext: () => null }) };
  vm.runInNewContext(runtime, { window, document, URLSearchParams, location: { search: '' }, navigator: { languages: ['de'], language: 'de' }, setTimeout: () => 0, clearTimeout() {}, Intl });
  const D = window.Dream; D.state.id = id;
  D.lang('de', { 'tag.1': 'Jeht nich…', 'tag.2': 'jibs nich…', 'claim.x1.1': 'Eins.', 'claim.x1.2': 'Zwei.',
    'blind.x1': 'Zeilen: „{tag1}“, „{tag2}“, „{brand}“.', 'blind.4k': 'Zeilen: „{tag1}“, „{tag2}“, „{brand}“.' });
  return { D, tag, spans, blind };
}
test('a production with claim keys shows them as the first two lines, the brand stays the third', () => {
  const { D, tag, spans } = fixture('x1'); D.i18n.apply();
  assert.equal(tag.dataset.lines, 'Eins.|Zwei.|dreambau.com');
  assert.deepEqual(spans.map(s => s.textContent), ['Eins.', 'Zwei.', 'dreambau.com']);
});
test('the description for screen readers names the production\'s own lines', () => {
  const { D, blind } = fixture('x1'); D.i18n.apply();
  assert.equal(blind.textContent, 'Zeilen: „Eins.“, „Zwei.“, „dreambau.com“.');
});
test('a production without claim keys keeps the shared Tagline', () => {
  const { D, tag, blind } = fixture('4k'); D.i18n.apply();
  assert.equal(tag.dataset.lines, 'Jeht nich…|jibs nich…|dreambau.com');
  assert.equal(blind.textContent, 'Zeilen: „Jeht nich…“, „jibs nich…“, „dreambau.com“.');
});
test('a language that lacks the claim falls back to German for those lines, not to a mix', () => {
  const { D, tag } = fixture('x1'); D.lang('en', { 'tag.1': 'One', 'tag.2': 'Two' }); D.state.lang = 'en'; D.i18n.apply();
  assert.equal(tag.dataset.lines, 'One|Two|dreambau.com');
});
