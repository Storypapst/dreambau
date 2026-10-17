// LI-4, PO-1: the preview of the list is the first paragraph, cut at 200 code points at a word boundary with an ellipsis
// when it was cut; the description of a post page is the first 160 code points of the body at a word boundary. The
// expected strings are written out by hand.
import { check, same, run } from '../lib/check.mjs';
import { cutAtWord, descriptionOf, previewOf } from '../../src/lib/preview.mjs';

const words = (count) => Array.from({ length: count }, (_, index) => `wort${index}`).join(' ');
const points = (text) => [...text].length;

await run(async () => {
  same('LI-4 a paragraph of up to 200 code points is shown whole, with no ellipsis', previewOf('Kurzer Absatz.'), 'Kurzer Absatz.');
  const exact = `${'a'.repeat(99)} ${'b'.repeat(100)}`;
  same('LI-4 exactly 200 code points: whole, no ellipsis', [points(exact), previewOf(exact)], [200, exact]);

  const text = 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig einundzwanzig zweiundzwanzig dreiundzwanzig vierundzwanzig fünfundzwanzig sechsundzwanzig siebenundzwanzig';
  const cut = previewOf(text);
  same('LI-4 a longer paragraph is cut after a whole word and ends with the ellipsis', cut, 'eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig einundzwanzig zweiundzwanzig dreiundzwanzig vierundzwanzig…');
  check('LI-4 ... the text before the ellipsis is at most 200 code points and is the start of the original', points(cut) - 1 <= 200 && text.startsWith(cut.slice(0, -1)) && /\s/.test(text[cut.length - 1]), String(points(cut)));

  const boundary = `${'a'.repeat(199)} bbbb cccc`;
  same('LI-4 when the 201st code point is a space the word before it is kept whole', previewOf(boundary), `${'a'.repeat(199)}…`);
  const mid = `${'a'.repeat(198)} bbbb cccc`;
  same('LI-4 when a word crosses the limit it is dropped whole', previewOf(mid), `${'a'.repeat(198)}…`);
  same('LI-4 a trailing comma or colon before the cut is dropped, so the ellipsis follows a word', previewOf(`${'a'.repeat(190)}, ${'b'.repeat(30)}`), `${'a'.repeat(190)}…`);
  const long = 'x'.repeat(250);
  same('LI-4 a single word longer than the limit is cut at exactly 200 code points', previewOf(long), `${'x'.repeat(200)}…`);
  const emoji = previewOf(`${'😀'.repeat(250)}`);
  same('LI-4 250 emoji: cut at 200 code points (not 100 code units), plus the ellipsis', [...emoji].length, 201);

  // The description of the post page: 160 code points at a word boundary, the paragraphs joined by one space, no ellipsis.
  const body = [words(12), words(12)];
  same('PO-1 a short body is the description as it is, paragraphs joined by one space', descriptionOf(['Eins.', 'Zwei.']), 'Eins. Zwei.');
  const description = descriptionOf(body);
  check('PO-1 a longer body is cut at a word boundary within 160 code points, with no ellipsis', points(description) <= 160 && !description.endsWith('…') && /wort\d+$/.test(description) && body.join(' ').startsWith(description), `${points(description)}: ${description}`);
  same('PO-1 ... and it is the longest such cut', descriptionOf(['a'.repeat(100), 'b'.repeat(100)]), 'a'.repeat(100));
  same('PO-1 cutAtWord of a text within the limit returns it unchanged', cutAtWord('ein Text', 160), { text: 'ein Text', cut: false });
});
