// The pages of the Blog as strings (spec 5.5 the list, 5.6 the post, 5.10 the footer): plain functions of the labels, the
// footer and the numbered posts, no file access, no clock. Every text of a post goes through esc() for its place
// (PR-5); every fixed text is a key of labels.de.json (LG-3) except the few words listed in CHROME.
import { esc } from './escape.mjs';
import { fill } from './labels.mjs';
import { displayHost, httpsLink } from './links.mjs';
import { formatNumber, newestFirst } from './numbering.mjs';
import { descriptionOf, previewOf } from './preview.mjs';

export const ORIGIN = 'https://dreambau.com'; // AD-3: absolute addresses use this host; www has no Blog

// Words that are not keys of the table of spec 5.3 and are written in German here (LG-6, LG-7): the path of the log, the
// words of the skip link, and the footer of /referenzen/ (the legal.* keys do not exist yet).
export const CHROME = Object.freeze({
  path: '~/blog/',
  skip: 'Zum Inhalt springen',
  impressum: 'Impressum', impressumPending: 'Impressum · Angaben noch offen',
  datenschutz: 'Datenschutz', datenschutzPending: 'Datenschutz · Freigabe noch offen',
  home: 'Startseite', referenzen: 'Referenzen', teamwork: 'Teamwork', glossar: 'Glossar', kontakt: 'Kontakt',
});

const CHEVRON = '<svg class="ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RSS = '<svg class="ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 3.5a9.5 9.5 0 0 1 9.5 9.5M3 7.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="3.8" cy="12.2" r="1.3" fill="currentColor"/></svg>';

const langAttr = (post) => (post.lang === 'de' ? '' : ` lang="${esc(post.lang)}"`);
const addressOf = (post) => `/blog/${post.address}/`;

// ---- the parts every page shares ----

function head({ title, extra = '', script = false }) {
  return `<!doctype html>
<html lang="de" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
${extra}<link rel="icon" href="data:,">
<link rel="stylesheet" href="/blog/blog.css">
${script ? '<script src="/blog/blog.js" defer></script>\n' : ''}</head>
<body>
<a class="skip" href="#main">${esc(CHROME.skip)}</a>
`;
}

// NV-3: the header's navigation is the pill Startseite and nothing else; the feed link is beside the title (LI-2).
function header(L, { heading }) {
  const title = `${esc(L['blog.title'])}<span class="caret" aria-hidden="true"></span>`;
  return `<header class="top">
<a class="pill home" href="/">${CHEVRON}<span>${esc(L['blog.home'])}</span></a>
${heading ? `<h1 class="ttl">${title}</h1>` : `<p class="ttl">${title}</p>`}
<p class="kicker">${esc(L['blog.sub'])}</p>
<a class="pill feed" href="/blog/feed.xml" title="${esc(L['blog.feed.title'])}">${RSS}<span>${esc(L['blog.feed'])}</span></a>
</header>
`;
}

// NV-1: the items of the footer of /referenzen/ with Referenzen after Startseite. A null item of footer.json is the same
// non-link span that /referenzen/ shows (NV-2).
function footer(L, footerItems) {
  const item = (key) => (footerItems[key] === null
    ? `<span class="pending" lang="de" dir="ltr">${esc(CHROME[`${key}Pending`])}</span>`
    : `<a href="${esc(footerItems[key])}">${esc(CHROME[key])}</a>`);
  const link = (href, text) => `<a href="${href}">${esc(text)}</a>`;
  return `<footer class="site">
<nav class="foot" aria-label="${esc(L['blog.nav.label'])}">${item('impressum')}<i aria-hidden="true">·</i>${item('datenschutz')}${link('/', CHROME.home)}${link('/referenzen/', CHROME.referenzen)}${link('/teamwork/', CHROME.teamwork)}${link('/glossar/', CHROME.glossar)}${link('mailto:info@dreambau.com', CHROME.kontakt)}</nav>
</footer>
</body>
</html>
`;
}

// LI-5: marks are words, never colour alone. The "Quelle" mark has a title; "EN" has a title and the same words as hidden text.
const sourceMark = (L) => `<span class="mk src" title="${esc(L['blog.source.mark.title'])}">${esc(L['blog.source'])}</span>`;
const englishMark = (L, { described = true } = {}) => `<span class="en"${described ? ` title="${esc(L['blog.lang.en.title'])}"` : ''}><span aria-hidden="true">EN</span>${described ? `<span class="sr">${esc(L['blog.lang.en.title'])}</span>` : ''}</span>`;
const marksOf = (L, post) => `${post.sourceLink === undefined ? '' : sourceMark(L)}${post.lang === 'en' ? englishMark(L) : ''}`;

