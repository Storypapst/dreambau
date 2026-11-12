// Prototype of the map "Navigieren": the posts of one folder as places on mesas in a canyon. A prototype, not a slice of
// the spec: it writes to dist-proto/navigieren/ and is not part of the output of `npm run build` (the output check of the
// spec stays as it is). The posts go through the same rules as in the real build, so the map can show nothing that the
// list could not.
//
//   node prototypes/navigieren/build.mjs [--posts <dir>] [--out <dir>]
//
// The page is readable without JavaScript: every post stands in the HTML with its short and its full text. karte.js
// only adds the map and moves the full text into a sheet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../../src/lib/escape.mjs';
import { hasFailure, format } from '../../src/lib/findings.mjs';
import { fill, loadLabels } from '../../src/lib/labels.mjs';
import { displayHost, httpsLink } from '../../src/lib/links.mjs';
import { formatNumber, newestFirst, numberPosts } from '../../src/lib/numbering.mjs';
import { checkPostText } from '../../src/lib/post-file.mjs';
import { previewOf } from '../../src/lib/preview.mjs';
import { checkForBuild, isFixtureTree, loadTreeFromDir, safeImageReader } from '../../src/lib/tree.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..');
const CHEVRON = '<svg class="ic" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function readPosts(postsDir) {
  const head = loadTreeFromDir(postsDir);
  const findings = checkForBuild({ head, headDir: postsDir, displayDir: postsDir, publish: false });
  if (hasFailure(findings)) throw new Error(findings.map(format).join('\n'));
  const fixture = isFixtureTree(postsDir);
  return numberPosts([...head.posts.values()].map((entry) => {
    const { post } = checkPostText(entry.text, { file: `${postsDir}/${entry.relative}`, fixture, readImage: safeImageReader(path.join(postsDir, entry.year)) });
    return post;
  }));
}

// One post as a row of the log. The short text is what the map shows on hover, .voll is what the sheet shows.
// A text in both languages: the German one shows unless the page is switched to English (karte.css).
const two = (text, tag = 'span') => `<${tag} class="de" lang="de" dir="ltr">${esc(text.de)}</${tag}><${tag} class="en-only" lang="en" dir="ltr">${esc(text.en)}</${tag}>`;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const STANCE = ['s0', 's1', 's2', 's3', 's4'];
const stanceOf = (value) => STANCE[value < -0.6 ? 0 : value < -0.2 ? 1 : value <= 0.2 ? 2 : value <= 0.6 ? 3 : 4];

// A tree: one topic, its aspects from "untrue / hype" on the left to "great" on the right. Every aspect is a short written
// statement and a cut of a video (start and end). `water` is the base watering that the author sets.
function tree(M, T, item) {
  const aspects = [...item.aspects].sort((a, b) => a.stance - b.stance);
  return `<article class="tree" id="t-${esc(item.id)}" data-id="${esc(item.id)}" data-topic="${esc(item.topic)}">
<p class="mks"><span class="mk tp">${two(T.topics[item.topic])}</span><span class="mk"><span>${aspects.length}</span> <span data-l="aspects">${esc(M.aspects)}</span></span></p>
<h3 class="tt"><a href="#t-${esc(item.id)}">${two(item.title)}</a></h3>
<ol class="asp">
${aspects.map((a) => `<li data-id="${esc(a.id)}" data-stance="${a.stance}" data-water="${a.water}">
<p class="lab">${two(a.label, 'strong')} <span class="mk st" data-l="${stanceOf(a.stance)}">${esc(M[stanceOf(a.stance)])}</span> <span class="mk wt"><span class="wn">${a.water}</span>× <span data-l="watered">${esc(M.watered)}</span></span></p>
<p class="say">${two(a.say)}</p>
<p class="srcbox"><a class="sk" href="${esc(httpsLink(`${a.video.link}&t=${a.video.start}s`, 'video'))}" rel="noopener noreferrer">${esc(a.video.title)}</a><span class="sn"><span data-l="clip">${esc(M.clip)}</span> <span class="clip" dir="ltr">${clock(a.video.start)}–${clock(a.video.end)}</span></span></p>
</li>`).join('\n')}
</ol>
</article>`;
}

