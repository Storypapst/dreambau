// The slug of a title (spec 5.2 PF-13): lower case; ä ö ü ß become ae oe ue ss; other accents are removed (NFD); every
// run of other characters becomes one `-`; no leading or trailing `-`; at most 60 characters, cut at a `-`, or at
// exactly 60 characters when the first 60 hold no `-`. Returns '' when the title has no letter or digit.

export const SLUG_MAX = 60;
export const SLUG_MIN = 3;

const GERMAN = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };

function cutAt(slug, max) {
  if (slug.length <= max) return slug;
  // A dash right after the first `max` characters is a boundary too, so the head is one character longer.
  const dash = slug.slice(0, max + 1).lastIndexOf('-');
  // A cut that would leave fewer than three characters is not a slug (PF-1): then the word is cut at `max`.
  const cut = dash >= SLUG_MIN ? slug.slice(0, dash) : slug.slice(0, max);
  return cut.replace(/-+$/, '');
}

export function slugify(title, max = SLUG_MAX) {
  const flat = String(title).normalize('NFC').toLowerCase()
    .replace(/[äöüß]/g, (letter) => GERMAN[letter])
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cutAt(flat, max);
}

// The slug that a new post must have: the plain slug, or `<slug>-2`, `<slug>-3`, ... the first free one. `isTaken`
// answers for an address `<year>/<slug>` (it exists on origin/main or is in removed.txt). The suffix counts into the 60
// characters, so the base is cut shorter.
export function nextFreeSlug(title, year, isTaken) {
  const plain = slugify(title);
  if (plain === '' || !isTaken(`${year}/${plain}`)) return plain;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${slugify(title, SLUG_MAX - suffix.length)}${suffix}`;
    if (!isTaken(`${year}/${candidate}`)) return candidate;
  }
}
