// Selected Wegweiser runtime, without mock tooling or proposed vocabulary.
(() => {
'use strict';
const content=JSON.parse(document.getElementById('glossary-data').content.textContent);
const GROUPS=[{id:'start',name:'Startseite',rgb:'56,214,255'},{id:'inhalte',name:'Inhalte',rgb:'255,94,200'},{id:'team',name:'Teamwork',rgb:'255,178,62'},{id:'sprachen',name:'Sprachen',rgb:'198,242,58'},{id:'frei',name:'Freigeben',rgb:'169,139,255'},{id:'plan',name:'Planen & Ablage',rgb:'72,226,170'}];
const GROUP=Object.fromEntries(GROUPS.map(g=>[g.id,g]));
const COLS=[['start','inhalte'],['team','sprachen'],['frei','plan']],CORE_RGB='255,238,210';
const QUESTIONS=content.questions.map(q=>({...q,...q.answer,area:['frei','plan'].includes(q.group),kw:q.keywords||''}));
const WORDS=content.terms.map(w=>{
 const q=QUESTIONS.find(q=>q.word===w.id),a=q||{};
 return {...w,g:w.group,en:w.english_alias,what:w.definition,where:a.where||'Angabe folgt',whatFor:a.whatFor||'Angabe folgt',place:a.place||'Ort folgt',btn:a.btn||null,rel:w.related.filter(id=>content.terms.some(t=>t.id===id)),kw:w.name};
});
const AVOID=content.avoid.filter(a=>a.use.every(id=>WORDS.some(w=>w.id===id)));
const D = document, R = D.documentElement;
const $ = (s, r = D) => r.querySelector(s), $$ = (s, r = D) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans Mono CJK JP",monospace';

/* every interface text that is not a word or a question (the translation unit is the string with its {placeholders}) */
const T = {
  title: 'Glossar', back: 'Startseite', ich: 'Ich will …', counts: '{q} Fragen · {w} Wörter · {g} Bereiche',
  phSearch: 'Frage oder Wort suchen …', phSearchShort: 'Suchen …', lblSearch: 'Frage oder Wort suchen', clear: 'Suche löschen',
  azBtn: 'Wörter A–Z', az: 'A–Z', azTitle: 'Alle Wörter von A bis Z', azClose: 'Schließen', azLegend: '',
  all: 'Alle', chips: 'Bereich wählen',
  hint: 'Wähle unten eine Frage oder suche ein Wort.',
  hits1: '1 Treffer', hitsN: '{n} Treffer', secQ: 'Fragen', secW: 'Wörter',
  nohit: 'Nichts gefunden', nohitMsg: 'Für „{q}“ gibt es weder eine Frage noch ein Wort.', avoidMsg: '„{w}“ sagen wir nicht mehr. Gemeint ist: {use}.', show: '{w} zeigen', orAsk: 'Oder frag so:',
  ort: 'Ort', wort: 'Wort', was: 'Was', wo: 'Wo', wozu: 'Wozu', rel: 'Verwandte Wörter',
  iw: 'Ich will {q}', wordEb: 'Wort im Glossar', internal: 'Wie wir arbeiten', ans: 'Antwort', ansLive: 'Antwort: {place}. {what}',
  or: 'oder',
};
/* ---------- settled data prep ---------- */
const WORD = {}, QUES = {};
WORDS.forEach(w => { WORD[w.id] = w; w.rgb = GROUP[w.g].rgb; });
QUESTIONS.forEach(q => { QUES[q.id] = q; q.rgb = GROUP[q.group].rgb; });
const SORTED = WORDS.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
const letterOf = w => w.name.charAt(0).toUpperCase();
const LETTERS = [...new Set(SORTED.map(letterOf))];
const COLS3 = COLS, COLS2 = [['start', 'inhalte', 'team'], ['sprachen', 'frei', 'plan']];
const FIRST_Q = QUESTIONS[0].id;

/* ---------- search: German friendly (ä = a = ae), every word must match, the best field wins ---------- */
const fold1 = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const collapse = s => s.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const wordsOf = q => fold1(q).split(/[\s,;]+/).filter(Boolean);
const mk = s => { const a = fold1(s || ''); return { a, b: collapse(a) }; };
const hit = (h, t, ct) => h.a.includes(t) || h.a.includes(ct) || h.b.includes(t) || h.b.includes(ct);
function scoreAgainst(h, fields, toks) {
  let total = 0;
  for (const t of toks) {
    const ct = collapse(t); let b = 0;
    for (const [f, wt] of fields) {
      const x = h[f]; if (!x || !x.a || !hit(x, t, ct)) continue;
      let s = wt; if (x.a === t) s += 6; else if (x.a.startsWith(t)) s += 3; else if ((' ' + x.a).includes(' ' + t)) s += 1.5;
      if (s > b) b = s;
    }
    if (!b) return null;
    total += b;
  }
  return total;
}
WORDS.forEach(w => { w._h = { nm: mk(w.name), en: mk(w.en), kw: mk(w.kw), place: mk(w.place), where: mk(w.where), grp: mk(GROUP[w.g].name), what: mk(w.what), whatFor: mk(w.whatFor) }; });
QUESTIONS.forEach(q => { const w = WORD[q.word]; q._h = { text: mk('ich will ' + q.text), kw: mk(q.kw), term: mk(w.name + ' ' + (w.en || '')), place: mk(q.place || w.place), what: mk(q.what || w.what) }; });
const WFIELDS = [['nm', 6], ['en', 5], ['kw', 4], ['place', 3], ['where', 3], ['grp', 2], ['what', 2], ['whatFor', 2]];
const QFIELDS = [['text', 6], ['kw', 4], ['term', 4], ['place', 3], ['what', 2]];
const searchW = toks => { const out = []; for (const w of SORTED) { const s = scoreAgainst(w._h, WFIELDS, toks); if (s != null) out.push({ w, s }); } return out.sort((a, b) => b.s - a.s); };
const searchQ = toks => { const out = []; for (const q of QUESTIONS) { const s = scoreAgainst(q._h, QFIELDS, toks); if (s != null) out.push({ q, s }); } return out.sort((a, b) => b.s - a.s); };
/* original text <-> folded text positions, so that a match is marked in the original spelling */
function foldMap(text) { let s = ''; const map = []; for (let i = 0; i < text.length; i++) { const f = fold1(text[i]); for (let k = 0; k < f.length; k++) { s += f[k]; map.push(i); } } return { s, map }; }
function ranges(text, toks) {
  const { s, map } = foldMap(text), out = [];
  for (const t0 of toks) for (const t of new Set([t0, collapse(t0)])) { if (!t) continue; let i = 0; while ((i = s.indexOf(t, i)) >= 0) { out.push([map[i], map[i + t.length - 1] + 1]); i += t.length; } }
  out.sort((a, b) => a[0] - b[0]);
  const m = []; for (const r of out) { const l = m[m.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else m.push(r.slice()); }
  return m;
}
function hl(text, toks) {
  if (!toks || !toks.length) return esc(text);
  const m = ranges(text, toks); if (!m.length) return esc(text);
  let out = '', p = 0; for (const [a, b] of m) { out += esc(text.slice(p, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; p = b; }
  return out + esc(text.slice(p));
}
const avoidFor = q => { const f = fold1(q).trim(); return f ? AVOID.find(a => fold1(a.w) === f) || null : null; };
const avoidText = a => a.msg || fmt(T.avoidMsg, { w: a.w, use: a.use.map(id => WORD[id].name).join(' ' + T.or + ' ') });

/* ---------- noise and glyphs: the same functions as the other mockups (every picture is a pure function of time) ---------- */
const GL_CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFXZ<>{}[]/=+*:;#$%&¦';
const hash = (a, b, c) => { let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const glyph = (a, b, c) => GL_CHARS[Math.floor(hash(a, b, c) * GL_CHARS.length)];
const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };
const _st = {};
const sty = (rgb, a) => { const q = Math.max(0, Math.min(1, Math.round(a * 40) / 40)); const k = rgb + '|' + q; return _st[k] || (_st[k] = 'rgba(' + rgb + ',' + q + ')'); };
function fit(c) {
  const w = c.clientWidth, h = c.clientHeight; if (!w || !h) return null;
  const d = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * d), H = Math.round(h * d);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w, h };
}
/* a rectangle relative to the page container, independent of the scale of the phone frame */
function rel(el, base) { const a = base.getBoundingClientRect(), r = el.getBoundingClientRect(), k = a.width / (base.offsetWidth || 1) || 1; return { x: (r.left - a.left) / k, y: (r.top - a.top) / k, w: r.width / k, h: r.height / k }; }
const RG = [[0, 1], [6.5, 5], [12.5, 10], [18, 15]];
function drawOrb(x2, cx, cy, Rr, rgb, id, t, o) {
  const sc = Rr / 22, sh = strHash(id);
  x2.font = Math.max(8, 9.5 * sc).toFixed(1) + 'px ' + MONO;
  RG.forEach(([rr, cnt], ri) => {
    for (let k = 0; k < cnt; k++) {
      const hv = hash(sh + ri, k, 3), ang = cnt === 1 ? 0 : (k / cnt) * 6.2832 + ri * .7 + (o.calm ? 0 : t * .35 * (ri % 2 ? 1 : -1));
      const px = cx + Math.cos(ang) * rr * sc, py = cy + Math.sin(ang) * rr * sc;
      const a = o.calm ? .55 + .3 * hv : .45 + .45 * (.5 + .5 * Math.sin(t * (2 + 3 * hv) + k));
      const head = hv > .45;
      x2.fillStyle = head ? sty('240,246,255', Math.min(1, a + .3)) : sty(rgb, Math.min(1, a + .2));
      x2.fillText(glyph(sh + ri, k, o.calm ? Math.floor(hv * 30) : Math.floor(t * (1.5 + 5 * hv) + hv * 30)), px, py);
    }
  });
}
/* the "decode" effect: a heading scrambles into place (not with reduced motion; the heading keeps its real text as its name) */
const SCR = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>=';
function decode(node, text, dur) {
  if (!node) return;
  if (node._r) cancelAnimationFrame(node._r);
  if (RM()) { node.textContent = text; return; }
  const s0 = performance.now(), n = text.length;
  const step = now => {
    const p = (now - s0) / dur;
    if (p >= 1) { node.textContent = text; node._r = 0; return; }
    let out = ''; for (let i = 0; i < n; i++) { const c = text[i]; out += c === ' ' || c === '-' ? c : (p > (i / n) * .55 + .45 ? c : SCR[(Math.random() * SCR.length) | 0]); }
    node.textContent = out; node._r = requestAnimationFrame(step);
  };
  node._r = requestAnimationFrame(step);
}

/* ---------- icons ---------- */
const ARROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';
const RARROW = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const LENS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CHEVUP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';

/* ---------- state ---------- */

const mqRM = matchMedia('(prefers-reduced-motion: reduce)');

let cur = null, preset = false, query = '', chip = null, az = false, mo = false, moBeforeAz = false, lastLay = null, frozen = null, last = 0;
const RM = () => mqRM.matches;
const RM_T = 4.6, t0 = performance.now();
const nowT = () => (frozen != null ? frozen : (performance.now() - t0) / 1000);

/* ---------- the page skeleton ---------- */
const app = $('#app');
app.innerHTML = `
<canvas id="field" aria-hidden="true"></canvas>
<header class="top" id="top">
  <a class="back" href="/">${BACK}<span>${esc(T.back)}</span></a>
  <h1>${esc(T.title)}</h1>
  <h2 class="ich" id="h-ich">Ich will <em>…</em></h2>
  <span class="cnt" id="cnt">${esc(fmt(T.counts, { q: QUESTIONS.length, w: WORDS.length, g: GROUPS.length }))}</span>
  <div class="srch" role="search" id="srch">${LENS}<input id="q" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(T.phSearch)}" aria-label="${esc(T.lblSearch)}" aria-controls="ask"><button type="button" class="clr" id="clr" aria-label="${esc(T.clear)}" hidden>${CROSS}</button></div>
  <button type="button" class="azbtn" id="azbtn" aria-expanded="false" aria-controls="azp"><span>${esc(T.azBtn)}</span><b>${WORDS.length}</b></button>
</header>
<div class="body" id="bodyc">
  <p class="hintbar" id="hintbar">${esc(T.hint)}<span>${esc(fmt(T.counts, { q: QUESTIONS.length, w: WORDS.length, g: GROUPS.length }))}</span></p>
  <main class="mainc" id="main">
    <section class="ask" id="ask" aria-labelledby="h-ich"></section>
    <section class="ans" id="ans" aria-label="${esc(T.ans)}"></section>
  </main>
  <div class="chips" id="chips" role="group" aria-label="${esc(T.chips)}" hidden></div>
  <section class="azp" id="azp" aria-labelledby="az-h" hidden>
    <div class="azh"><h2 id="az-h">${esc(T.azTitle)}</h2><button type="button" class="azx" id="azx" aria-label="${esc(T.azClose)}">${CROSS}</button></div>
    <div class="azs" id="azs"></div>
  </section>
</div>
<div class="dock" id="dock">
  <button type="button" class="askb" id="askb" aria-expanded="false" aria-controls="ask"><span>${esc(T.ich)}</span>${CHEVUP}</button>
  <button type="button" class="azb" id="azb" aria-expanded="false" aria-controls="azp" aria-label="${esc(T.azTitle)}">${esc(T.az)}</button>
</div>
<p class="sr" id="live" role="status" aria-live="polite"></p>`;
const field = $('#field'), top = $('#top'), main = $('#main'), ask = $('#ask'), ans = $('#ans'), chips = $('#chips'), azp = $('#azp'), azs = $('#azs'), dock = $('#dock');
const srch = $('#srch'), inp = $('#q'), clr = $('#clr'), askb = $('#askb'), azb = $('#azb'), azbtn = $('#azbtn'), live = $('#live');


const isPh = () => app.dataset.lay === 'ph';
const layOf = () => { const w = app.clientWidth; return w < 900 ? 'ph' : w < 1240 ? 'c2' : 'c3'; };
const winOf = () => (innerWidth < 900 || matchMedia('(pointer: coarse)').matches) ? 'ph' : 'dt';

/* ---------- markup ---------- */
const rowQ = (q, toks) => `<li data-zone="${q.rgb}"><button type="button" class="opt" data-q="${q.id}" aria-pressed="false" aria-label="${esc(fmt(T.iw, { q: q.text }))}"><i class="dot" aria-hidden="true"></i><span>${toks ? hl(q.text, toks) : esc(q.text)}</span></button></li>`;
const rowW = (w, toks) => `<li data-zone="${w.rgb}"><button type="button" class="opt w" data-w="${w.id}" aria-pressed="false"><i class="dot" aria-hidden="true"></i><span><b>${hl(w.name, toks)}</b></span>${w.en ? `<small lang="en">${hl(w.en, toks)}</small>` : ''}</button></li>`;
const grpHTML = g => {
  const qs = QUESTIONS.filter(q => q.group === g.id);
  return `<section class="grp" data-zone="${g.rgb}" aria-labelledby="gh-${g.id}"><h3 class="gh" id="gh-${g.id}"><i aria-hidden="true"></i>${esc(g.name)}<small>${qs.length}</small></h3><ul class="rows">${qs.map(q => rowQ(q)).join('')}</ul></section>`;
};
function groupsHTML() {
  const cols = app.dataset.lay === 'c2' ? COLS2 : COLS3;
  return `<div class="cols">${cols.map(c => `<div class="col">${c.map(id => grpHTML(GROUP[id])).join('')}</div>`).join('')}</div>`;
}
const phoneListHTML = () => `<ul class="rows">${QUESTIONS.filter(q => !chip || q.group === chip).map(q => rowQ(q)).join('')}</ul>`;
const avoidNoteHTML = () => {
  const a = avoidFor(query); if (!a) return '';
  if (a.msg) return `<p class="note">${esc(a.msg)}</p>`;
  return `<p class="note">${esc(fmt(T.avoidMsg, { w: a.w, use: '\u0001' })).replace('\u0001', a.use.map(id => `<button type="button" class="sl" data-w="${id}">${esc(WORD[id].name)}</button>`).join(' ' + esc(T.or) + ' '))}</p>`;
};
function nohitHTML() {
  const a = avoidFor(query), q = query.trim();
  return `<h2 class="sh">${esc(T.nohit)}</h2><div class="none"><p>${esc(fmt(T.nohitMsg, { q }))}</p>${a ? `<p>${esc(avoidText(a))}</p>` : ''}<div class="acts">${a ? a.use.map(id => `<button type="button" class="btn" data-w="${id}" data-zone="${WORD[id].rgb}"><span>${esc(fmt(T.show, { w: WORD[id].name }))}</span>${RARROW}</button>`).join('') : ''}<button type="button" class="btn" data-clear="1" data-zone="255,216,107"><span>${esc(T.clear)}</span></button></div></div><p class="sec">${esc(T.orAsk)}</p><ul class="res">${QUESTIONS.slice(0, 6).map(q => rowQ(q)).join('')}</ul>`;
}
function askHTML() {
  if (!query.trim()) return isPh() ? phoneListHTML() : groupsHTML();
  const toks = wordsOf(query), rq = searchQ(toks), rw = searchW(toks), n = rq.length + rw.length;
  if (!n) return nohitHTML();
  let h = `<h2 class="sh sm">${esc(n === 1 ? T.hits1 : fmt(T.hitsN, { n }))}</h2>${avoidNoteHTML()}`;
  if (rq.length) h += `<p class="sec">${esc(T.secQ)}</p><ul class="res">${rq.map(r => rowQ(r.q, toks)).join('')}</ul>`;
  if (rw.length) h += `<p class="sec">${esc(T.secW)}</p><ul class="res">${rw.map(r => rowW(r.w, toks)).join('')}</ul>`;
  return h;
}
function chipsHTML() {
  return `<button type="button" class="chip all" data-chip="" aria-pressed="${chip === null}"><span>${esc(T.all)}</span></button>` + GROUPS.map(g => `<button type="button" class="chip" data-chip="${g.id}" data-zone="${g.rgb}" aria-pressed="${chip === g.id}"><i aria-hidden="true"></i><span>${esc(g.name)}</span></button>`).join('');
}
/* what a card shows: a question takes its own text where it has one, else the text of its word */
function info(sel) {
  if (sel.t === 'q') {
    const q = QUES[sel.id], w = WORD[q.word];
    return { kind: 'q', q, w, rgb: q.rgb, place: q.place || w.place, what: q.what || w.what, where: q.where || w.where, whatFor: q.whatFor || w.whatFor, btn: q.btn || w.btn, internal: !!q.area, rel: w.rel.filter(i => i !== w.id) };
  }
  const w = WORD[sel.id];
  return { kind: 'w', w, rgb: w.rgb, place: w.place, what: w.what, where: w.where, whatFor: w.whatFor, btn: w.btn, internal: false, rel: w.rel.filter(i => i !== w.id) };
}
function cardHTML(sel) {
  const c = info(sel), w = c.w, q = c.kind === 'q';
  const bigTxt = q ? c.place : w.name;
  const eb = q ? esc(fmt(T.iw, { q: c.q.text })) : esc(T.wordEb);
  const tags = (c.internal ? `<span class="tag">${esc(T.internal)}</span>` : '');
  const en = w.en ? `<span class="en" lang="en">${esc(w.en)}</span>` : '';
  const rows = (q ? `<dt>${esc(T.wort)}</dt><dd><strong>${esc(w.name)}</strong>${en}</dd>` : `<dt>${esc(T.ort)}</dt><dd>${esc(c.place)}</dd>`)
    + `<dt>${esc(T.was)}</dt><dd>${esc(c.what)}</dd><dt>${esc(T.wo)}</dt><dd>${esc(c.where)}</dd><dt>${esc(T.wozu)}</dt><dd>${esc(c.whatFor)}</dd>`;
  const target=c.btn && c.btn[1];
  const allowed=target && (/^\/(?!\/)/.test(target)||/^https:\/\/dreambau\.com(?:\/|$)/.test(target));
  const btn=target==='#woerter' ? `<button type="button" class="btn" data-az="1"><span>${esc(c.btn[0])}</span>${RARROW}</button>` : allowed ? `<a class="btn" href="${esc(target)}"><span>${esc(c.btn[0])}</span>${ARROW}</a>` : c.btn ? `<span class="unavailable">${esc(c.btn[0])} · ${esc(target||'Angabe folgt')}</span>` : '';
  const rels = c.rel.length ? `<div class="rl"><span>${esc(T.rel)}</span>${c.rel.map(id => `<button type="button" class="rel" data-w="${id}" data-zone="${WORD[id].rgb}">${esc(WORD[id].name)}</button>`).join('')}</div>` : '';
  return `<article class="card" data-zone="${c.rgb}" aria-label="${esc(fmt(T.ansLive, { place: bigTxt, what: '' }).replace(/\.\s*$/, ''))}">
<p class="eb${q ? ' qeb' : ''}${tags ? ' tg' : ''}"><i aria-hidden="true"></i><span class="qt">${eb}</span>${tags}</p>
<div class="hd2"><div class="tx"><span class="lbl">${esc(q ? T.ort : T.wort)}</span><h2 class="big${bigTxt.length > 24 ? ' long' : ''}" tabindex="-1" aria-label="${esc(bigTxt)}"><span class="dec">${esc(bigTxt)}</span></h2>${!q && w.en ? `<p class="al2" lang="en">${esc(w.en)}</p>` : ''}</div><canvas class="corb" data-id="${w.id}" data-rgb="${c.rgb}" aria-hidden="true"></canvas></div>
<dl>${rows}</dl>
<div class="act">${btn}</div>
${rels}
</article>`;
}
const bubbleOf = sel => sel.t === 'q' ? fmt(T.iw, { q: QUES[sel.id].text }) : WORD[sel.id].name;
function ansHTML() {
  if (!cur) return '';
  const rgb = info(cur).rgb;
  return (isPh() ? `<p class="bub" data-zone="${rgb}">${esc(bubbleOf(cur))}</p>` : '') + cardHTML(cur);
}
function azHTML() {
  return `<div class="azg">${LETTERS.map(l => `<div class="azl"><h3>${l}</h3><ul>${SORTED.filter(w => letterOf(w) === l).map(w => `<li data-zone="${w.rgb}"><button type="button" class="azw" data-w="${w.id}"><i class="dot" aria-hidden="true"></i><span>${esc(w.name)}</span>${w.en ? `<small lang="en">${esc(w.en)}</small>` : ''}</button></li>`).join('')}</ul></div>`).join('')}</div>`;
}

/* ---------- rendering ---------- */
function markSel() {
  $$('[data-q],[data-w]', app).forEach(b => {
    const on = !!cur && ((b.dataset.q && cur.t === 'q' && b.dataset.q === cur.id) || (b.dataset.w && cur.t === 'w' && b.dataset.w === cur.id));
    if (b.classList.contains('opt')) b.setAttribute('aria-pressed', String(on)); else if (b.classList.contains('azw')) { if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
  });
}
function renderAsk() { ask.innerHTML = askHTML(); markSel(); }
function renderChips() { chips.innerHTML = chipsHTML(); }
function toBottom() {
  if (!isPh()) return;
  /* a long answer shows its beginning (the question, Ort or Wort, the four fields) and the rest is one swipe away; everything else sits at the bottom, like a chat */
  if (cur && !mo && !query.trim() && ans.offsetHeight > main.clientHeight - 8) main.scrollTop = Math.max(0, ans.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - 4);
  else main.scrollTop = main.scrollHeight;
}
function renderAns(announce) {
  ans.innerHTML = ansHTML();
  if (announce && cur) {
    const c = info(cur);
    live.textContent = fmt(T.ansLive, { place: c.kind === 'q' ? c.place : c.w.name, what: c.what });
  }
  const dec = $('.big .dec', ans); if (dec && announce) decode(dec, dec.textContent, 520);
  toBottom(); redraw();
}
function chrome() {
  app.classList.toggle('mo', mo);
  askb.setAttribute('aria-expanded', String(mo));
  azb.setAttribute('aria-expanded', String(az));
  azbtn.setAttribute('aria-expanded', String(az));
  azp.hidden = !az;
  clr.hidden = !query;
  chips.hidden = !(isPh() && mo && !query.trim());
  main.inert = az; chips.inert = az; top.inert=az; dock.inert=az;
  app.classList.toggle('hintbar-on', isPh() && !cur && !query.trim());
  app.classList.toggle('az-on', az);
}
function renderAll() { renderAsk(); renderChips(); renderAns(false); chrome(); }
function place() {
  const ph = isPh(), had = D.activeElement === inp;
  inp.placeholder = ph ? T.phSearchShort : T.phSearch;
  if (ph && srch.parentNode !== dock) dock.insertBefore(srch, azb);
  else if (!ph && srch.parentNode !== top) top.insertBefore(srch, azbtn);
  if (had) inp.focus({ preventScroll: true });
}

/* ---------- state changes ---------- */
function writeHash() {
  const u = new URL(location.href);
  u.hash = cur && !preset ? (cur.t === 'q' ? '#q-' : '#term-') + cur.id : '';   /* the pre-opened first answer is not a choice: no link for it */
  try { history.replaceState(null, '', u.href); } catch (e) { /* a file URL may refuse; the page works without it */ }
}
function select(sel, o = {}) {
  if (!(sel.t === 'q' ? QUES[sel.id] : WORD[sel.id])) return;
  if (az) closeAZ(false);
  cur = sel; preset = false; mo = false; query='';inp.value='';chip=null;renderAsk();renderChips();
  writeHash(); markSel(); renderAns(true); chrome(); toBottom();
  if (isPh() && !o.keepFocus) { const b = $('.big', ans); if (b) b.focus({ preventScroll: true }); }
  else if (o.focusBig) { const b = $('.big', ans); if (b) b.focus({ preventScroll: true }); }
}
function setQuery(q, o = {}) {
  query = q; if (inp.value !== q) inp.value = q;
  if (az && q) closeAZ(false);
  if (isPh()) mo = true;
  renderAsk(); chrome(); ask.scrollTop = 0; toBottom();
  if (o.noRedraw) return;
  redraw();
}
function setChip(id) { chip = id || null; renderAsk(); renderChips(); chrome(); toBottom(); }
function openAZ() {
  if (az) return;
  az = true; moBeforeAz = mo; mo = false; chrome();
  if (!azs.firstChild) azs.innerHTML = azHTML();
  markSel(); azs.scrollTop = 0;
  const f = $('.azw[aria-current=true]', azp) || $('.azw', azp); if (f) f.focus({ preventScroll: true });
}
function closeAZ(back) {
  if (!az) return;
  az = false; mo = moBeforeAz; chrome();
  if (back) (isPh() ? azb : azbtn).focus();
}
function best() {
  const toks = wordsOf(query), rq = searchQ(toks), rw = searchW(toks);
  if (!rq.length && !rw.length) return null;
  if (rq.length && (!rw.length || rq[0].s > rw[0].s)) return { t: 'q', id: rq[0].q.id };
  return { t: 'w', id: rw[0].w.id };
}
function resetStart() {
  query = ''; chip = null; inp.value = '';
  if (isPh()) { cur = null; preset = false; mo = true; } else { cur = { t: 'q', id: FIRST_Q }; preset = true; mo = false; }
}
/* ---------- the picture: a field of characters that glows around the answer, an orb of characters in the card ---------- */
function frame(t) {
  const ph = isPh(), f = fit(field); if (!f) return;
  const { x, w, h } = f; x.clearRect(0, 0, w, h);
  const calm = RM(), tint = cur ? info(cur).rgb : CORE_RGB;
  const card = $('.card', ans);
  let fx = w * .72, fy = h * .42, box = null;
  if (card) { const r = rel(card, app); fx = r.x + r.w / 2; fy = r.y + r.h / 2; box = r; } else if (ph) { fx = w * .5; fy = h * .4; }
  const askR = !ph ? rel(ask, app) : null, askRight = askR ? askR.x + askR.w : 0;
  const cw = ph ? 18 : 16, ch = ph ? 23 : 20, cols = Math.ceil(w / cw), rows = Math.ceil(h / ch), R2 = ph ? 210 : 340;
  x.font = '12px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    const py = r * ch + ch / 2;
    for (let c = 0; c < cols; c++) {
      const px = c * cw + cw / 2;
      if (box && px > box.x - 4 && px < box.x + box.w + 4 && py > box.y - 4 && py < box.y + box.h + 4) continue;
      const dx = px - fx, dy = py - fy, dist = Math.hypot(dx, dy);
      const idx = Math.floor(t * (.15 + 1.1 * hash(c, r, 7)) + hash(c, r, 8) * 60);
      let a = calm ? .05 + .03 * hash(c, r, 3) : .06 + .04 * Math.sin(t * .5 + c * .21 + r * .17);
      a += .2 * Math.exp(-Math.pow(dist / R2, 2));
      if (!calm) { a += .28 * Math.pow(Math.max(0, Math.sin(dist * .03 - t * 1.1)), 16) * Math.max(.2, 1 - dist / 640); if (hash(c, r, idx + 9) > .97) a += .18; }
      if (!ph && px < askRight + 10) a *= .5;
      if (ph) a *= .55;
      if (a < .02) continue;
      const rgb = dist < R2 * 1.15 ? tint : GROUPS[(c * 3 + r) % GROUPS.length].rgb;
      x.fillStyle = sty(rgb, a);
      x.fillText(glyph(c, r, idx), px, py);
    }
  }
  $$('canvas.corb', ans).forEach(cv => {
    const g = fit(cv); if (!g) return;
    g.x.clearRect(0, 0, g.w, g.h); g.x.textAlign = 'center'; g.x.textBaseline = 'middle';
    drawOrb(g.x, g.w / 2, g.h / 2, Math.min(g.w, g.h) / 2 - 3, cv.dataset.rgb, cv.dataset.id, t, { calm });
  });
}
function redraw() { try { frame(RM() ? RM_T : nowT()); } catch (e) { console.error(e); } }
function tick(ts) {
  if (D.hidden || RM() || frozen != null) return;
  if(nowT()>=8){frozen=8;redraw();return;}
  if(ts-last>=50){last=ts;redraw();}
  requestAnimationFrame(tick);
}
D.addEventListener('visibilitychange',()=>{if(!D.hidden&&!RM()&&frozen==null)requestAnimationFrame(tick);});

function applyRM(){R.classList.toggle('rm',RM());}
/* ---------- layout ---------- */
function onResize(force) {
  R.dataset.win = winOf();
  const lay = layOf(); app.dataset.tall = app.clientHeight >= 860 ? '1' : '0'; app.dataset.roomy = app.clientHeight >= 760 ? '1' : '0';
  const changed = lay !== app.dataset.lay;
  app.dataset.lay = lay;
  if (changed || force) {
    place();
    if (lay !== lastLay && lastLay !== null) {
      if (lay === 'ph' && preset) { cur = null; preset = false; mo = true; }
      else if (lay !== 'ph' && !cur) { cur = { t: 'q', id: FIRST_Q }; preset = true; mo = false; }
      else if (lay === 'ph' && !cur) mo = true;
      else if (lay !== 'ph') mo = false;
    }
    lastLay = lay; renderAll();
  }
  chrome(); toBottom(); redraw();
}

/* ---------- events ---------- */
D.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button,a'); if (!t) return;
  if (t.dataset.q) { select({ t: 'q', id: t.dataset.q }, { keepFocus: !isPh() }); return; }
  if (t.dataset.w) { const fromAz = !!t.closest('.azp'); select({ t: 'w', id: t.dataset.w }, { keepFocus: !isPh() && !fromAz, focusBig: fromAz && !isPh() }); return; }
  if (t.dataset.chip !== undefined && t.classList.contains('chip')) { setChip(chip === t.dataset.chip ? null : t.dataset.chip || null); return; }
  if (t.dataset.az) { openAZ(); return; }
  if (t.dataset.clear) { setQuery(''); inp.focus(); return; }
});
inp.addEventListener('input', () => setQuery(inp.value));
inp.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); const b = best(); if (b) { select(b, { keepFocus: true }); if (isPh()) inp.blur(); } }
  else if (e.code === 'Escape') { if (query) { e.stopPropagation(); setQuery(''); } else inp.blur(); }
});
clr.addEventListener('click', () => { setQuery(''); inp.focus(); });
askb.addEventListener('click', () => { if (az) { closeAZ(false); mo = true; } else mo = !mo; chrome(); toBottom(); });
const azToggle = () => { if (az) closeAZ(true); else openAZ(); };
azb.addEventListener('click', azToggle); azbtn.addEventListener('click', azToggle);
$('#azx').addEventListener('click', () => closeAZ(true));
/* the arrows walk through the questions */
ask.addEventListener('keydown', e => {
  const b = e.target.closest && e.target.closest('.opt'); if (!b) return;
  const all = $$('.opt', ask), i = all.indexOf(b), rv = isPh(); let j = -1;
  if (e.code === 'ArrowDown') j = Math.max(0, Math.min(all.length - 1, i + (rv ? -1 : 1)));
  else if (e.code === 'ArrowUp') j = Math.max(0, Math.min(all.length - 1, i + (rv ? 1 : -1)));
  else if (e.code === 'Home') j = 0; else if (e.code === 'End') j = all.length - 1;
  if (j >= 0) { e.preventDefault(); all[j].focus(); }
});
D.addEventListener('keydown', e => {
  if (e.getModifierState('Meta') || e.getModifierState('Control') || e.getModifierState('Alt')) return;
  if(az && e.key==='Tab'){const nodes=$$('button,a[href],input',azp).filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&D.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&D.activeElement===last){e.preventDefault();first.focus();}return;}
  const a = D.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  if (e.code === 'Escape' && !e.defaultPrevented) {
    if (az) closeAZ(true);
    else if (isPh() && mo && cur) { mo = false; chrome(); askb.focus(); }
    return;
  }
  if (typing) return;
});
addEventListener('pointerdown', () => { R.dataset.input = 'ptr'; }, true);
addEventListener('keydown', e => { if (!/^(Shift|Control|Alt|Meta)/.test(e.code)) R.dataset.input = 'kbd'; }, true);
addEventListener('hashchange', () => { const s = selFromHash(); if (s) select(s, { keepFocus: true }); });
function selFromHash() {
  const h = location.hash, mq = /^#(?:q|question)-([a-z0-9-]+)$/.exec(h), mt = /^#term-([a-z0-9-]+)$/.exec(h);
  if (mq && QUES[mq[1]]) return { t: 'q', id: mq[1] };
  if (mt && WORD[mt[1]]) return { t: 'w', id: mt[1] };
  return null;
}
/* the soft input panel of a phone: the dock rides above it (not measured on a real iPhone) */
if (window.visualViewport) {
  const stageRule=Array.from(D.styleSheets).flatMap(sheet=>Array.from(sheet.cssRules)).find(rule=>rule.selectorText==='#stage');
  const vv = window.visualViewport, onvv = () => { const kb = (D.activeElement === inp && isPh()) ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0; if(stageRule){if(kb){stageRule.style.height=vv.height+'px';onResize();}else stageRule.style.removeProperty('height');} };
  vv.addEventListener('resize', onvv); vv.addEventListener('scroll', onvv); inp.addEventListener('blur', onvv); inp.addEventListener('focus', onvv);
}
if (mqRM.addEventListener) mqRM.addEventListener('change', () => { applyRM(); redraw();if(!RM()&&frozen==null)requestAnimationFrame(tick); });
const ro = new ResizeObserver(() => onResize());
ro.observe(app); ro.observe(dock);
addEventListener('resize', () => onResize());

/* Enhance only after the skeleton is ready; HTML fallback remains for no-JS visitors. */
(function init(){
 R.classList.add('enhanced'); applyRM();
 app.dataset.lay=layOf();app.dataset.tall=app.clientHeight>=860?'1':'0';app.dataset.roomy=app.clientHeight>=760?'1':'0';lastLay=app.dataset.lay;
 place();resetStart();renderAll();
 const selected=selFromHash();if(selected){cur=selected;preset=false;mo=false;renderAll();}
 onResize(true);redraw();requestAnimationFrame(tick);
})();
})();
