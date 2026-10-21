// PF-1, PF-4 to PF-6, PF-9, PF-10, PF-12, PF-14 (V3, V5, V6, V8): the rules of a post file, one broken thing at a
// time. The expected rule ids and line numbers are written by hand. The limits of the table of 7.1 are read from the
// one limits module (the same one that slice S7 will read) and compared with the numbers of the spec, written out.
import { check, same, run } from '../lib/check.mjs';
import { BODY, bodyOf, postText } from '../lib/posts.mjs';
import { LIMITS, MARKER, codePoints } from '../../src/lib/post-rules.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';

const FILE = 'tests/fixtures/2026/ein-film.md';
const lines = (text, options = {}) => {
  const file = options.file || FILE;
  return checkPostText(text, { file, fixture: true, now: new Date('2026-10-09T10:00:00Z'), ...options })
    .findings.map((finding) => `${finding.level} ${finding.rule}:${finding.where.slice(file.length + 1) || '-'}`);
};
const text = (front, body) => postText({ front, body });
const publish = { publish: true };
// a publish build refuses the invented hosts (PF-7), so these tests use a link with a real-looking host (assembled: the
// scan of the folder finds no foreign host in the file)
const PUBLISH_LINK = ['https:', '', 'videos.beispiel-video.de', 'klein-bauen'].join('/');
const noExample = { example: undefined, sourceLink: PUBLISH_LINK };

