// The scans of the static checks (rows C5, C6 and C7). Each scan is a plain function over text, so that a check can
// prove it on made-up input before it trusts it on the real files.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE } from './paths.mjs';

// Every file below `dir` (symbolic links are not followed) as { name, bytes, text }, names relative with `/`.
export function filesBelow(dir, { skipFolders = [], skipFiles = [] } = {}) {
  const found = [];
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipFolders.includes(entry.name)) walk(full);
      } else if (entry.isFile() && !skipFiles.includes(entry.name)) {
        const buffer = fs.readFileSync(full);
        found.push({ name: path.relative(dir, full).split(path.sep).join('/'), bytes: buffer.length, binary: buffer.subarray(0, 8000).includes(0), text: buffer.toString('utf8') });
      }
    }
  };
  walk(dir);
  return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// The files of the page, site/*.
export function siteFiles() {
  return filesBelow(SITE);
}

// ---- Row C6: the static scan of the page files ----------------------------------------------------------------

const isHtml = (name) => /\.html?$/i.test(name);

// The bodies of all <script> elements of an HTML text.
function scriptBodies(html) {
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map((match) => match[1]);
}

// One entry per forbidden thing of row C6. `found(text)` is true when the text holds it; `html` limits a rule to HTML files.
export const PAGE_RULES = [
  { id: 'style-element', label: 'no <style> element', html: true, found: (text) => /<style[\s>]/i.test(text) },
  // In HTML an attribute may be written `style = "..."`; in a script or style sheet only the plain `style=` is meant.
  { id: 'style-attribute', label: 'no style= attribute', found: (text, name) => (isHtml(name) ? /\sstyle\s*=/i.test(text) : /\bstyle=/i.test(text)) },
  { id: 'script-body', label: 'no <script> with a body', html: true, found: (text) => scriptBodies(text).some((body) => body.trim() !== '') },
  { id: 'eval', label: 'no eval(', found: (text) => /\beval\s*\(/.test(text) },
  { id: 'new-function', label: 'no new Function', found: (text) => /\bnew\s+Function\b/.test(text) },
  { id: 'document-write', label: 'no document.write', found: (text) => /\bdocument\s*\.\s*write(?:ln)?\s*\(/.test(text) },
  // An address is http: or https: followed by a slash, a letter or a digit; the quoted protocol name 'https:' is none.
  { id: 'address', label: 'no http: or https: address', found: (text) => /\bhttps?:(?=[\/A-Za-z0-9])/i.test(text) },
];

// Which rule is broken in which file, for a list of { name, text, binary }.
export function pageProblems(files) {
  const problems = [];
  for (const file of files) {
    if (file.binary) continue;
    for (const rule of PAGE_RULES) {
      if (rule.html && !isHtml(file.name)) continue;
      if (rule.found(file.text, file.name)) problems.push({ name: file.name, rule: rule.id });
    }
  }
  return problems;
}

// ---- Row C5: names and secrets in apps/teamwork -----------------------------------------------------------------

const EXAMPLE_LIST_NAME = 'programs.example.json';
const ONLY_EMAIL = 'info@dreambau.com';
const invented = (host) => host.endsWith('.example.test') || host === '127.0.0.1';
const allowedInList = invented;
const allowedElsewhere = (host) => invented(host) || ['example.test', 'dreambau.com', 'localhost'].includes(host);

// Everything in the folder except the lock file and installed packages (they carry integrity strings and
// package-server hosts), as { name, bytes, binary, text }.
export function teamworkFiles() {
  return filesBelow(ROOT, { skipFolders: ['node_modules', '.git'], skipFiles: ['package-lock.json'] });
}

// The hosts of all addresses (a scheme, two slashes and a host) of a text. A placeholder such as ${host} is no host; a user name,
// a port and a full stop at the end of a sentence are not part of one.
export function hostsIn(text) {
  const hosts = [];
  for (const match of text.matchAll(/\b[A-Za-z][A-Za-z0-9+.-]*:\/\/([^\/\s"'`?#\\<>()\[\]{}|^]+)/g)) {
    const authority = match[1];
    const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d*$/, '').replace(/[.,;]+$/, '');
    if (/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host)) hosts.push(host.toLowerCase());
  }
  return hosts;
}

export function emailsIn(text) {
  return [...text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)].map((match) => match[0]);
}

// Gap G3: "base64" is a run of 32 or more characters of [A-Za-z0-9+/=] that holds a digit, a capital and a small letter
// (a server path or a hex hash is none).
export function keyLikeIn(text) {
  return [...text.matchAll(/[A-Za-z0-9+\/=]{32,}/g)].map((match) => match[0]).filter((run) => /\d/.test(run) && /[A-Z]/.test(run) && /[a-z]/.test(run));
}

// What breaks row C5 in a list of { name, text, binary }: { name, rule: 'host' | 'email' | 'key', value }.
// A key is shown shortened so that the scan never prints a secret in full.
export function secretProblems(files) {
  const problems = [];
  for (const file of files) {
    if (file.binary) continue;
    const allowed = file.name === EXAMPLE_LIST_NAME ? allowedInList : allowedElsewhere;
    for (const host of hostsIn(file.text)) if (!allowed(host)) problems.push({ name: file.name, rule: 'host', value: host });
    for (const email of emailsIn(file.text)) if (email.toLowerCase() !== ONLY_EMAIL) problems.push({ name: file.name, rule: 'email', value: email });
    for (const run of keyLikeIn(file.text)) problems.push({ name: file.name, rule: 'key', value: `${run.slice(0, 4)}... (${run.length} characters)` });
  }
  return problems;
}
