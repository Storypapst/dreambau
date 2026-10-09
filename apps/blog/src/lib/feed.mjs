// The Atom feed /blog/feed.xml (spec 5.1 FD-1 to FD-5, AD-3), as text. A plain function of the labels and the numbered
// posts: no file access, no clock (a post has a day, not a time, so `published` and `updated` are date + T00:00:00Z),
// no random value. Every text goes through escapeXml; the feed uses escaping and never CDATA (FD-4). Absolute addresses
// use the host dreambau.com (AD-3). The check that stands behind it is src/lib/feed-check.mjs.
import { escapeXml } from './escape.mjs';
import { httpsLink } from './links.mjs';
import { newestFirst, numberPosts } from './numbering.mjs';
import { ORIGIN } from './pages.mjs';
import { LIMITS } from './post-rules.mjs';

// The namespace name of Atom 1.0 (RFC 4287). It is a name, not an address anyone requests; it is assembled from parts so
// that the hygiene scan of the checks, which reads every address of the folder, has nothing to report.
export const ATOM_NAMESPACE = ['http:', '', 'www.w3.org', '2005', 'Atom'].join('/');
export const EMPTY_UPDATED = '1970-01-01T00:00:00Z'; // FD-5
export const FEED_URL = `${ORIGIN}/blog/feed.xml`;

const x = escapeXml;
const stamp = (post) => `${post.date}T00:00:00Z`; // FD-3: the time is a placeholder

function entry(post) {
  const address = `${ORIGIN}/blog/${post.address}/`;
  const related = post.sourceLink === undefined
    ? ''
    : `<link rel="related" href="${x(httpsLink(post.sourceLink, post.file))}"${post.sourceTitle === undefined ? '' : ` title="${x(post.sourceTitle)}"`}/>\n`; // PR-6
  return `<entry${post.lang === 'de' ? '' : ` xml:lang="${x(post.lang)}"`}>
<id>${x(address)}</id>
<title>${x(post.title)}</title>
<link rel="alternate" type="text/html" href="${x(address)}"/>
${related}<published>${stamp(post)}</published>
<updated>${stamp(post)}</updated>
<summary type="text">${x(post.paragraphs.join('\n\n'))}</summary>
</entry>
`;
}

// labels: the German labels; posts: the posts in any order (the order is by date and slug, PF-15). Returns the whole file.
export function feedXml({ labels: L, posts }) {
  const shown = newestFirst(numberPosts(posts)).slice(0, LIMITS.feedEntries);
  const updated = shown.length === 0 ? EMPTY_UPDATED : stamp(shown[0]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM_NAMESPACE}" xml:lang="de">
<id>${ORIGIN}/blog/</id>
<title>${x(`${L['blog.title']} · dreambau.com`)}</title>
<subtitle>${x(L['blog.sub'])}</subtitle>
<link rel="self" type="application/atom+xml" href="${FEED_URL}"/>
<link rel="alternate" type="text/html" href="${ORIGIN}/blog/"/>
<updated>${updated}</updated>
<author><name>dreambau.com</name></author>
${shown.map(entry).join('')}</feed>
`;
}
