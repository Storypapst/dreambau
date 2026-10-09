// PF-2, PF-3 (V2): the reader of the file. 14 bad files, each with the rule and the line that the spec asks for, all in
// one run; the reader returns findings and never throws. Expected values are written by hand per file.
import { check, same, run } from '../lib/check.mjs';
import { FIXTURE_POST } from '../lib/paths.mjs';
import { BODY, postText } from '../lib/posts.mjs';
import fs from 'node:fs';
import { parsePostText } from '../../src/lib/frontmatter.mjs';

const FILE = 'posts/2026/x.md';
const summary = (text) => parsePostText(text, FILE).findings.map((finding) => `${finding.rule}:${finding.where}`);
const at = (...lines) => lines.map((line) => `${line[0]}:${FILE}${line[1] === undefined ? '' : `:${line[1]}`}`);

await run(async () => {
  // ---- the good file ----
  const good = parsePostText(fs.readFileSync(FIXTURE_POST, 'utf8'), FILE);
  same('PF-3 the fixture of the spec has no finding', good.findings, []);
  same('PF-3 the fixture: every key with its value and its line', Object.fromEntries(Object.entries(good.fields).map(([key, field]) => [key, [field.value, field.line]])), {
    title: ['Ein Film, der in eine Mail passt', 2], date: ['2026-10-02', 3], lang: ['de', 4], sourceLink: ['https://videos.example.test/klein-bauen', 5],
    sourceTitle: ['Klein bauen: ein Vortrag über winzige Programme', 6], quote: ['Wer wenig Platz hat, muss genau hinsehen.', 7],
    quoteSource: ['aus dem Vortrag „Klein bauen“', 8], example: ['true', 9] });
  same('PF-2 the fixture: the body starts at line 12 and holds the two paragraphs', [good.body.startLine, good.body.lines.length, good.body.lines[0].line, good.body.lines[2].line], [12, 3, 12, 14]);

  // ---- the three ways to write a value (PF-3) ----
  const values = parsePostText(postText({ lines: ['title: Plain text with "quotes" inside', 'date: 2026-10-02', 'sourceTitle: "Zeile \\"eins\\" \\u00e4 \\\\ ende"', "quoteSource: 'it''s plain'", 'quote: ""'] }), FILE);
  same('PF-3 plain, double-quoted (JSON escapes) and single-quoted values', [values.fields.title.value, values.fields.sourceTitle.value, values.fields.quoteSource.value], ['Plain text with "quotes" inside', 'Zeile "eins" ä \\ ende', "it's plain"]);
  same('PF-3 an empty quoted value is a value (the rule that refuses it is another one)', [values.findings, values.fields.quote.value], [[], '']);

  // ---- the 14 bad files of V2, each alone: [name, text, expected "rule:where" lines] ----
  const base = ['title: Ein Titel', 'date: 2026-10-02'];
  const withLines = (lines) => postText({ lines });
  const bad = [
    ['no ---', 'title: Ein Titel\ndate: 2026-10-02\n\nText\n', at(['PF-2', 1])],
    ['BOM', `﻿${postText()}`, at(['PF-2', 1])],
    ['CRLF', postText().replace(/\n/g, '\r\n'), at(['PF-2', 1])],
    ['tab', withLines(['title:\tEin Titel', 'date: 2026-10-02']), at(['PF-2', 2])],
    ['list value', withLines([...base, 'sourceTitle: [a, b]']), at(['PF-3', 4])],
    ['block scalar', withLines([...base, 'quote: |', '  erste Zeile', '  zweite Zeile']), at(['PF-3', 4], ['PF-3', 5], ['PF-3', 6])],
    ['anchor', withLines(['title: &anker Ein Titel', 'date: 2026-10-02']), at(['PF-3', 2])],
    ['repeated key', withLines([...base, 'title: Noch ein Titel']), at(['PF-3', 4])],
    ['unknown key', withLines([...base, 'author: jemand']), at(['PF-3', 4])],
    ['missing key', withLines(['title: Ein Titel']), at(['PF-3', 3])],
    ['unquoted ": "', withLines(['title: Wichtig: ein Titel', 'date: 2026-10-02']), at(['PF-3', 2])],
    ['multi-line value', withLines(['title: Ein sehr', '  langer Titel', 'date: 2026-10-02']), at(['PF-3', 3])],
    ['no body', '---\ntitle: Ein Titel\ndate: 2026-10-02\n---\n', at(['PF-2', 5])],
    ['unclosed quote', withLines(['title: "Ein Titel', 'date: 2026-10-02']), at(['PF-3', 2])],
  ];
  for (const [name, text, expected] of bad) {
    let found;
    try { found = summary(text); } catch (error) { found = [`threw ${error.message}`]; }
    same(`PF-2/3 bad file "${name}" gives exactly the expected line(s) and never throws`, found, expected);
  }
  same('V2 there are 14 bad files', bad.length, 14);

  // ---- more shapes the reader must refuse, each with its line ----
  for (const [name, lines, expected] of [
    ['a block list', [...base, 'sourceTitle:', '  - a', '  - b'], at(['PF-3', 4], ['PF-3', 5], ['PF-3', 6])],
    ['a flow map', [...base, 'quote: {a: b}'], at(['PF-3', 4])],
    ['a tag', [...base, 'quote: !!str abc'], at(['PF-3', 4])],
    ['an alias', [...base, 'quote: *anker'], at(['PF-3', 4])],
    ['a folded scalar', [...base, 'quote: >', '  text'], at(['PF-3', 4], ['PF-3', 5])],
    ['a value that starts with #', [...base, 'quote: # kein Kommentar'], at(['PF-3', 4])],
    ['a comment line', [...base, '# ein Kommentar'], at(['PF-3', 4])],
    [' #' + ' inside a plain value (a YAML comment)', [...base, 'quote: Text # Kommentar'], at(['PF-3', 4])],
    ['an empty line in the front matter', [...base, ''], at(['PF-3', 4])],
    ['no space after the colon', [...base, 'lang:de'], at(['PF-3', 4])],
    ['a line with no key', [...base, 'nur Text'], at(['PF-3', 4])],
    ['an empty value', [...base, 'quote:'], at(['PF-3', 4])],
    ['text after the closing double quote', [...base, 'quote: "abc" def'], at(['PF-3', 4])],
    ['text after the closing single quote', [...base, "quote: 'abc' def"], at(['PF-3', 4])],
    ['a bad JSON escape', [...base, 'quote: "a\\qb"'], at(['PF-3', 4])],
    ['an unclosed single quote', [...base, "quote: 'abc"], at(['PF-3', 4])],
    ['a key in the wrong case', ['Title: Ein Titel', 'date: 2026-10-02'], at(['PF-3', 2], ['PF-3', 4])],
    ['no required key at all', ['lang: de'], at(['PF-3', 3], ['PF-3', 3])],
    ['trailing space after a plain value', [...base, 'lang: de '], at(['PF-12', 4])],
  ]) same(`PF-3 ${name}`, summary(withLines(lines)), expected);

  // ---- structure ----
  same('PF-2 the closing --- is missing: one line at line 1', summary('---\ntitle: Ein Titel\ndate: 2026-10-02\n\nText\n'), at(['PF-2', 1]));
  same('PF-2 no blank line after the closing ---', summary('---\ntitle: Ein Titel\ndate: 2026-10-02\n---\nText\n'), at(['PF-2', 5]));
  same('PF-2 an empty file', summary(''), at(['PF-2', 1]));
  same('PF-2 CR on several lines is reported once, at the first', summary(postText().replace(/\n/g, '\r\n')).length, 1);
  same('PF-2 a body of blank lines only is no body', summary('---\ntitle: Ein Titel\ndate: 2026-10-02\n---\n\n\n\n'), at(['PF-2', 6]));
  check('PF-2 text that is not a string does not throw either', (() => { try { parsePostText(undefined, FILE); return true; } catch { return false; } })());
  same('PF-2 the body of a file is returned with the line of each line', parsePostText(postText({ body: 'Eins\nzwei\n\ndrei' }), FILE).body.lines, [
    { text: 'Eins', line: 12 }, { text: 'zwei', line: 13 }, { text: '', line: 14 }, { text: 'drei', line: 15 }]);
  same('PF-3 the BODY helper is the body of the fixture', BODY.split('\n\n').length, 2);
});
