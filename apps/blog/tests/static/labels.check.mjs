// LG-3, LG-5, LG-6, LE-6, V12 (the subset of slice S2): labels.de.json holds exactly the 29 keys blog.* of the table in
// spec 5.3, with the German texts of that table, each at most 40 code points; the only placeholder is {site}; no
// avoid word. The 47 language files are slice S6. The expected table below is typed by hand from spec 5.3, never read
// from the file under test.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { ROOT } from '../lib/paths.mjs';
import { LABEL_KEYS, labelProblems, loadLabels } from '../../src/lib/labels.mjs';

const TABLE = [
  ['blog.title', 'Blog'], ['blog.sub', 'Zitate und Links, dazu warum es lohnt.'], ['blog.home', 'Startseite'],
  ['blog.list.label', 'Beiträge, neueste zuerst'], ['blog.feed', 'Feed'], ['blog.feed.title', 'Feed abonnieren (Atom)'],
  ['blog.back', 'Zurück zur Liste'], ['blog.why', 'Warum lesenswert'], ['blog.source', 'Quelle'],
  ['blog.source.mark.title', 'Dieser Beitrag verweist auf eine Quelle'], ['blog.source.leads', 'Führt zu {site}. Nichts ist eingebettet.'],
  ['blog.lang.en.title', 'Beitrag auf Englisch'], ['blog.lang.de', 'Deutsch'], ['blog.lang.en', 'Englisch'],
  ['blog.empty.title', 'Noch keine Beiträge'], ['blog.empty.text', 'Neue Beiträge stehen hier und im Feed.'],
  ['blog.error.title', 'Diesen Beitrag gibt es nicht'], ['blog.error.text', 'Adresse falsch oder Beitrag entfernt.'],
  ['blog.facts', 'Zu diesem Beitrag'], ['blog.date', 'Datum'], ['blog.language', 'Sprache'], ['blog.address', 'Adresse'],
  ['blog.next.older', 'Älterer Beitrag'], ['blog.next.newer', 'Neuerer Beitrag'], ['blog.post.nav', 'Weitere Beiträge'],
  ['blog.legend', 'Zeichen'], ['blog.legend.src', 'verweist auf eine Quelle'], ['blog.legend.en', 'Beitrag auf Englisch'],
  ['blog.nav.label', 'Website'],
];
const points = (text) => [...text].length;
const lines = (labels) => labelProblems(labels).map((problem) => `${problem.rule} ${problem.where}`);

await run(async () => {
  const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'labels.de.json'), 'utf8'));
  same('V12 the table of spec 5.3 has 29 rows (the test is typed from it)', TABLE.length, 29);
  same('V12 labels.de.json has exactly the 29 keys of the table, in the order of the table', Object.keys(file), TABLE.map(([key]) => key));
  same('LG-3 every German text is the text of the table', file, Object.fromEntries(TABLE));
  check('LG-3 every German text is at most 40 code points (a placeholder counted as written)', Object.values(file).every((text) => points(text) <= 40), String(Math.max(...Object.values(file).map(points))));
  same('LG-3 the German texts total 523 bytes, as the spec counts them', Buffer.byteLength(Object.values(file).join('')), 523);
  same('LG-5 the only placeholder in any text is {site}, in blog.source.leads', Object.entries(file).filter(([, text]) => /\{[^}]*\}/.test(text)).map(([key, text]) => `${key} ${text.match(/\{[^}]*\}/g).join('')}`), ['blog.source.leads {site}']);
  check('LE-6 no label holds one of the avoid words (whole words, any case)', !/\b(redaktionell\w*|redaktion|journalismus|magazin|nachrichten|presse)\b/i.test(Object.values(file).join(' ')));
  check('LG-3 no label holds the word deploy', !/deploy/i.test(Object.values(file).join(' ')));

  same('V12 the code knows the same 29 keys as the table', LABEL_KEYS, TABLE.map(([key]) => key));
  same('V12 loadLabels() returns the file as it is', loadLabels(), file);
  same('V12 the real set has no problem', labelProblems(file), []);

  // ---- negative controls: each broken copy fails with its own line ----
  const without = { ...file };
  delete without['blog.date'];
  same('V12 a copy missing a key fails and names the key', lines(without), ['LG-3 blog.date']);
  same('V12 a copy with an extra key fails and names the key', lines({ ...file, 'blog.extra': 'x' }), ['LG-3 blog.extra']);
  same('LG-3 a text of 41 code points fails', lines({ ...file, 'blog.sub': 'x'.repeat(41) }), ['LG-3 blog.sub']);
  check('LG-3 a text of 40 code points passes, counted as code points and not as bytes', lines({ ...file, 'blog.sub': 'ä'.repeat(40) }).length === 0);
  same('LG-5 a second placeholder fails', lines({ ...file, 'blog.source.leads': 'Führt zu {site} und {name}.' }), ['LG-5 blog.source.leads']);
  same('LG-5 a placeholder in a text that has none fails', lines({ ...file, 'blog.home': 'Start {site}' }), ['LG-5 blog.home']);
  same('LG-5 blog.source.leads without {site} fails', lines({ ...file, 'blog.source.leads': 'Führt zu einer Quelle.' }), ['LG-5 blog.source.leads']);
  same('LE-6 an avoid word fails', lines({ ...file, 'blog.sub': 'Aus der Redaktion.' }), ['LE-6 blog.sub']);
  same('LG-3 a value that is no text fails', lines({ ...file, 'blog.feed': 3 }), ['LG-3 blog.feed']);
});
