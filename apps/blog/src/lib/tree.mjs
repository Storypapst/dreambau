// The posts of a whole tree and the checks that need a second tree: a copy of origin/main (spec 5.1 AD-6, AD-7; 5.2 PF-5,
// PF-13). A tree is `<dir>/<year>/<slug>.md` plus `<dir>/removed.txt` (the tombstones). It is read from a directory or
// from a git ref; the checks compare two of them (`head`, the change, and `base`, origin/main) and report every finding.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { at, fail, warn } from './findings.mjs';
import { parsePostText } from './frontmatter.mjs';
import { checkPostText } from './post-file.mjs';
import { dateProblems } from './post-rules.mjs';
import { nextFreeSlug } from './slug.mjs';

const POST = /^(\d{4})\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const TOMBSTONE = /^(\d{4})\/([a-z0-9]+(?:-[a-z0-9]+)*) (\d{4}-\d{2}-\d{2})$/;

// removed.txt: one line `<year>/<slug> <YYYY-MM-DD>` per removed post (AD-7). Returns the tombstones and the bad lines.
export function parseTombstones(text) {
  const tombstones = new Map();
  const problems = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, index) => {
    if (line === '') return;
    const match = TOMBSTONE.exec(line);
    if (!match || dateProblems(match[3]).length > 0) problems.push({ line: index + 1, what: `expected "<year>/<slug> <YYYY-MM-DD>" (a real date), got ${JSON.stringify(line)}` });
    else tombstones.set(`${match[1]}/${match[2]}`, match[3]);
  });
  return { tombstones, problems };
}

const decoder = new TextDecoder('utf-8', { fatal: true });
function decode(buffer) {
  try {
    return decoder.decode(buffer);
  } catch {
    return null; // not UTF-8: the file rules report it (PF-2)
  }
}

function treeFrom(entries, tombstoneText) {
  const posts = new Map();
  for (const [relative, buffer] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const match = POST.exec(relative);
    if (match) posts.set(`${match[1]}/${match[2]}`, { relative, year: match[1], slug: match[2], text: decode(buffer) });
  }
  const parsed = tombstoneText === null ? { tombstones: new Map(), problems: [] } : parseTombstones(tombstoneText);
  return { posts, tombstones: parsed.tombstones, tombstoneProblems: parsed.problems, hasRemovedFile: tombstoneText !== null };
}

export function loadTreeFromDir(dir) {
  const entries = [];
  if (fs.existsSync(dir)) {
    for (const year of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
      for (const file of fs.readdirSync(path.join(dir, year.name), { withFileTypes: true })) {
        if (file.isFile() && file.name.endsWith('.md')) entries.push([`${year.name}/${file.name}`, fs.readFileSync(path.join(dir, year.name, file.name))]);
      }
    }
  }
  const removed = path.join(dir, 'removed.txt');
  return treeFrom(entries, fs.existsSync(removed) ? fs.readFileSync(removed, 'utf8') : null);
}

