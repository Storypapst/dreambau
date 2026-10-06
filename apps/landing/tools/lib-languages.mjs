// The files of the language mechanism: the manifest (spec 7.6: read the source form, check it, write the published form) and a language
// file (7.2: read it). Shared by the build (tools/build-apex.mjs, tools/bundle.mjs) and the tests; the later steps of the mechanism
// (the mirror of the Sprachtabelle, the checks) add their own functions below.

// The file is exactly one statement and one final newline: Dream.i18n.manifest({ ...JSON... });
const STATEMENT = /^Dream\.i18n\.manifest\((\{[\s\S]*\})\);\n$/;

export function parseManifest(text) {
  const m = STATEMENT.exec(text);
  if (!m) throw new Error('manifest: not exactly one Dream.i18n.manifest({...}); statement and one final newline');
  try { return JSON.parse(m[1]); } catch (e) { throw new Error('manifest: the argument is not strict JSON (' + e.message + ')'); }
}

// A language file is exactly one statement and one final newline: Dream.lang("<code>", { ...strict JSON... }); returns { code, texts }.
const LANG_STATEMENT = /^Dream\.lang\("([^"]+)", (\{[\s\S]*\})\);\n$/;

export function parseLangFile(text) {
  const m = LANG_STATEMENT.exec(text);
  if (!m) throw new Error('language file: not exactly one Dream.lang("<code>", {...}); statement and one final newline');
  try { return { code: m[1], texts: JSON.parse(m[2]) }; } catch (e) { throw new Error('language file: the object is not strict JSON (' + e.message + ')'); }
}

// form is 'source' (every row of the table, each with "o": 1 offered or 0 an Entwurf, dev: true) or 'published'
// (German and the offered rows, no "o", dev: false). Returns the list of problems; an empty list means valid (7.6, "Valid").
export function manifestProblems(m, form) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['the manifest is not an object'];
  const bad = [];
  if (m.v !== 1) bad.push('v is not the number 1');
  if (typeof m.dev !== 'boolean') bad.push('dev is not true or false');
  else if (m.dev !== (form === 'source')) bad.push(`dev must be ${form === 'source'} in the ${form} form`);
  if (!Array.isArray(m.langs) || !m.langs.length) return [...bad, 'langs is not a non-empty array'];
  const seen = new Set();
  for (const [i, l] of m.langs.entries()) {
    const at = `langs[${i}]`;
    if (!l || typeof l !== 'object') { bad.push(`${at} is not an object`); continue; }
    for (const k of ['c', 'n', 's']) if (typeof l[k] !== 'string' || !l[k]) bad.push(`${at}.${k} is not a non-empty string`);
    if (l.d !== 'ltr' && l.d !== 'rtl') bad.push(`${at}.d is neither "ltr" nor "rtl"`);
    if (typeof l.c === 'string' && l.c) { if (seen.has(l.c)) bad.push(`the code ${l.c} occurs twice`); seen.add(l.c); }
    if (form === 'source' ? l.o !== 1 && l.o !== 0 : 'o' in l) bad.push(form === 'source' ? `${at}.o is neither 1 nor 0` : `${at}.o must not exist in the published form`);
  }
  if (!seen.has('de')) bad.push('German (de) is missing');
  return bad;
}

// The published form, as the text of the file: German and the offered rows in table order, without "o", dev false, on one line.
export function publishedManifest(source) {
  const bad = manifestProblems(source, 'source');
  if (bad.length) throw new Error('manifest: the source form is invalid: ' + bad.join('; '));
  const langs = source.langs.filter(l => l.c === 'de' || l.o === 1).map(({ c, n, d, s }) => ({ c, n, d, s }));
  return 'Dream.i18n.manifest(' + JSON.stringify({ v: 1, dev: false, langs }) + ');\n';
}
