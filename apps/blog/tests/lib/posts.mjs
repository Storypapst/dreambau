// Builders for post files in the checks. A file is made from raw front matter lines (exactly as they stand in the
// file) and a body, so that a check can break one thing at a time. All text is invented (hosts end in example.test).

export const FIRST_PARAGRAPH = 'Der Vortrag zeigt, wie ein kleines Programm mit wenigen Zeilen auskommt und trotzdem alles Nötige tut. Man sieht dabei, wie viel Ballast wir sonst mitschleppen, ohne es zu merken.';
export const SECOND_PARAGRAPH = 'Das gilt auch für unsere Arbeit: Wer vorher entscheidet, was wirklich zählt, erzählt in wenigen Sekunden mehr als andere in einer Stunde. Für uns war das der Anstoß, kürzer zu denken.';
// 363 code points: 176 + 1 (the paragraph break) + 186, the number the spec gives for its example (7.1).
export const BODY = `${FIRST_PARAGRAPH}\n\n${SECOND_PARAGRAPH}`;

// The keys of the good file, in the order of the example of spec 7.1, as raw lines.
export const GOOD_FRONT = {
  title: 'Ein Film, der in eine Mail passt',
  date: '2026-10-02',
  lang: 'de',
  sourceLink: 'https://videos.example.test/klein-bauen',
  sourceTitle: '"Klein bauen: ein Vortrag über winzige Programme"',
  quote: 'Wer wenig Platz hat, muss genau hinsehen.',
  quoteSource: '"aus dem Vortrag „Klein bauen“"',
  example: 'true',
};

// front: an object key -> raw value; a value of undefined leaves the key out. Keys not in GOOD_FRONT are appended.
export function postText({ front = {}, body = BODY, lines } = {}) {
  const merged = { ...GOOD_FRONT, ...front };
  const keyLines = lines || Object.entries(merged).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value}`);
  return `---\n${keyLines.join('\n')}\n---\n\n${body}\n`;
}

// A body of exactly `count` code points of one paragraph (a letter, repeated, with a space every ten letters).
export function bodyOf(count) {
  let text = '';
  while (text.length < count) text += text.length % 10 === 9 ? ' ' : 'a';
  return text.replace(/ $/, 'a').slice(0, count);
}
