// site: rules of the page files that no other check covers (ticket 1, acceptance "F1, F3, F7, F8, F14").
//   F1   title and <h1> read Teamwork (the rendered page is checked by C28; here the markup)
//   F3   the page is public: it has no login code
//   F8   no Programm and no Zone is special-cased in the script or the style sheet (every Kachel is made by the same code)
//   G5   a viewport meta tag, so that phone emulation sees the real width
//   X13  the robots meta tag matches the header of the page server
// The scans first prove themselves on made-up text: what they must flag, and look-alikes they must let pass.
import fs from 'node:fs';
import path from 'node:path';
import { check, same, run } from '../lib/check.mjs';
import { EXAMPLE_LIST, SITE } from '../lib/paths.mjs';

// Words that belong to a login. The page must not contain code for one (F3).
const LOGIN_WORDS = /\b(?:log[- ]?in|log[- ]?out|sign[- ]?in|anmeld\w*|abmeld\w*|passwor\w*|password\w*|credentials?|zugangsdaten|oauth|bearer|authori[sz]ation|session ?id)\b/i;

// A name or an id between quotes of a script (', " or `), or inside an attribute selector of the style sheet.
function specialCases(text, names) {
  return names.filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(['"\`])${escaped}\\1`).test(text) || new RegExp(`\\[data-(?:id|zone)\\s*[~|^$*]?=\\s*["']?${escaped}["']?\\]`).test(text);
  });
}

const list = JSON.parse(fs.readFileSync(EXAMPLE_LIST, 'utf8'));
const NAMES = [...new Set([...list.programs.flatMap((program) => [program.id, program.name]), ...list.zones.flatMap((zone) => [zone.id, zone.name])])];

await run(async () => {
  // ---- the scans prove themselves ----
  for (const sample of ['<button>Anmelden</button>', 'const user = login(name);', 'fetch(u, { headers: { Authorization: token } });', '<input type="password">', 'sign in', 'Log-in']) {
    check(`site the login scan flags ${JSON.stringify(sample)}`, LOGIN_WORDS.test(sample));
  }
  for (const sample of ['the blog entry', 'a dialog opens', 'logistics and the catalogue', 'const catalogue = loadData();']) {
    check(`site the login scan lets pass ${JSON.stringify(sample)}`, !LOGIN_WORDS.test(sample));
  }
  same('site the special-case scan flags quoted names and ids', specialCases('if (p.id === "aurora" || p.name == `Cobalt`) {}', ['aurora', 'Cobalt', 'dune']), ['aurora', 'Cobalt']);
  same('site the special-case scan flags attribute selectors of the style sheet', specialCases('[data-id="hazel"] { color: red }  [data-zone=nord] { color: blue }', ['hazel', 'nord', 'west']), ['hazel', 'nord']);
  same('site the special-case scan lets pass the same words in plain text and as parts of words', specialCases('// Aurora is only an example; a dune is sand; tarnish', ['Aurora', 'dune', 'tarn']), []);

  // ---- the page files ----
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(SITE, 'teamwork.js'), 'utf8');
  const style = fs.readFileSync(path.join(SITE, 'teamwork.css'), 'utf8');
  check('site F1 the title element reads Teamwork', /<title>Teamwork<\/title>/.test(html));
  check('site F1 the only <h1> reads Teamwork', (html.match(/<h1\b[^>]*>([^<]*)<\/h1>/g) || []).length === 1 && /<h1\b[^>]*>Teamwork<\/h1>/.test(html));
  check('site G5 index.html has a viewport meta tag with the device width', /<meta name="viewport" content="[^"]*width=device-width[^"]*">/.test(html));
  check('site X13 index.html has the robots meta tag noindex, nofollow', html.includes('<meta name="robots" content="noindex, nofollow">'));
  check('site A1 index.html declares the language German', /<html lang="de">/.test(html));
  for (const [name, text] of [['index.html', html], ['teamwork.js', script], ['teamwork.css', style]]) {
    const hits = [...text.matchAll(new RegExp(LOGIN_WORDS.source, 'gi'))].map((match) => match[0]);
    same(`site F3 ${name} has no login code`, hits, []);
  }
  same('site F8 teamwork.js special-cases no Programm and no Zone of the example list', specialCases(script, NAMES), []);
  same('site F8 teamwork.css special-cases no Programm and no Zone of the example list', specialCases(style, NAMES), []);
});