// ---- the list (LI-1 to LI-8) ----

function row(L, post) {
  const marks = marksOf(L, post);
  return `<li class="row">
<span class="no" aria-hidden="true">${formatNumber(post.number)}</span>
<time class="dt" datetime="${esc(post.date)}">${esc(post.date)}</time>
<h2 class="tt"><a href="${esc(addressOf(post))}"${langAttr(post)}>${esc(post.title)}</a></h2>
${marks === '' ? '' : `<span class="mks">${marks}</span>\n`}<p class="ex"${langAttr(post)}>${esc(previewOf(post.paragraphs[0]))}</p>
</li>`;
}

// LI-6: one legend, drawn twice; the phone shows the native <details>, the desktop the open sheet, and the other one is
// display: none, so only one of them is in the accessibility tree at any width.
function legend(L) {
  const entries = `<ul class="legend-list"><li><span class="mk src" aria-hidden="true">${esc(L['blog.source'])}</span><span>${esc(L['blog.legend.src'])}</span></li><li>${englishMark(L, { described: false })}<span>${esc(L['blog.legend.en'])}</span></li></ul>`;
  return `<aside class="sheet legend" aria-labelledby="legend-h">
<h2 class="shd" id="legend-h">${esc(L['blog.legend'])}</h2>
${entries}
</aside>
<details class="legend-d">
<summary>${esc(L['blog.legend'])}</summary>
${entries}
</details>
`;
}

// LI-7: the empty list is two comment lines in the log style (and a caret); the feed link is in the header.
function emptyLog(L) {
  return `<div class="cols solo">
<div class="logp">
<p class="logtop" aria-hidden="true">${esc(CHROME.path)}</p>
<div class="elog" role="group" aria-labelledby="empty-h">
<div class="ln"><h2 class="tx cmt" id="empty-h">${esc(L['blog.empty.title'])}</h2></div>
<div class="ln"><p class="tx cmt">${esc(L['blog.empty.text'])}</p></div>
<div class="ln"><span class="tx cur" aria-hidden="true"></span></div>
</div>
</div>
</div>
`;
}

export function listPage({ labels: L, footer: footerItems, posts }) {
  const rows = newestFirst(posts).map((post) => row(L, post));
  const body = rows.length === 0 ? emptyLog(L) : `<div class="cols">
<div class="logp">
<p class="logtop" aria-hidden="true">${esc(CHROME.path)}</p>
<ol class="log" reversed role="list" aria-label="${esc(L['blog.list.label'])}">
${rows.join('\n')}
</ol>
</div>
${legend(L)}</div>
`;
  return `${head({ title: `${L['blog.title']} · dreambau.com`, extra: `<link rel="canonical" href="${ORIGIN}/blog/">\n` })}${header(L, { heading: true })}<main id="main">
${body}</main>
${footer(L, footerItems)}`;
}

// ---- the real 404 (ER-1) ----

// The page nginx sends with status 404 for every missing path under /blog/ and for a folder without an index (AD-5). It
// is served for any address, so it holds root-relative addresses only, no canonical link and no script; noindex keeps it
// out of a search index. The Blog's name is a paragraph here, because the one <h1> of the page is the error.
export function errorPage({ labels: L, footer: footerItems }) {
  const extra = '<meta name="robots" content="noindex">\n';
  return `${head({ title: `${L['blog.error.title']} · ${L['blog.title']} · dreambau.com`, extra })}${header(L, { heading: false })}<main id="main">
<div class="cols solo">
<div class="logp">
<p class="logtop" aria-hidden="true">${esc(CHROME.path)}</p>
<div class="elog" role="group" aria-labelledby="error-h">
<div class="ln"><h1 class="tx cmt" id="error-h">${esc(L['blog.error.title'])}</h1></div>
<div class="ln"><p class="tx cmt">${esc(L['blog.error.text'])}</p></div>
<div class="ln"><span class="tx cur" aria-hidden="true"></span></div>
</div>
</div>
</div>
</main>
<div class="dock"><a class="pill pri back" href="/blog/">${CHEVRON}<span>${esc(L['blog.back'])}</span></a></div>
${footer(L, footerItems)}`;
}

