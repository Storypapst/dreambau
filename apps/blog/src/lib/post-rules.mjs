// The rules of a post as functions over text, and the table of limits of spec 7.1. One module, read by the file
// validator now and by the issue validator of slice S7 later (IN-2): a rule here says WHAT is wrong with a text and
// knows nothing of files and lines, except where the text itself has lines (the body).
//
// Characters are counted as Unicode code points, after the line-ending normalisation (CRLF and CR become LF).
import { SLUG_MAX, SLUG_MIN, slugify } from './slug.mjs';

// The starting values of spec 7.1 (open point OP-17: Frank may change them). `min` and `max` count code points.
export const LIMITS = Object.freeze({
  title: Object.freeze({ min: 1, max: 100 }),
  sourceLink: Object.freeze({ max: 500 }),
  sourceTitle: Object.freeze({ min: 1, max: 120 }),
  quote: Object.freeze({ max: 280 }),
  quoteSource: Object.freeze({ min: 1, max: 120 }),
  imageBytes: 300000,
  imageAlt: Object.freeze({ min: 1, max: 250 }),
  body: Object.freeze({ min: 300, max: 1200 }),
  paragraphs: Object.freeze({ max: 6 }),
  slug: Object.freeze({ min: SLUG_MIN, max: SLUG_MAX }),
  preview: 200, // LI-4: the preview of the list is cut at 200 code points
  feedEntries: 50, // FD-3
});

export const LANGUAGES = Object.freeze(['de', 'en']); // OP-8

// LE-1: the text that starts the pending line of the legal gate. The build reads it as this constant.
export const MARKER = `${'['.repeat(2)}RECHTSPRÜFUNG`;

export const codePoints = (text) => { let count = 0; for (const _ of text) count += 1; return count; };
export const normalizeLineEndings = (text) => String(text).replace(/\r\n?/g, '\n');

const hex = (code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
const problem = (rule, what) => ({ rule, what });

// PF-12: NFC; no leading or trailing space; no control character (the line feeds of a body excepted, which the caller
// does not pass here); no bidirectional control, no zero-width character, none that XML 1.0 forbids; none of the
// marker text, no run of two opening or of two closing square brackets. One problem per distinct character.
export function textProblems(value, { allowLineFeed = false } = {}) {
  const found = [];
  const seen = new Set();
  let position = 0;
  const report = (code, kind) => { if (!seen.has(code)) { seen.add(code); found.push(problem('PF-12', `${kind} ${hex(code)} at character ${position}`)); } };
  for (const character of value) {
    position += 1;
    const code = character.codePointAt(0);
    if (code === 0x0a && allowLineFeed) continue;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) report(code, 'control character');
    else if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) report(code, 'bidirectional control character');
    else if ((code >= 0x200b && code <= 0x200d) || code === 0x2060 || code === 0xfeff) report(code, 'zero-width character');
    else if ((code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff) report(code, 'character that XML 1.0 forbids');
  }
  if (value !== value.normalize('NFC')) found.push(problem('PF-12', 'the text is not in Unicode NFC (for example a letter followed by a combining mark); type the composed letter'));
  const first = value.codePointAt(0);
  const last = value.codePointAt(value.length - 1);
  const isControl = (code) => code < 0x20 || (code >= 0x7f && code <= 0x9f);
  if (value !== '' && /^\s/u.test(value) && !isControl(first) && first !== 0xfeff) found.push(problem('PF-12', 'a space at the start of the text'));
  if (value !== '' && /\s$/u.test(value) && !isControl(last) && last !== 0xfeff) found.push(problem('PF-12', 'a space at the end of the text'));
  const where = (index) => `at character ${codePoints(value.slice(0, index)) + 1}`;
  if (value.includes(MARKER)) found.push(problem('PF-12', `the marker text of the legal gate (LE-1) ${where(value.indexOf(MARKER))}`));
  else if (value.includes('[[')) found.push(problem('PF-12', `two opening square brackets in a row ${where(value.indexOf('[['))}`));
  if (value.includes(']]')) found.push(problem('PF-12', `two closing square brackets in a row ${where(value.indexOf(']]'))}`));
  return found;
}

const lengthProblem = (rule, name, value, { min = 0, max }) => {
  const length = codePoints(value);
  if (length < min || length > max) return [problem(rule, `${name} has ${length} characters; it needs ${min > 0 ? `${min} to ${max}` : `at most ${max}`}`)];
  return [];
};

