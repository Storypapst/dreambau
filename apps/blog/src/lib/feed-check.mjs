// The offline feed validator (spec 5.1 FD-1 to FD-5, AD-3; Appendix D "S3 chooses one"). It needs no network and no
// dependency: the strict XML reader of xml.mjs for well-formedness and encoding, then the rules of the spec for the
// Atom 1.0 shape the Blog writes (RFC 4287: feed id, title, updated and author, entry id, title and updated) and for
// the exact values FD-2 and FD-3 give. Every failure is reported, not the first, as
// `FAIL <rule> <file>:<line>: <what>` sorted by line (BD-4); a file that is not well-formed gives that one fault, because
// nothing else in it can be trusted. The rule id is the id of the spec: FD-1 format, FD-2 feed level, FD-3 entries,
// FD-4 escaping, FD-5 the empty feed, AD-3 the host.
import { ATOM_NAMESPACE, EMPTY_UPDATED } from './feed.mjs';
import { at, fail } from './findings.mjs';
import { ORIGIN } from './pages.mjs';
import { LANGUAGES, LIMITS } from './post-rules.mjs';
import { parseXml } from './xml.mjs';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITE_HOST = new URL(ORIGIN).host;
const POST_PATH = /^\/blog\/\d{4}\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T00:00:00Z$/;
const FEED_CHILDREN = new Set(['id', 'title', 'subtitle', 'link', 'updated', 'author', 'entry']);
const ENTRY_CHILDREN = new Set(['id', 'title', 'link', 'published', 'updated', 'summary']);