// ---- a post (PO-1 to PO-10) ----

function postHead(post) {
  const description = descriptionOf(post.paragraphs);
  const canonical = `${ORIGIN}${addressOf(post)}`;
  const image = post.imageInfo ? `<meta property="og:image" content="${ORIGIN}${addressOf(post)}image.${post.imageInfo.format}">\n` : '';
  return `<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(post.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonical)}">
${image}`;
}

function neighbour(L, key, other) {
  return `<a href="${esc(addressOf(other))}"><small lang="de">${esc(L[key])}</small><span${langAttr(other)}>${esc(other.title)}</span></a>`;
}

export function postPage({ labels: L, footer: footerItems, post, older, newer }) {
  const own = langAttr(post);
  const german = post.lang === 'de' ? '' : ' lang="de"'; // LG-2: the labels around an English post stay German
  const lines = [];
  const line = (content) => `<div class="ln">${content}</div>`;

  lines.push(line(`<p class="tx pmeta"><span class="sr"${german}>${esc(L['blog.date'])} </span><time datetime="${esc(post.date)}">${esc(post.date)}</time>${marksOf(L, post) === '' ? '' : `<span class="mks"${german}>${marksOf(L, post)}</span>`}</p>`));
  lines.push(line(`<h1 class="tx ptitle"${own}>${esc(post.title)}</h1>`));
  if (post.quote !== undefined) lines.push(line(`<blockquote class="tx qt"${own}><p>${esc(post.quote)}</p><footer>${esc(post.quoteSource)}</footer></blockquote>`));
  if (post.imageInfo) {
    const { width, height, format } = post.imageInfo;
    lines.push(`<figure class="pic"><img src="image.${format}" width="${width}" height="${height}" alt="${esc(post.imageAlt)}" loading="eager" decoding="async"></figure>`);
  }
  lines.push(`<section class="why" aria-labelledby="why-h">
<h2 class="sech" id="why-h"${german}>${esc(L['blog.why'])}</h2>
${post.paragraphs.map((paragraph) => line(`<p class="tx prose"${own}>${esc(paragraph)}</p>`)).join('\n')}
</section>`);
  if (post.sourceLink !== undefined) {
    const href = httpsLink(post.sourceLink, post.file); // PR-6
    const host = displayHost(href);
    const titled = post.sourceTitle !== undefined;
    lines.push(`<section class="src" aria-labelledby="src-h">
<h2 class="sech" id="src-h"${german}>${esc(L['blog.source'])}</h2>
${line(`<div class="tx srcbox"><a class="sk" href="${esc(href)}" rel="noreferrer noopener"${own}>${esc(titled ? post.sourceTitle : host)}</a>${titled ? `<p class="sw">${esc(host)}</p>` : ''}<p class="sn"${german}>${esc(fill(L['blog.source.leads'], { site: host }))}</p></div>`)}
</section>`);
  }
  if (older || newer) {
    lines.push(`<nav class="pn" aria-label="${esc(L['blog.post.nav'])}"${german}>${newer ? neighbour(L, 'blog.next.newer', newer) : ''}${older ? neighbour(L, 'blog.next.older', older) : ''}</nav>`);
  }
  lines.push(`<aside class="facts" aria-labelledby="facts-h"${german}>
<h2 class="shd" id="facts-h">${esc(L['blog.facts'])}</h2>
<dl><div><dt>${esc(L['blog.language'])}</dt><dd>${esc(L[post.lang === 'en' ? 'blog.lang.en' : 'blog.lang.de'])}</dd></div><div><dt>${esc(L['blog.address'])}</dt><dd>${esc(addressOf(post))}</dd></div></dl>
</aside>`);

  return `${head({ title: `${post.title} · ${L['blog.title']} · dreambau.com`, extra: postHead(post), script: true })}${header(L, { heading: false })}<main id="main">
<article class="post" lang="${esc(post.lang)}">
${lines.join('\n')}
</article>
</main>
<div class="dock"><a class="pill pri back" href="/blog/">${CHEVRON}<span>${esc(L['blog.back'])}</span></a></div>
${footer(L, footerItems)}`;
}