function row(L, M, post, newest, T) {
  const no = formatNumber(post.number);
  const lang = ` lang="${esc(post.lang)}" dir="ltr"`;
  const topic = T.posts[formatNumber(post.number)];
  const marks = `${topic ? `<span class="mk tp">${two(T.topics[topic])}</span>` : ''}${newest ? `<span class="mk now">${esc(M.newest)}</span>` : ''}${post.sourceLink === undefined ? '' : `<span class="mk src">${esc(L['blog.source'])}</span>`}${post.lang === 'en' ? '<span class="en">EN</span>' : ''}`;
  const quote = post.quote === undefined ? '' : `<blockquote class="qt"><p>${esc(post.quote)}</p><footer>${esc(post.quoteSource)}</footer></blockquote>\n`;
  const source = post.sourceLink === undefined ? '' : `<p class="srcbox"><a class="sk" href="${esc(httpsLink(post.sourceLink, 'sourceLink'))}" rel="noopener noreferrer">${esc(post.sourceTitle || displayHost(post.sourceLink))}</a><span class="sn" lang="de">${esc(fill(L['blog.source.leads'], { site: displayHost(post.sourceLink) }))}</span></p>\n`;
  return `<li class="row" id="b-${no}" data-no="${no}" data-topic="${esc(topic || '')}" data-date="${esc(post.date)}"${newest ? ' data-newest' : ''}>
<span class="no" aria-hidden="true">${no}</span>
<time class="dt" datetime="${esc(post.date)}">${esc(post.date)}</time>
<h2 class="tt"><a href="#b-${no}"${lang}>${esc(post.title)}</a></h2>
${marks === '' ? '' : `<span class="mks">${marks}</span>\n`}<p class="ex"${lang}>${esc(previewOf(post.paragraphs[0]))}</p>
<div class="voll"${lang}>
${post.paragraphs.map((text) => `<p>${esc(text)}</p>`).join('\n')}
${quote}${source}</div>
</li>`;
}