// The tree below `prefix` as it is at `ref` (for example refs/remotes/origin/main and apps/blog/posts). A prefix that is
// not in the ref is an empty tree (today main has no posts folder); a ref that does not exist is an error: the caller
// runs `git fetch origin main` first (BD-5).
export function loadTreeFromGit({ ref, prefix, cwd }) {
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  if (git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`).status !== 0) throw new Error(`cannot read ${ref}: there is no such ref here; run "git fetch origin main" first`);
  const listing = git('ls-tree', '-r', '--name-only', '-z', ref, '--', `${prefix}/`);
  const names = listing.status === 0 ? listing.stdout.toString('utf8').split('\0').filter(Boolean) : [];
  const entries = [];
  let removed = null;
  for (const name of names) {
    const relative = name.slice(prefix.length + 1);
    const content = git('show', `${ref}:${name}`);
    if (content.status !== 0) throw new Error(`cannot read ${name} at ${ref}`);
    if (relative === 'removed.txt') removed = content.stdout.toString('utf8');
    else if (POST.test(relative)) entries.push([relative, content.stdout]);
  }
  return treeFrom(entries, removed);
}

export const isFixtureTree = (dir) => /(^|[\\/])tests[\\/]fixtures([\\/]|$)/.test(path.resolve(dir));

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lineOf = (where) => { const match = /:(\d+)$/.exec(where); return match ? Number(match[1]) : 0; };
const fileOf = (where) => where.replace(/:\d+$/, '');
export const sortFindings = (findings) => [...findings].sort((a, b) => compare(fileOf(a.where), fileOf(b.where)) || lineOf(a.where) - lineOf(b.where) || compare(a.rule, b.rule));

function fieldsOf(post) {
  return post.text === null ? {} : parsePostText(post.text, post.relative).fields;
}

// The checks of a change against a copy of origin/main. `displayDir` is how the posts folder is written in the lines.
export function checkAgainstBase({ head, base, displayDir = 'posts' }) {
  const findings = [];
  const where = (relative, line) => at(`${displayDir}/${relative}`, line);
  const tombstoneProblems = (tree, name) => tree.tombstoneProblems.forEach((item) => findings.push(fail('AD-7', at(`${displayDir}/removed.txt`, item.line), `${name}: ${item.what}`)));
  tombstoneProblems(head, 'removed.txt');

  // AD-7: a tombstone line is never taken out, and no post file stands at a tombstoned address.
  for (const address of base.tombstones.keys()) {
    if (!head.tombstones.has(address)) findings.push(fail('AD-7', `${displayDir}/removed.txt`, `the line for ${address} is missing; a removed address is never reused, so its line stays`));
  }
  const tombstoned = (address) => head.tombstones.has(address) || base.tombstones.has(address);
  for (const [address, post] of head.posts) {
    if (tombstoned(address)) findings.push(fail('AD-7', where(post.relative), `the address ${address} is in removed.txt and may never be used again`));
  }

  // AD-6: an address that exists on origin/main stays, unless it is listed in removed.txt.
  for (const [address, basePost] of base.posts) {
    const headPost = head.posts.get(address);
    if (!headPost) {
      if (!head.tombstones.has(address)) findings.push(fail('AD-6', where(basePost.relative), `the post ${address} exists on origin/main but is missing here (deleted or renamed); the address of a published post must not change. If it is to be removed, list it in posts/removed.txt`));
      continue;
    }
    const before = fieldsOf(basePost).date;
    const after = fieldsOf(headPost).date;
    if (before && after && before.value !== after.value && dateProblems(before.value).length === 0 && dateProblems(after.value).length === 0) {
      if (before.value.slice(0, 4) !== after.value.slice(0, 4)) findings.push(fail('AD-6', where(headPost.relative, after.line), `the date moved from ${before.value} to ${after.value}, into another year; the address of a published post must not change`));
      else findings.push(warn('AD-6', where(headPost.relative, after.line), `the date changed from ${before.value} to ${after.value}; the published value of the feed changes`));
    }
  }

  // The newest post on origin/main by (date, slug).
  let newest = null;
  for (const [address, post] of base.posts) {
    const date = fieldsOf(post).date;
    if (!date || dateProblems(date.value).length > 0) continue;
    if (newest === null || compare(date.value, newest.date) > 0 || (date.value === newest.date && compare(post.slug, newest.slug) > 0)) newest = { date: date.value, slug: post.slug, address };
  }

  // PF-5 and PF-13 hold for a post that is new against origin/main only.
  const taken = (address) => base.posts.has(address) || tombstoned(address);
  for (const [address, post] of head.posts) {
    if (base.posts.has(address)) continue;
    const fields = fieldsOf(post);
    if (fields.title && fields.title.value !== '') {
      const expected = nextFreeSlug(fields.title.value, post.year, taken);
      if (expected !== '' && expected !== post.slug) findings.push(fail('PF-13', where(post.relative), `the file name is ${post.slug} but the slug of the title is ${expected}${/-\d+$/.test(expected) && !/-\d+$/.test(fields.title.value) ? ' (the plain slug is taken, so the first free suffix)' : ''}; a new post must be named by its title`));
    }
    const date = fields.date;
    if (newest && date && dateProblems(date.value).length === 0 && (compare(date.value, newest.date) < 0 || (date.value === newest.date && compare(post.slug, newest.slug) < 0))) {
      findings.push(fail('PF-5', where(post.relative, date.line), `this new post (${date.value}, ${post.slug}) sorts before the newest post on origin/main (${newest.address}, ${newest.date}); a new post must come after it, or the numbers of published posts change. Set date to ${newest.date} or later`));
    }
  }
  return findings;
}

// Everything for a pull request: the file rules for every post of the head, then the checks against the base.
export function checkTree({ head, base, headDir, displayDir = 'posts', publish = false, now = new Date() }) {
  const findings = [];
  const fixture = isFixtureTree(headDir);
  for (const post of head.posts.values()) {
    const file = `${displayDir}/${post.relative}`;
    if (post.text === null) { findings.push(fail('PF-2', file, 'the file is not valid UTF-8')); continue; }
    const readImage = (name) => {
      const full = path.join(headDir, post.year, name);
      return /^[A-Za-z0-9._-]+$/.test(name) && fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full) : null;
    };
    findings.push(...checkPostText(post.text, { file, publish, now, fixture, readImage }).findings);
  }
  findings.push(...checkAgainstBase({ head, base, displayDir }));
  return sortFindings(findings);
}

