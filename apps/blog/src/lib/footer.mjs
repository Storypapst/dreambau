// The footer of every Blog page (spec 5.10 NV-1, NV-2). footer.json says which of the two legal items exist: null while
// the page is pending, or a root-relative address once it exists. The build renders a null item as the pending span that
// /referenzen/ shows and lists it in footerPending of blog.json; the publisher refuses while one is listed (slice S8).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './findings.mjs';

export const FOOTER_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'footer.json');
export const FOOTER_KEYS = Object.freeze(['impressum', 'datenschutz']);
const ADDRESS = /^\/(?!\/)[^\s\\\u0000-\u001f\u007f]*$/u;

// Problems of the parsed file as { rule, where, what }.
export function footerProblems(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [{ rule: 'NV-2', where: 'footer.json', what: 'the file must be an object with the items impressum and datenschutz' }];
  const found = [];
  for (const key of FOOTER_KEYS) {
    if (!(key in value)) found.push({ rule: 'NV-2', where: key, what: 'the item is missing; it is null while the page is pending' });
    else if (value[key] !== null && !(typeof value[key] === 'string' && ADDRESS.test(value[key]) && value[key].length <= 200)) found.push({ rule: 'NV-2', where: key, what: `must be null or a root-relative address that starts with a single slash, got ${JSON.stringify(value[key])}` });
  }
  for (const key of Object.keys(value)) if (!FOOTER_KEYS.includes(key)) found.push({ rule: 'NV-2', where: key, what: 'unknown item; the file holds impressum and datenschutz only' });
  return found;
}

export const pendingKeys = (footer) => FOOTER_KEYS.filter((key) => footer[key] === null);

// Reads and checks the file; a bad file stops the build with its FAIL lines.
export function loadFooter(file = FOOTER_FILE) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`FAIL NV-2 footer.json: ${error.message}`);
  }
  const problems = footerProblems(value).map((problem) => fail(problem.rule, problem.where === 'footer.json' ? 'footer.json' : `footer.json:${problem.where}`, problem.what));
  if (problems.length > 0) throw new Error(problems.map((p) => `${p.level} ${p.rule} ${p.where}: ${p.what}`).join('\n'));
  return value;
}
