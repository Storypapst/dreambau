// PF-13: the slug of a title (V1). The expected slugs are written out by hand from the table of the spec, never
// computed with the code under test.
import { check, same, run } from '../lib/check.mjs';
import { nextFreeSlug, slugify } from '../../src/lib/slug.mjs';

const letters = (count) => 'a'.repeat(count);

await run(async () => {
  // ---- the table of V1 ----
  for (const [title, slug] of [
    ['Ein Film, der in eine Mail passt', 'ein-film-der-in-eine-mail-passt'],
    ['Größe & Maß', 'groesse-mass'],
    ['  ÄÖÜ  ', 'aeoeue'],
    ['Café-Bar', 'cafe-bar'],
    ['ÄÖÜß', 'aeoeuess'],
    ['Crème brûlée à la façon', 'creme-brulee-a-la-facon'],
    ['Ä', 'ae'],
    ['Ä (zerlegtes Ä)', 'ae-zerlegtes-ae'],
    ['Eins --- zwei   drei', 'eins-zwei-drei'],
    ['2026', '2026'],
  ]) same(`PF-13 slug of ${JSON.stringify(title)}`, slugify(title), slug);

  // ---- no slug ----
  for (const title of ['!!!', '', '   ', '日本語']) same(`PF-13 ${JSON.stringify(title)} has no slug`, slugify(title), '');

  // ---- length: at most 60, cut at a dash; exactly 60 for a word without a dash ----
  const four = (count) => Array.from({ length: count }, () => 'abcd').join(' ');
  same('PF-13 a 90-character title with dashes is cut at a dash: 12 words of 4 letters, 59 characters', slugify(four(18)), four(12).replaceAll(' ', '-'));
  check('PF-13 the cut slug has at most 60 characters and does not end in a dash', slugify(four(18)).length <= 60 && !slugify(four(18)).endsWith('-'));
  same('PF-13 one 90-letter word gives exactly 60 letters', slugify(letters(90)), letters(60));
  // five words, 4 dashes: 11 + 11 + 11 + 11 + 12 = 60 characters, then a dash at index 60
  const fiveWords = [11, 11, 11, 11, 12].map(letters).join(' ');
  same('PF-13 a dash right after the 60th character is a boundary: all five words stay', slugify(`${fiveWords} next`), fiveWords.replaceAll(' ', '-'));
  same('PF-13 a slug of exactly 60 characters stays as it is', slugify(fiveWords), fiveWords.replaceAll(' ', '-'));
  same('PF-13 a short first word keeps the slug at least three characters long: no cut below 3', slugify(`ab ${letters(90)}`), `ab-${letters(57)}`);

  // ---- the suffix: the first free number, also for a tombstone ----
  const taken = (...addresses) => (address) => addresses.includes(address);
  same('PF-13 a free address gets no suffix', nextFreeSlug('Größe & Maß', '2026', taken()), 'groesse-mass');
  same('PF-13 a taken address gets -2', nextFreeSlug('Größe & Maß', '2026', taken('2026/groesse-mass')), 'groesse-mass-2');
  same('PF-13 -2 taken as well gives -3', nextFreeSlug('Größe & Maß', '2026', taken('2026/groesse-mass', '2026/groesse-mass-2')), 'groesse-mass-3');
  same('PF-13 the same title in another year is free', nextFreeSlug('Größe & Maß', '2027', taken('2026/groesse-mass')), 'groesse-mass');
  same('PF-13 a gap is used: -2 is free although -3 is taken', nextFreeSlug('Größe & Maß', '2026', taken('2026/groesse-mass', '2026/groesse-mass-3')), 'groesse-mass-2');
  same('PF-13 a title without a slug stays without one', nextFreeSlug('!!!', '2026', taken()), '');
  const suffixed = nextFreeSlug(letters(90), '2026', taken(`2026/${letters(60)}`));
  same('PF-13 the suffix still fits in 60 characters: the base is cut short', [suffixed, suffixed.length], [`${letters(58)}-2`, 60]);
});