function page(L, M, posts, T) {
  const invented = posts.some((post) => post.example);
  return `<!doctype html>
<html lang="de" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex">
<title>${esc(M.title)} · ${esc(L['blog.title'])} · dreambau.com</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="karte.css">
<script src="karte.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Zum Inhalt springen</a>
<header class="top">
<a class="pill home" href="/">${CHEVRON}<span data-l="home">${esc(L['blog.home'])}</span></a>
<h1 class="ttl"><span data-l="title">${esc(M.title)}</span><span class="caret" aria-hidden="true"></span></h1>
<nav class="langs" aria-label="Sprache · Language"><a class="pill" href="?lang=de" data-lang="de" lang="de" aria-current="true">DE</a><a class="pill" href="?lang=en" data-lang="en" lang="en">EN</a></nav>
<p class="kicker"><span data-l="sub">${esc(M.sub)}</span>${invented ? ` <span class="draft" data-l="proto">${esc(M.proto)}</span>` : ''}</p>
</header>
<main id="main">
<div class="stage" id="stage" tabindex="0" role="group" aria-label="${esc(M.stage)}" data-l-aria="stage">
<canvas id="map" aria-hidden="true"></canvas>
<button class="pill center" id="center" type="button" data-l="center">${esc(M.center)}</button>
<div class="hud" aria-hidden="true"><p class="keys" data-l="keys">${esc(M.keys)}</p><p class="score" id="score" hidden></p></div>
<div class="acts"><button class="pill pri" id="read" type="button" data-l="read" hidden>${esc(M.read)}</button><button class="pill jump" id="jump" type="button" data-l="jump">${esc(M.jump)}</button></div>
<p class="hint" id="hint" data-l="hint">${esc(M.hint)}</p>
<div class="tip" id="tip" hidden></div>
</div>
<p class="sr" data-l="blind">${esc(M.blind)}</p>
<div class="logp">
<p class="logtop" aria-hidden="true">~/blog/navigieren/</p>
<ol class="log" id="posts" reversed role="list" aria-label="${esc(L['blog.list.label'])}">
${newestFirst(posts).map((post, index) => row(L, M, post, index === 0, T)).join('\n')}
</ol>
</div>
<section class="trees" id="trees" aria-labelledby="trees-h">
<h2 class="shd" id="trees-h" data-l="trees">${esc(M.trees)}</h2>
<p class="axis"><span data-l="axisL">${esc(M.axisL)}</span><span aria-hidden="true">←→</span><span data-l="axisR">${esc(M.axisR)}</span></p>
${T.trees.map((item) => tree(M, T, item)).join('\n')}
</section>
<div class="veil" id="veil" hidden></div>
<section class="grove" id="grove" role="dialog" aria-modal="true" aria-labelledby="grove-title" hidden>
<div class="phead"><nav class="cloud" id="cloud" aria-label="${esc(M.cloud)}" data-l-aria="cloud"></nav><button class="pill" id="grove-close" type="button"><span data-l="close">${esc(M.close)}</span><kbd class="esc" aria-hidden="true">Esc</kbd></button></div>
<h2 class="ptitle" id="grove-title" tabindex="-1"></h2>
<div class="canopy" id="canopy"><div class="zoom" id="zoom"><canvas id="wood" aria-hidden="true"></canvas></div>
<div class="zb"><button class="pill" id="zin" type="button" aria-label="${esc(M.zoomIn)}" data-l-aria="zoomIn">+</button><button class="pill" id="zout" type="button" aria-label="${esc(M.zoomOut)}" data-l-aria="zoomOut">−</button></div>
<p class="axis ax"><span data-l="axisL">${esc(M.axisL)}</span><span data-l="axisR">${esc(M.axisR)}</span></p></div>
<div class="leafbox" id="leafbox" aria-live="polite"></div>
</section>
<section class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" hidden>
<div class="phead"><p class="pmeta" id="panel-meta"></p><button class="pill" id="close" type="button"><span data-l="close">${esc(M.close)}</span><kbd class="esc" aria-hidden="true">Esc</kbd></button></div>
<h2 class="ptitle" id="panel-title" tabindex="-1"></h2>
<div class="pbody" id="panel-body"></div>
</section>
</main>
<footer class="site">
<nav class="foot" aria-label="${esc(L['blog.nav.label'])}"><span class="pending" lang="de" dir="ltr">Impressum · Angaben noch offen</span><i aria-hidden="true">·</i><span class="pending" lang="de" dir="ltr">Datenschutz · Freigabe noch offen</span><a href="/">Startseite</a><a href="/referenzen/">Referenzen</a><a href="/teamwork/">Teamwork</a><a href="/glossar/">Glossar</a><a href="mailto:info@dreambau.com">Kontakt</a></nav>
</footer>
</body>
</html>
`;
}

export function buildMap({ postsDir = path.join(APP, 'tests', 'fixtures'), outDir = path.join(APP, 'dist-proto', 'navigieren') } = {}) {
  const posts = readPosts(postsDir);
  const L = loadLabels();
  const all = JSON.parse(fs.readFileSync(path.join(HERE, 'labels.json'), 'utf8'));
  const read = (file) => fs.readFileSync(file, 'utf8');
  const css = `${read(path.join(APP, 'src', 'tokens.css')).replace(/\n$/, '')}\n${read(path.join(APP, 'src', 'blog.css'))}${read(path.join(HERE, 'karte.css'))}`;
  const js = `const KARTE_LABELS = ${JSON.stringify(all)};\n${read(path.join(HERE, 'karte.js'))}`;
  fs.mkdirSync(outDir, { recursive: true });
  const T = JSON.parse(read(path.join(HERE, 'themen.json')));
  fs.writeFileSync(path.join(outDir, 'index.html'), page(L, all.de, posts, T));
  fs.writeFileSync(path.join(outDir, 'karte.css'), css);
  fs.writeFileSync(path.join(outDir, 'karte.js'), js);
  return { outDir, posts: posts.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const result = buildMap({ postsDir: option('--posts'), outDir: option('--out') });
  console.log(`${result.posts} posts -> ${path.relative(process.cwd(), result.outDir)}/index.html`);
}