function isRealDay(stamp) {
  const match = STAMP.exec(stamp);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// The addresses of the Blog itself in a parsed feed, as [line, address]: every <id> and the href of every link except a
// related link, which points at the source of a post and is rightly on another host (AD-3).
export function feedAddresses(root) {
  const found = [];
  const walk = (element) => {
    if (element.ns === ATOM_NAMESPACE && element.local === 'id') found.push([element.line, element.text()]);
    if (element.ns === ATOM_NAMESPACE && element.local === 'link' && element.attrs.get('rel') !== 'related' && element.attrs.has('href')) found.push([element.line, element.attrs.get('href')]);
    for (const child of element.elements()) walk(child);
  };
  walk(root);
  return found;
}

// text: the feed as a string. labels: the German labels (title and subtitle come from them). file: how the file is named
// in the lines. Returns the findings (an empty array for a good feed).
export function checkFeed(text, { labels, file = 'feed.xml' }) {
  const found = [];
  const add = (rule, line, what) => found.push({ line, finding: fail(rule, at(file, line), what) });
  const done = () => found.map((item, index) => ({ ...item, index })).sort((a, b) => a.line - b.line || a.index - b.index).map((item) => item.finding);

  const { root, error } = parseXml(text);
  if (error) {
    add(error.kind === 'escaping' ? 'FD-4' : 'FD-1', error.line, `not well-formed XML at column ${error.column}: ${error.what}`);
    return done();
  }
  if (!text.startsWith(`${DECLARATION}\n`)) add('FD-1', 1, `the file must start with ${DECLARATION}`);
  if (root.local !== 'feed' || root.ns !== ATOM_NAMESPACE) {
    add('FD-1', root.line, 'the root element must be <feed> in the Atom 1.0 namespace');
    return done();
  }

  const inAtom = (element, name) => element.elements().filter((child) => child.ns === ATOM_NAMESPACE && child.local === name);
  const unexpected = (element, allowed, rule, where) => {
    for (const child of element.elements()) {
      if (child.ns !== ATOM_NAMESPACE || !allowed.has(child.local)) add(rule, child.line, `unexpected element <${child.name}> in ${where}`);
    }
  };
  // exactly one child of that name; returns it (or null)
  const one = (element, name, rule, where) => {
    const all = inAtom(element, name);
    if (all.length === 0) add(rule, element.line, `${where} has no <${name}>`);
    else if (all.length > 1) add(rule, all[1].line, `${where} has more than one <${name}>`);
    return all[0] || null;
  };
  const mustBe = (rule, element, expected) => {
    if (element && element.text() !== expected) add(rule, element.line, `<${element.local}> is ${JSON.stringify(element.text())} but must be ${JSON.stringify(expected)}`);
  };
  const linkWith = (element, rel) => inAtom(element, 'link').filter((link) => link.attrs.get('rel') === rel);

  // ---- AD-3: every address of the Blog uses https and the host dreambau.com; a related link is the source, not the Blog ----
  for (const [line, address] of feedAddresses(root)) {
    let url;
    try { url = new URL(address); } catch { continue; } // an id that is no address is reported by FD-2 and FD-3
    if (url.protocol !== 'https:') add('AD-3', line, `the address ${address} must start with https://`);
    else if (url.host !== SITE_HOST) add('AD-3', line, `the address ${address} must use the host ${SITE_HOST}, not ${url.host}`);
  }

  // ---- FD-2: the feed level ----
  unexpected(root, FEED_CHILDREN, 'FD-2', 'the feed');
  if (root.attrs.get('xml:lang') !== 'de') add('FD-2', root.line, 'the feed must have xml:lang="de"');
  mustBe('FD-2', one(root, 'id', 'FD-2', 'the feed'), `${ORIGIN}/blog/`);
  mustBe('FD-2', one(root, 'title', 'FD-2', 'the feed'), `${labels['blog.title']} · dreambau.com`);
  const subtitle = one(root, 'subtitle', 'FD-2', 'the feed');
  if (subtitle && subtitle.text() !== labels['blog.sub']) add('FD-2', subtitle.line, `<subtitle> is ${JSON.stringify(subtitle.text())} but must be the German text of blog.sub: ${JSON.stringify(labels['blog.sub'])}`);
  const links = [['self', `${ORIGIN}/blog/feed.xml`], ['alternate', `${ORIGIN}/blog/`]];
  for (const [rel, expected] of links) {
    const matching = linkWith(root, rel);
    if (matching.length === 0) add('FD-2', root.line, `the feed has no rel="${rel}" link`);
    else if (matching[0].attrs.get('href') !== expected) add('FD-2', matching[0].line, `the rel="${rel}" link is ${JSON.stringify(matching[0].attrs.get('href'))} but must be ${JSON.stringify(expected)}`);
  }
  const author = one(root, 'author', 'FD-2', 'the feed');
  if (author) {
    const name = inAtom(author, 'name')[0];
    if (!name) add('FD-2', author.line, 'the author has no <name>');
    else if (name.text() !== 'dreambau.com') add('FD-2', name.line, `the author name is ${JSON.stringify(name.text())} but must be "dreambau.com"`);
  }

  // ---- FD-3: the entries ----
  const entries = inAtom(root, 'entry');
  if (entries.length > LIMITS.feedEntries) add('FD-3', entries[LIMITS.feedEntries].line, `the feed has ${entries.length} entries; at most ${LIMITS.feedEntries}`);
  const seen = new Map();
  let before = null; // { updated, id } of the entry before
  for (const entry of entries) {
    unexpected(entry, ENTRY_CHILDREN, 'FD-3', 'an entry');
    const id = one(entry, 'id', 'FD-3', 'the entry');
    const title = one(entry, 'title', 'FD-3', 'the entry');
    const published = one(entry, 'published', 'FD-3', 'the entry');
    const updated = one(entry, 'updated', 'FD-3', 'the entry');
    const summary = one(entry, 'summary', 'FD-3', 'the entry');

    if (title && title.text() === '') add('FD-3', title.line, '<title> is empty');
    if (id) {
      let url = null;
      try { url = new URL(id.text()); } catch { url = null; }
      if (url === null || url.search !== '' || url.hash !== '' || !POST_PATH.test(url.pathname)) {
        add('FD-3', id.line, `the id ${JSON.stringify(id.text())} is not a post address ${ORIGIN}/blog/<year>/<slug>/ (AD-1)`);
      }
      if (seen.has(id.text())) add('FD-3', id.line, `the id ${id.text()} is used by two entries (first at line ${seen.get(id.text())})`);
      else seen.set(id.text(), id.line);
    }
    const alternates = linkWith(entry, 'alternate');
    if (alternates.length === 0) add('FD-3', entry.line, 'the entry has no rel="alternate" link');
    else if (id && alternates[0].attrs.get('href') !== id.text()) add('FD-3', alternates[0].line, `the alternate link ${JSON.stringify(alternates[0].attrs.get('href'))} is not the id ${JSON.stringify(id.text())}`);
    const related = linkWith(entry, 'related');
    if (related.length > 1) add('FD-3', related[1].line, 'an entry has at most one rel="related" link');
    for (const link of related) {
      const href = link.attrs.get('href') || '';
      if (!href.startsWith('https://')) add('FD-3', link.line, `the related link ${JSON.stringify(href)} must start with https://`);
    }
    for (const link of inAtom(entry, 'link')) {
      const rel = link.attrs.get('rel');
      if (rel !== 'alternate' && rel !== 'related') add('FD-3', link.line, `unexpected link rel=${JSON.stringify(rel === undefined ? '' : rel)} in an entry`);
    }

    const lang = entry.attrs.get('xml:lang');
    if (lang === 'de') add('FD-3', entry.line, 'xml:lang on an entry is only written when the language is not de');
    else if (lang !== undefined && !LANGUAGES.includes(lang)) add('FD-3', entry.line, `xml:lang=${JSON.stringify(lang)} is not one of ${LANGUAGES.join(', ')}`);

    let valid = true;
    for (const element of [published, updated]) {
      if (element && !isRealDay(element.text())) { add('FD-3', element.line, `<${element.local}> is ${JSON.stringify(element.text())} but must be a day + T00:00:00Z`); valid = false; }
    }
    if (valid && published && updated && published.text() !== updated.text()) {
      add('FD-3', published.line, `<published> ${published.text()} and <updated> ${updated.text()} of an entry must be equal`);
    }

    if (summary) {
      if (summary.attrs.get('type') !== 'text') add('FD-3', summary.line, '<summary> must have type="text"');
      const body = summary.text();
      if (body === '') add('FD-3', summary.line, '<summary> is empty');
      else if (/\n{3,}/.test(body)) add('FD-3', summary.line, 'paragraphs in the summary must be separated by exactly one blank line');
    }

    // newest first: by day, and within a day by address, descending (the list's order, PF-15)
    if (updated && isRealDay(updated.text()) && id) {
      const now = { updated: updated.text(), id: id.text() };
      if (before) {
        if (now.updated > before.updated) add('FD-3', entry.line, `the entry is newer than the one before it (${now.updated} after ${before.updated}); entries must be newest first`);
        else if (now.updated === before.updated && now.id > before.id) add('FD-3', entry.line, `the entries of one day must be in descending order of their address (${now.id} must come before ${before.id})`);
      }
      before = now;
    }
  }

  const feedUpdated = one(root, 'updated', 'FD-2', 'the feed');
  if (feedUpdated) {
    if (entries.length === 0) {
      if (feedUpdated.text() !== EMPTY_UPDATED) add('FD-5', feedUpdated.line, `an empty feed must have <updated>${EMPTY_UPDATED}</updated>`);
    } else {
      const firstUpdated = inAtom(entries[0], 'updated')[0];
      if (firstUpdated && isRealDay(firstUpdated.text()) && feedUpdated.text() !== firstUpdated.text()) {
        add('FD-2', feedUpdated.line, `<updated> is ${feedUpdated.text()} but must be the newest entry's, ${firstUpdated.text()}`);
      }
    }
  }
  return done();
}