await run(async () => {
  // ---- the table of limits (7.1) ----
  same('7.1 the limits module holds the numbers of the table of the spec', {
    title: [LIMITS.title.min, LIMITS.title.max], sourceLink: LIMITS.sourceLink.max, sourceTitle: [LIMITS.sourceTitle.min, LIMITS.sourceTitle.max], quote: LIMITS.quote.max,
    quoteSource: [LIMITS.quoteSource.min, LIMITS.quoteSource.max], imageBytes: LIMITS.imageBytes, imageAlt: [LIMITS.imageAlt.min, LIMITS.imageAlt.max],
    body: [LIMITS.body.min, LIMITS.body.max], paragraphs: LIMITS.paragraphs.max, slug: [LIMITS.slug.min, LIMITS.slug.max], preview: LIMITS.preview, feedEntries: LIMITS.feedEntries,
  }, { title: [1, 100], sourceLink: 500, sourceTitle: [1, 120], quote: 280, quoteSource: [1, 120], imageBytes: 300000, imageAlt: [1, 250], body: [300, 1200], paragraphs: 6, slug: [3, 60], preview: 200, feedEntries: 50 });
  same('LE-1 the marker text is the two opening brackets and RECHTSPRÜFUNG', MARKER, `${'['.repeat(2)}RECHTSPRÜFUNG`);
  same('PF-10 code points are counted, not UTF-16 units', [codePoints('a😀b'), 'a😀b'.length], [3, 4]);

  // ---- V3: the good file, titles ----
  same('V3 the good file (the fixture of the spec) passes with no line', lines(postText()), []);
  const big = ` `; // a no-break space is a space too
  for (const [name, front, expected] of [
    ['an empty title', { title: '""' }, ['FAIL PF-4:2']],
    ['a title of 100 characters', { title: 'a'.repeat(100) }, []],
    ['a title of 101 characters', { title: 'a'.repeat(101) }, ['FAIL PF-4:2']],
    ['a title of 100 code points that is 102 UTF-16 units', { title: `"${'ab'.repeat(49)}😀😀"` }, []],
    ['a title of 101 code points that is 102 UTF-16 units', { title: `"${'ab'.repeat(49)}😀😀x"` }, ['FAIL PF-4:2']],
    ['a title with a line break', { title: '"Zeile\\nzwei"' }, ['FAIL PF-4:2']],
    ['the title Ab (two letters)', { title: 'Ab' }, ['FAIL PF-4:2']],
    ['the title !!a!! (one letter)', { title: '"!!a!!"' }, ['FAIL PF-4:2']],
    ['the title abc (three letters)', { title: 'abc' }, []],
    ['the title 2026 (digits)', { title: '2026' }, []],
    ['a title with a leading space (quoted)', { title: '" Titel"' }, ['FAIL PF-12:2']],
    [`a title with a trailing no-break space`, { title: `"Titel${big}"` }, ['FAIL PF-12:2']],
  ]) same(`V3 ${name}`, lines(text(front)), expected);

  // ---- V3: dates ----
  for (const [name, date, expected] of [
    ['2026-02-30 is no date', '2026-02-30', ['FAIL PF-5:3']],
    ['2026-13-01', '2026-13-01', ['FAIL PF-5:3']],
    ['2026-00-10', '2026-00-10', ['FAIL PF-5:3']],
    ['2026-1-5 (no leading zeros)', '2026-1-5', ['FAIL PF-5:3']],
    ['02.10.2026', '02.10.2026', ['FAIL PF-5:3']],
    ['2026-10-02T10:00:00Z (a time)', '2026-10-02T10:00:00Z', ['FAIL PF-5:3']],
    ['2027-02-29 (no leap day)', '2027-02-29', ['FAIL PF-5:3']],
    ['2026-10-02', '2026-10-02', []],
  ]) same(`V3 date ${name}`, lines(text({ date })), expected);
  same('V3 2028-02-29 is a leap day', lines(text({ date: '2028-02-29' }), { file: 'tests/fixtures/2028/ein-film.md' }), []);

  // ---- V3: a future date is refused by a publish build only, by the Berlin day, with an injected clock ----
  const dated = (date) => text({ date, ...noExample });
  same('PF-5 a preview build accepts a date in the future', lines(dated('2026-12-31'), { now: new Date('2026-10-09T10:00:00Z') }), []);
  same('PF-5 a publish build refuses tomorrow (Berlin)', lines(dated('2026-10-10'), { ...publish, now: new Date('2026-10-09T10:00:00Z') }), ['FAIL PF-5:3']);
  same('PF-5 a publish build accepts today (Berlin)', lines(dated('2026-10-09'), { ...publish, now: new Date('2026-10-09T10:00:00Z') }), []);
  same('PF-5 22:30 UTC in summer is already the next day in Berlin: that next day passes', lines(dated('2026-10-10'), { ...publish, now: new Date('2026-10-09T22:30:00Z') }), []);
  same('PF-5 ... and the day after that fails', lines(dated('2026-10-11'), { ...publish, now: new Date('2026-10-09T22:30:00Z') }), ['FAIL PF-5:3']);
  same('PF-5 21:59:59 UTC in summer is still the same day in Berlin: the next day fails', lines(dated('2026-10-10'), { ...publish, now: new Date('2026-10-09T21:59:59Z') }), ['FAIL PF-5:3']);
  same('PF-5 23:30 UTC in winter is already the next day in Berlin: that next day passes', lines(dated('2026-12-10'), { ...publish, now: new Date('2026-12-09T23:30:00Z') }), []);
  same('PF-5 22:30 UTC in winter is still the same day in Berlin: the next day fails', lines(dated('2026-12-10'), { ...publish, now: new Date('2026-12-09T22:30:00Z') }), ['FAIL PF-5:3']);

  // ---- V3: lang ----
  for (const [lang, expected] of [['fr', ['FAIL PF-6:4']], ['DE', ['FAIL PF-6:4']], ['de', []], ['en', []]]) same(`V3 lang ${lang}`, lines(text({ lang })), expected);
  same('PF-6 lang is optional and defaults to de', checkPostText(text({ lang: undefined }), { file: FILE, fixture: true }).post.lang, 'de');

  // ---- V5: quote ----
  same('V5 a quote without quoteSource', lines(text({ quoteSource: undefined })), ['FAIL PF-9:7']);
  same('V5 a quoteSource without a quote', lines(text({ quote: undefined })), ['FAIL PF-9:7']);
  same('V5 a quote of 281 characters', lines(text({ quote: 'x'.repeat(281) })), ['FAIL PF-9:7']);
  same('V5 a quote of 280 characters passes', lines(text({ quote: 'x'.repeat(280) })), []);
  same('V5 a quote of two paragraphs', lines(text({ quote: '"eins\\n\\nzwei"' })), ['FAIL PF-9:7']);
  same('V5 an empty quote', lines(text({ quote: '""' })), ['FAIL PF-9:7']);
  same('V5 a quoteSource of 121 characters', lines(text({ quoteSource: 'x'.repeat(121) })), ['FAIL PF-9:8']);

  // ---- V6: the body ----
  const one = (count) => lines(text({}, bodyOf(count)));
  for (const [count, expected] of [[299, ['FAIL PF-10:12']], [300, []], [1200, []], [1201, ['FAIL PF-10:12']]]) same(`V6 a body of ${count} code points`, one(count), expected);
  same('V6 the fixture body is 363 code points, the number of the spec', codePoints(BODY.replace(/\n\n/g, '\n')), 363);
  const paragraph = bodyOf(60);
  same('V6 6 paragraphs pass', lines(text({}, Array(6).fill(paragraph).join('\n\n'))), []);
  same('V6 7 paragraphs fail, at the line of the 7th', lines(text({}, Array(7).fill(paragraph).join('\n\n'))), ['FAIL PF-10:24']);
  const joined = checkPostText(text({}, `${'a'.repeat(200)}\n${'b'.repeat(150)}`), { file: FILE, fixture: true });
  same('V6 a single line feed inside a paragraph is read as a space', [joined.findings, joined.post.paragraphs], [[], [`${'a'.repeat(200)} ${'b'.repeat(150)}`]]);
  same('V6 more than one blank line between paragraphs', lines(text({}, `${bodyOf(160)}\n\n\n${bodyOf(160)}`)), ['FAIL PF-10:14']);
  same('V6 a blank line at the end of the body', lines(`${text({}, bodyOf(320))}\n`), ['FAIL PF-10:13']);
  const inBody = (extra) => lines(text({}, `${bodyOf(150)} ${extra} ${bodyOf(150)}`));
  for (const [name, bad] of [
    ['a zero-width space', '​'], ['a zero-width joiner', '‍'], ['a word joiner', '⁠'], ['a byte order mark inside', '﻿'],
    ['a right-to-left override', '‮'], ['an isolate', '⁦'], ['a pop isolate', '⁩'], ['a control character', '\u0001'], ['a tab', '\t'],
    ['a C1 control character', '\u0085'], ['a delete character', '\u007f'], ['a non-character U+FFFF', '￿'], ['a lone surrogate', '\ud800'],
    ['a decomposed ä (a followed by a combining diaeresis)', 'ä'], ['the marker text', MARKER], ['two opening brackets', '[' + '['], ['two closing brackets', ']' + ']'],
  ]) same(`V6 ${name} in the body gives one PF-12 line`, inBody(bad), ['FAIL PF-12:12']);
  same('PF-12 one opening bracket and one closing bracket are fine', inBody('[eins] und [zwei]'), []);
  same('PF-12 a bracket in the middle of a longer run still counts', inBody('x[[['), ['FAIL PF-12:12']);
  same('PF-12 a space at the end of a body line', lines(text({}, `${bodyOf(310)} `)), ['FAIL PF-12:12']);
  same('PF-12 a space at the start of a body line', lines(text({}, ` ${bodyOf(310)}`)), ['FAIL PF-12:12']);
  same('PF-12 the right line is named when the fault is in the second paragraph', lines(text({}, `${bodyOf(160)}\n\n${bodyOf(160)}​`)), ['FAIL PF-12:14']);
  same('PF-12 a bad character in a front matter value is named with the line of the key', lines(text({ quote: '"ein\\u200bwort"' })), ['FAIL PF-12:7']);
  same('PF-12 a decomposed ä in a title', lines(text({ title: '"Ba\\u0308r"' })), ['FAIL PF-12:2']);
  const messages = checkPostText(text({}, `${bodyOf(310)}​`), { file: FILE, fixture: true }).findings.map((finding) => finding.what);
  check('PF-12 the message names the character (U+200B) and where in the line', messages.length === 1 && /U\+200B/.test(messages[0]) && /character 311/.test(messages[0]), messages.join(' | '));

  // ---- V8: the file name, the year, example ----
  const outside = { fixture: false };
  same('V8 example: true outside tests/fixtures is PF-14, at the line of the key', lines(postText(), outside), ['FAIL PF-14:9']);
  same('V8 example: true inside tests/fixtures is accepted', lines(postText()), []);
  same('V8 any publish build refuses example: true, also inside tests/fixtures', lines(text({ sourceLink: PUBLISH_LINK }), publish), ['FAIL PF-14:9']);
  same('V8 example: false is PF-14 too (the key means true or nothing)', lines(text({ example: 'false' }), outside), ['FAIL PF-14:9']);
  same('V8 example: yes is not a boolean', lines(text({ example: 'yes' })), ['FAIL PF-3:9']);
  const named = (file, front = {}) => checkPostText(text({ ...front, example: undefined }), { file }).findings.map((finding) => `${finding.rule}:${finding.where}`);
  same('V8 a file name that is not a slug: PF-1', named('posts/2026/Ein_Film.md'), ['PF-1:posts/2026/Ein_Film.md']);
  same('V8 a file in 2025 for a post dated 2026: PF-1, at the date', named('posts/2025/ein-film.md'), ['PF-1:posts/2025/ein-film.md:3']);
  same('V8 a slug of 2 characters', named('posts/2026/ab.md'), ['PF-1:posts/2026/ab.md']);
  same('V8 a slug of 60 characters passes, one of 61 fails', [named(`posts/2026/${'a'.repeat(60)}.md`), named(`posts/2026/${'a'.repeat(61)}.md`).length], [[], 1]);
  same('V8 a slug with a double dash, a leading dash, a trailing dash', ['a--b', '-ab', 'ab-'].map((slug) => named(`posts/2026/${slug}.md`).length), [1, 1, 1]);
  same('V8 a file that does not end in .md', named('posts/2026/ein-film.txt'), ['PF-1:posts/2026/ein-film.txt']);
  same('V8 a year folder that is not four digits', named('posts/26/ein-film.md'), ['PF-1:posts/26/ein-film.md']);
  same('V8 a file name and a year that are both wrong give both lines', named('posts/2025/Ein.md'), ['PF-1:posts/2025/Ein.md', 'PF-1:posts/2025/Ein.md:3']);
  same('V8 the posts the validator hands back carry year, slug and address', (({ year, slug, address }) => [year, slug, address])(checkPostText(postText(), { file: FILE, fixture: true }).post), ['2026', 'ein-film', '2026/ein-film']);

  // ---- never throws ----
  for (const [name, input] of [['undefined', undefined], ['a number', 42], ['empty', ''], ['only dashes', '---\n---\n']]) {
    let outcome;
    try { outcome = checkPostText(input, { file: FILE, fixture: true }).findings.length > 0; } catch (error) { outcome = `threw ${error.message}`; }
    same(`BD-4 the validator does not throw on ${name}`, outcome, true);
  }
});
