// The fixed German texts of the Blog: labels.de.json, the one source of the build (spec 5.3, LG-3). Exactly the 29 keys
// blog.* of the table, each text at most 40 code points; the only placeholder is {site} (LG-5). The 47 language files
// are slice S6, so nothing here reads another language.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './findings.mjs';

export const LABELS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'labels.de.json');
export const LABEL_MAX = 40;
const AVOID = /(?<![\p{L}\p{N}])(redaktionell\p{L}*|redaktion|journalismus|magazin|nachrichten|presse)(?![\p{L}\p{N}])/iu; // LE-6

// The keys, in the order of the table of spec 5.3.
export const LABEL_KEYS = Object.freeze([
  'blog.title', 'blog.sub', 'blog.home', 'blog.list.label', 'blog.feed', 'blog.feed.title', 'blog.back', 'blog.why',
  'blog.source', 'blog.source.mark.title', 'blog.source.leads', 'blog.lang.en.title', 'blog.lang.de', 'blog.lang.en',
  'blog.empty.title', 'blog.empty.text', 'blog.error.title', 'blog.error.text', 'blog.facts', 'blog.date', 'blog.language',
  'blog.address', 'blog.next.older', 'blog.next.newer', 'blog.post.nav', 'blog.legend', 'blog.legend.src', 'blog.legend.en',
  'blog.nav.label',
]);

// Every problem of a set of labels as { level, rule, where, what } findings (`where` is the key).
export function labelProblems(labels) {
  const found = [];
  const object = labels !== null && typeof labels === 'object' && !Array.isArray(labels) ? labels : {};
  for (const key of LABEL_KEYS) if (!(key in object)) found.push(fail('LG-3', key, 'the key is missing'));
  for (const key of Object.keys(object)) if (!LABEL_KEYS.includes(key)) found.push(fail('LG-3', key, 'the key is not one of the 29 keys of the table'));
  for (const key of LABEL_KEYS) {
    if (!(key in object)) continue;
    const text = object[key];
    if (typeof text !== 'string' || text === '') { found.push(fail('LG-3', key, 'the text must be a non-empty string')); continue; }
    const length = [...text].length;
    if (length > LABEL_MAX) found.push(fail('LG-3', key, `the text has ${length} code points; at most ${LABEL_MAX}`));
    const placeholders = text.match(/\{[^}]*\}/g) || [];
    const expected = key === 'blog.source.leads' ? ['{site}'] : [];
    if (JSON.stringify(placeholders) !== JSON.stringify(expected)) found.push(fail('LG-5', key, `the placeholders are ${JSON.stringify(placeholders)}; the only one allowed is {site}, and only in blog.source.leads`));
    if (AVOID.test(text)) found.push(fail('LE-6', key, 'the text holds a word that the legal precaution avoids'));
  }
  return found;
}

// Reads and checks the file. A bad file stops the build with the lines of every problem.
export function loadLabels(file = LABELS_FILE) {
  const labels = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = labelProblems(labels);
  if (problems.length > 0) throw new Error(problems.map((p) => `${p.level} ${p.rule} ${path.basename(file)}:${p.where}: ${p.what}`).join('\n'));
  return labels;
}

// The text of a key with {site} replaced (LG-5). Everything else is a whole sentence.
export const fill = (text, values = {}) => text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
