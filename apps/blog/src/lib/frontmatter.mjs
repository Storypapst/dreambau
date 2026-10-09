// The reader of a post file (spec 5.2 PF-2 and PF-3): the file text -> the fields of the front matter with their lines,
// the lines of the body, and every error with its line. It never throws and does not stop at the first error, except
// where nothing can be read after it (no opening or no closing ---).
//
// The front matter is a small subset of YAML (PF-3): one `key: value` per line; a value is a plain scalar, a
// "double-quoted" string with JSON escapes, or a 'single-quoted' string. Lists, maps, block scalars, anchors, aliases,
// tags, comments and multi-line values are refused.
import { at, fail } from './findings.mjs';

export const KEYS = ['title', 'date', 'lang', 'sourceLink', 'sourceTitle', 'quote', 'quoteSource', 'image', 'imageAlt', 'imageRights', 'example'];
export const REQUIRED_KEYS = ['title', 'date'];

const DOUBLE = /^"((?:[^"\\]|\\.)*)"$/;
const SINGLE = /^'((?:[^']|'')*)'$/;

// Returns { value } or { error }.
function parseValue(raw) {
  const first = raw[0];
  if (first === '"') {
    if (!DOUBLE.test(raw)) return { error: /^"(?:[^"\\]|\\.)*"/.test(raw) ? 'text after the closing double quote' : 'the double quote is not closed' };
    try {
      const value = JSON.parse(raw);
      if (typeof value === 'string') return { value };
    } catch { /* the message below */ }
    return { error: 'a double-quoted value must be a JSON string (check the backslash escapes)' };
  }
  if (first === "'") {
    if (!SINGLE.test(raw)) return { error: /^'(?:[^']|'')*'/.test(raw) ? 'text after the closing single quote' : 'the single quote is not closed' };
    return { value: raw.slice(1, -1).replace(/''/g, "'") };
  }
  if (first === '|' || first === '>') return { error: 'block scalars (| and >) are not allowed; write the value on one line' };
  if (first === '&' || first === '*') return { error: 'anchors and aliases (& and *) are not allowed' };
  if (first === '!') return { error: 'tags (!) are not allowed' };
  if (first === '[' || first === '{') return { error: 'lists and maps are not allowed; write one value per key' };
  if (first === '#') return { error: 'a value that starts with # must be quoted (it would be a comment)' };
  if (raw === '-' || raw.startsWith('- ')) return { error: 'lists are not allowed; write one value per key' };
  if (/:( |$)/.test(raw)) return { error: 'a value that contains ": " must be quoted' };
  if (/ #/.test(raw)) return { error: 'a value that contains " #" must be quoted (it would be a comment)' };
  return { value: raw };
}

export function parsePostText(input, file) {
  const findings = [];
  const result = { findings, fields: {}, closeLine: null, body: null };
  let text = typeof input === 'string' ? input : '';
  if (typeof input !== 'string') findings.push(fail('PF-2', at(file, 1), 'the file could not be read as text'));

  if (text.charCodeAt(0) === 0xfeff) {
    findings.push(fail('PF-2', at(file, 1), 'the file starts with a byte order mark (BOM); save it as UTF-8 without BOM'));
    text = text.slice(1);
  }
  if (text.includes('\r')) {
    const first = text.slice(0, text.indexOf('\r')).split('\n').length;
    findings.push(fail('PF-2', at(file, first), 'a carriage return (CRLF line ending); the file must use line feeds only'));
    text = text.replace(/\r\n?/g, '\n');
  }
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  if (lines[0] !== '---') {
    findings.push(fail('PF-2', at(file, 1), 'the file must start with a line ---'));
    return result;
  }
  const close = lines.indexOf('---', 1);
  if (close === -1) {
    findings.push(fail('PF-2', at(file, 1), 'the front matter has no closing line ---'));
    return result;
  }
  result.closeLine = close + 1;

  for (let index = 1; index < close; index += 1) {
    const number = index + 1;
    let line = lines[index];
    const problem = (what, rule = 'PF-3') => findings.push(fail(rule, at(file, number), what));
    let tab = false;
    if (line.includes('\t')) {
      tab = true;
      problem('a tab character; the front matter uses spaces only', 'PF-2');
      line = line.replace(/\t/g, ' ');
    }
    const quiet = (what) => { if (!tab) problem(what); }; // a line with a tab has said its one thing already
    if (line === '') { problem('an empty line inside the front matter'); continue; }
    if (line.startsWith(' ')) { quiet('an indented line; lists, maps and values on several lines are not allowed'); continue; }
    if (line.startsWith('#')) { quiet('comments are not allowed in the front matter'); continue; }
    if (line === '-' || line.startsWith('- ')) { quiet('lists are not allowed; write one value per key'); continue; }
    const match = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(line);
    if (!match) { quiet('expected "key: value"'); continue; }
    const [, key, rest] = match;
    if (!KEYS.includes(key)) { quiet(`unknown key ${key}; the keys are ${KEYS.join(', ')}`); continue; }
    if (key in result.fields) { quiet(`the key ${key} appears twice (first at line ${result.fields[key].line})`); continue; }
    if (rest !== '' && rest[0] !== ' ') { quiet('expected "key: value" with a space after the colon'); continue; }
    if (/\s$/.test(rest)) problem('trailing space after the value', 'PF-12');
    const raw = rest.trim();
    if (raw === '') { quiet(`the key ${key} has no value; write it on this line`); continue; }
    const parsed = parseValue(raw);
    if (parsed.error) { quiet(`${key}: ${parsed.error}`); continue; }
    result.fields[key] = { value: parsed.value, line: number, quoted: raw[0] === '"' || raw[0] === "'" };
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in result.fields) && !findings.some((finding) => finding.what.startsWith(`${key}:`) || finding.what.startsWith(`the key ${key} has no`))) {
      findings.push(fail('PF-3', at(file, result.closeLine), `the required key ${key} is missing`));
    }
  }

  // After the closing line: one blank line, then the body.
  if (lines.length === close + 1) {
    findings.push(fail('PF-2', at(file, close + 2), 'the file has no body; a blank line and the text must follow the closing ---'));
    return result;
  }
  if (lines[close + 1] !== '') findings.push(fail('PF-2', at(file, close + 2), 'a blank line must follow the closing ---'));
  const bodyStart = lines[close + 1] === '' ? close + 2 : close + 1;
  const bodyLines = lines.slice(bodyStart).map((textOfLine, offset) => ({ text: textOfLine, line: bodyStart + offset + 1 }));
  if (bodyLines.every((entry) => entry.text.trim() === '')) {
    findings.push(fail('PF-2', at(file, bodyStart + 1), 'the file has no body; the text "Warum lesenswert" must follow'));
    return result;
  }
  result.body = { startLine: bodyStart + 1, lines: bodyLines };
  return result;
}