// PF-4: 1 to 100 characters, no line break, and a slug of at least three characters (three letters or digits).
export function titleProblems(value) {
  if (value === '') return [problem('PF-4', 'the title is empty')];
  const found = [...lengthProblem('PF-4', 'the title', value, LIMITS.title)];
  if (/[\n\r\u2028\u2029]/.test(value)) found.push(problem('PF-4', 'the title has a line break'));
  else if (slugify(value).length < LIMITS.slug.min) found.push(problem('PF-4', `the title needs at least ${LIMITS.slug.min} letters or digits, so that its address has ${LIMITS.slug.min} characters`));
  return [...found, ...textProblems(value, { allowLineFeed: true })];
}

export function berlinDay(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// PF-5: YYYY-MM-DD and a real calendar date; a publish build refuses a date after today in Europe/Berlin.
export function dateProblems(value, { publish = false, now = new Date() } = {}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!match || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    return [problem('PF-5', `the date ${JSON.stringify(value)} is not a real calendar date written YYYY-MM-DD`)];
  }
  if (publish && value > berlinDay(now)) return [problem('PF-5', `the date ${value} is after today in Europe/Berlin (${berlinDay(now)}); a publish build refuses it`)];
  return [];
}

export const langProblems = (value) => (LANGUAGES.includes(value) ? [] : [problem('PF-6', `lang ${JSON.stringify(value)} is not one of ${LANGUAGES.join(', ')}`)]);

export const sourceTitleProblems = (value) => [...lengthProblem('PF-8', 'the source title', value, LIMITS.sourceTitle), ...textProblems(value, { allowLineFeed: true }), ...(/[\n\r]/.test(value) ? [problem('PF-8', 'the source title has a line break')] : [])];

// PF-9: a quote is one paragraph of at most 280 characters; its source is text of 1 to 120 characters.
export function quoteProblems(value) {
  const found = [];
  if (value === '') found.push(problem('PF-9', 'the quote is empty'));
  found.push(...lengthProblem('PF-9', 'the quote', value, { max: LIMITS.quote.max }));
  if (/[\n\r\u2028\u2029]/.test(value)) found.push(problem('PF-9', 'the quote must be one paragraph, without a line break'));
  return [...found, ...textProblems(value, { allowLineFeed: true })];
}
export const quoteSourceProblems = (value) => [...lengthProblem('PF-9', 'the quote source', value, LIMITS.quoteSource), ...(/[\n\r]/.test(value) ? [problem('PF-9', 'the quote source has a line break')] : []), ...textProblems(value, { allowLineFeed: true })];

export const imageAltProblems = (value) => [...lengthProblem('PF-11', 'imageAlt', value, LIMITS.imageAlt), ...(/[\n\r]/.test(value) ? [problem('PF-11', 'imageAlt has a line break')] : []), ...textProblems(value, { allowLineFeed: true })];

// PF-10 and PF-12 for the body. `lines` are { text, line } as the reader returns them. Returns the problems with the
// line they belong to, and the paragraphs: lines joined by a space (a single line feed reads as a space).
export function bodyProblems(lines) {
  const found = [];
  const paragraphs = [];
  let current = null;
  lines.forEach((entry, index) => {
    if (entry.text === '') {
      if (index === 0 || lines[index - 1].text === '' || index === lines.length - 1) found.push({ ...problem('PF-10', 'an extra blank line; paragraphs are separated by exactly one blank line, and none stands at the start or the end'), line: entry.line });
      current = null;
      return;
    }
    for (const item of textProblems(entry.text)) found.push({ ...item, line: entry.line });
    if (current === null) {
      current = { text: entry.text, line: entry.line };
      paragraphs.push(current);
    } else current.text += ` ${entry.text}`;
  });
  const first = lines.length > 0 ? lines[0].line : 1;
  if (paragraphs.length > LIMITS.paragraphs.max) found.push({ ...problem('PF-10', `${paragraphs.length} paragraphs; at most ${LIMITS.paragraphs.max}`), line: paragraphs[LIMITS.paragraphs.max].line });
  const total = paragraphs.reduce((sum, paragraph) => sum + codePoints(paragraph.text), 0) + Math.max(0, paragraphs.length - 1);
  if (total < LIMITS.body.min || total > LIMITS.body.max) found.push({ ...problem('PF-10', `the body has ${total} characters; it needs ${LIMITS.body.min} to ${LIMITS.body.max}`), line: first });
  return { problems: found, paragraphs: paragraphs.map((paragraph) => paragraph.text), characters: total };
}
