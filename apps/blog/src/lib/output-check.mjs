// The check of the output tree (spec 5.1 AD-1, AD-3, 7.2 shapes, 5.1 DL-4; verification row V16): the files of a build's
// public/ have exactly the shapes of spec 7.2 and no other, no name begins with a dot, every post folder that holds an
// image also holds the page of its post, the files that every build has exist, and every absolute address in a head
// and in the feed uses https and the host dreambau.com (never www). Pure functions over { name, bytes } entries; the
// build calls checkOutput on what it is about to write, `tools/check-output.mjs` calls it on a directory.
import fs from 'node:fs';
import path from 'node:path';
import { feedAddresses } from './feed-check.mjs';
import { at, fail } from './findings.mjs';
import { ORIGIN } from './pages.mjs';
import { parseXml } from './xml.mjs';

const SITE_HOST = new URL(ORIGIN).host;
const FIXED = ['index.html', '404.html', 'feed.xml', 'blog.css', 'blog.js'];
const REQUIRED = ['blog.css', 'blog.js', 'feed.xml', 'index.html']; // 404.html is the slice of the real 404
const POST_FILE = /^(\d{4})\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(index\.html|image\.(?:webp|png))$/;
const SHAPES = 'not a file of the shapes of spec 7.2 (index.html, 404.html, feed.xml, blog.css, blog.js, <year>/<slug>/index.html, <year>/<slug>/image.webp or image.png)';
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Every file below dir as { name, bytes }, names relative with "/", sorted; a symbolic link or another kind of entry has
// bytes null (it is reported, never followed).
export function loadOutputDir(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const name = path.relative(dir, full).split(path.sep).join('/');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push({ name, bytes: fs.readFileSync(full) });
      else found.push({ name, bytes: null });
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found.sort((a, b) => compare(a.name, b.name));
}

// An absolute address in a head: https and the host dreambau.com. Returns the problem text or null.
function addressProblem(address) {
  if (address.startsWith('//')) return `the address ${address} must start with https://`;
  let url;
  try { url = new URL(address); } catch { return null; }
  if (url.protocol !== 'https:') return `the address ${address} must start with https://`;
  if (url.host !== SITE_HOST) return `the address ${address} must use the host ${SITE_HOST}, not ${url.host}`;
  return null;
}

// files: [{ name, bytes }]. Returns the findings, ordered by file name (then by line), `FAIL <rule> <name>[:line]: <what>`.
export function checkOutput(files) {
  const found = [];
  const add = (name, rule, line, what) => found.push({ name, line: line || 0, index: found.length, finding: fail(rule, at(name, line || undefined), what) });
  const names = new Set(files.map((entry) => entry.name));

  for (const entry of files) {
    const { name } = entry;
    const post = POST_FILE.exec(name);
    if (!FIXED.includes(name) && !post) add(name, 'AD-1', 0, SHAPES);
    if (name.split('/').some((segment) => segment.startsWith('.'))) add(name, 'DL-4', 0, 'a name below public/ must not begin with a dot');
    if (entry.bytes === null) { add(name, 'AD-1', 0, 'not a regular file'); continue; }
    if (post && post[3] !== 'index.html' && !names.has(`${post[1]}/${post[2]}/index.html`)) add(name, 'AD-1', 0, `the post ${post[1]}/${post[2]} has no index.html`);

    if (name.endsWith('.html')) {
      const text = entry.bytes.toString('utf8');
      const start = text.indexOf('<head>');
      const end = text.indexOf('</head>');
      if (start >= 0 && end > start) {
        const first = text.slice(0, start).split('\n').length;
        text.slice(start, end).split('\n').forEach((lineText, offset) => {
          for (const match of lineText.matchAll(/(?:href|content|src)="((?:https?:)?\/\/[^"]*)"/g)) {
            const problem = addressProblem(match[1]);
            if (problem) add(name, 'AD-3', first + offset, problem);
          }
        });
      }
    } else if (name === 'feed.xml') {
      const { root } = parseXml(entry.bytes.toString('utf8'));
      if (root) for (const [line, address] of feedAddresses(root)) {
        const problem = addressProblem(address);
        if (problem) add(name, 'AD-3', line, problem);
      }
    }
  }
  for (const name of REQUIRED) if (!names.has(name)) add(name, 'AD-1', 0, 'the build output has no such file');
  return found.sort((a, b) => compare(a.name, b.name) || a.line - b.line || a.index - b.index).map((item) => item.finding);
}
