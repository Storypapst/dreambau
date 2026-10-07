
const styles = new Map(), sharedRules = new Map(); let ruleCount = 0;
const sheet = [...document.styleSheets].find(s => s.href && s.href.endsWith('/references.css'));
function css(el, name, value) {
 const key=el.id || (el.dataset.id?'node-'+el.dataset.id:'band'), id='ref-layout-'+key;
 let rule=styles.get(key);
 if(!rule){const n=sheet.cssRules.length;sheet.insertRule('.'+id+'{}',n);rule=sheet.cssRules[n].style;styles.set(key,rule);}
 el.classList.add(id);rule.setProperty(name,value);
}
function absorbStyles() {document.querySelectorAll('[data-css]').forEach(el=>{const declaration=el.dataset.css;let id=sharedRules.get(declaration);if(!id){id='ref-token-'+(++ruleCount);sheet.insertRule('.'+id+'{'+declaration+'}',sheet.cssRules.length);sharedRules.set(declaration,id);}el.classList.add(id);el.removeAttribute('data-css');});}
// Port of selected Referenzen C; prototype controls and fabricated media are excluded.
let referenceTimeline;

/* ---- shared core (copied into every variant on purpose: each file stays self-contained) ---- */
(() => {
'use strict';
const D = document, R = D.documentElement;
const $ = (s, r = D) => r.querySelector(s), $$ = (s, r = D) => Array.from(r.querySelectorAll(s));
const Q = new URLSearchParams(location.search);
const E = JSON.parse(document.querySelector('#reference-data').content.textContent);
const LABELS = {"de":{"title":"Referenzen","sub":"Was gebaut wurde und für wen.","back":"Startseite","cur":"Aktuelle Projekte","old":"Ältere Referenzen","search":"Suchen","searchPh":"Name, Jahr oder Stichwort","clear":"Suche leeren","filter":"Filter","filterTitle":"Filter","secTitle":"Bereich","secAll":"Alle","secCur":"Aktuell","secOld":"Älter","tagsTitle":"Tags","reset":"Filter zurücksetzen","show1":"1 Eintrag anzeigen","showN":"{n} Einträge anzeigen","showNone":"Keine Treffer","count":"{n} von {m} Einträgen","none":"Keine Treffer","noneHelp":"Suchbegriff kürzen oder den Filter zurücksetzen.","open":"Öffnen","close":"Schließen","closeView":"Projektansicht schließen","view":"Projektansicht","year":"Jahr","client":"Projekt / Auftraggeber","scope":"Umfang","short":"Kurztext","lang":"Sprache","now":"jetzt","entries":"Einträge","draft":"Entwurf, von Frank freizugeben","pending":"Kurztext folgt","linkPending":"Link folgt","st_live":"Online","st_soon":"Bald geht‘s los","st_unk":"Status folgt","enTitle":"Text auf Englisch","same":"siehe Aktuelle Projekte","noView":"ohne Projektansicht","what":"Was","role":"Rolle","tasks":"Aufgaben","status":"Status","links":"Links","imageSlot":"Bild oder Video (Platzhalter)","video":"Video (nicht eingebettet)","slides":"Folien","impressum":"Impressum","datenschutz":"Datenschutz","teamwork":"Teamwork","axis":"Zeitstrahl","axisBreak":"Skala gekürzt","hint":"Einen Punkt anwählen, um die Projektansicht zu öffnen.","legend":"Legende","tag":{"website":"Website","plattform":"Plattform","redesign":"Redesign","prozess":"Prozess-Software","opensource":"Open Source","bildung":"Bildung","designsystem":"Design-System"}},"fi":{"title":"Referenssit","sub":"Mitä on rakennettu ja kenelle.","back":"Takaisin etusivulle","cur":"Ajankohtaiset projektit","old":"Aiemmat referenssit","search":"Hae","searchPh":"Nimi, vuosi tai hakusana","clear":"Tyhjennä haku","filter":"Suodata","filterTitle":"Suodattimet","secTitle":"Osio","secAll":"Kaikki","secCur":"Ajankohtaiset","secOld":"Aiemmat","tagsTitle":"Tunnisteet","reset":"Palauta suodattimet","show1":"Näytä 1 kohde","showN":"Näytä {n} kohdetta","showNone":"Ei hakutuloksia","count":"{n} / {m} kohteesta","none":"Ei hakutuloksia","noneHelp":"Lyhennä hakusanaa tai palauta suodattimet.","open":"Avaa","close":"Sulje","closeView":"Sulje projektinäkymä","view":"Projektinäkymä","year":"Vuosi","client":"Projekti / toimeksiantaja","scope":"Laajuus","short":"Lyhyt kuvaus","lang":"Kieli","now":"nyt","entries":"kohdetta","draft":"Luonnos, Frankin hyväksyttävänä","pending":"Lyhyt kuvaus tulossa","linkPending":"Linkki tulossa","st_live":"Verkossa","st_soon":"Pian käynnistyy","st_unk":"Tila selviää myöhemmin","enTitle":"Teksti englanniksi","same":"katso Ajankohtaiset projektit","noView":"ei projektinäkymää","what":"Mitä","role":"Rooli","tasks":"Tehtävät","status":"Tila","links":"Linkit","imageSlot":"Kuva tai video (paikkamerkki)","video":"Video (ei upotettu)","slides":"Kuvat","impressum":"Julkaisijatiedot","datenschutz":"Tietosuoja","teamwork":"Teamwork","axis":"Aikajana","axisBreak":"Asteikkoa lyhennetty","hint":"Valitse piste avataksesi projektinäkymän.","legend":"Selite","tag":{"website":"Verkkosivusto","plattform":"Alusta","redesign":"Uudistus","prozess":"Prosessiohjelmisto","opensource":"Avoin lähdekoodi","bildung":"Koulutus","designsystem":"Suunnittelujärjestelmä"}},"ar":{"title":"المراجع","sub":"ما تم بناؤه ولمن.","back":"الصفحة الرئيسية","cur":"المشاريع الحالية","old":"المراجع السابقة","search":"بحث","searchPh":"الاسم أو السنة أو كلمة مفتاحية","clear":"مسح البحث","filter":"تصفية","filterTitle":"التصفية","secTitle":"القسم","secAll":"الكل","secCur":"الحالية","secOld":"السابقة","tagsTitle":"الوسوم","reset":"إعادة ضبط التصفية","show1":"عرض إدخال واحد","showN":"عرض {n} من الإدخالات","showNone":"لا توجد نتائج","count":"{n} من {m} إدخالات","none":"لا توجد نتائج","noneHelp":"اختصر كلمة البحث أو أعد ضبط التصفية.","open":"فتح","close":"إغلاق","closeView":"إغلاق عرض المشروع","view":"عرض المشروع","year":"السنة","client":"المشروع / العميل","scope":"النطاق","short":"نص قصير","lang":"اللغة","now":"الآن","entries":"إدخالات","draft":"مسودة، بانتظار موافقة فرانك","pending":"النص القصير لاحقًا","linkPending":"الرابط لاحقًا","st_live":"متاح على الإنترنت","st_soon":"يبدأ قريبًا","st_unk":"الحالة لاحقًا","enTitle":"النص بالإنجليزية","same":"انظر المشاريع الحالية","noView":"بدون عرض للمشروع","what":"ماذا","role":"الدور","tasks":"المهام","status":"الحالة","links":"الروابط","imageSlot":"صورة أو فيديو (عنصر نائب)","video":"فيديو (غير مضمّن)","slides":"الشرائح","impressum":"بيانات النشر","datenschutz":"حماية البيانات","teamwork":"Teamwork","axis":"الخط الزمني","axisBreak":"المقياس مختصر","hint":"اختر نقطة لفتح عرض المشروع.","legend":"المفتاح","tag":{"website":"موقع إلكتروني","plattform":"منصة","redesign":"إعادة تصميم","prozess":"برنامج العمليات","opensource":"مفتوح المصدر","bildung":"تعليم","designsystem":"نظام تصميم"}}};
const TAGS = ['website', 'plattform', 'redesign', 'prozess', 'opensource', 'bildung', 'designsystem'];
const LANG = LABELS[Q.get('lang')] ? Q.get('lang') : 'de', DIR = LANG === 'ar' ? 'rtl' : 'ltr';
R.lang = LANG; R.dir = DIR;
const L = (k, v) => { let s = LABELS[LANG][k]; if (s == null) s = LABELS.de[k]; return v ? s.replace(/\{(\w+)\}/g, (_, n) => v[n]) : s; };
const tagL = id => (LABELS[LANG].tag[id] != null ? LABELS[LANG].tag[id] : LABELS.de.tag[id]);
const byId = Object.fromEntries(E.map(e => [e.id, e]));
const COL = { cur: '255,190,100', old: '56,214,255', live: '198,242,58', en: '169,139,255', neu: '200,208,224', hi: '240,246,255' };
const NEU = COL.neu;
const MONO = 'ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans Mono CJK JP",monospace';
const titleOf = e => e.title || e.client;
const scopeOf = e => (e.sent != null ? e.sent : (e.scope || '').trim());
const vt = s => String(s).replace(/[\s‍]+$/, '');   // trailing blanks and zero-width joiners are invisible: dropped for display only, the data stays verbatim
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EN = (s, tag, cls) => `<${tag || 'span'}${cls ? ` class="${cls}"` : ''} lang="en" dir="ltr">${esc(vt(s))}</${tag || 'span'}>`;
const hl = (s, q) => {
  s = String(s); if (!q) return esc(s);
  const lo = s.toLowerCase(), k = q.toLowerCase(); let i = 0, out = '', j;
  while ((j = lo.indexOf(k, i)) >= 0) { out += esc(s.slice(i, j)) + '<mark>' + esc(s.slice(j, j + k.length)) + '</mark>'; i = j + k.length; }
  return out + esc(s.slice(i));
};

/* ---- deterministic noise: every picture is a pure function of time, so any frame can be reproduced ---- */
const G = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFXZ<>{}[]/=+*:;#$%&¦';
const hash = (a, b, c) => { let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const glyph = (a, b, c) => G[Math.floor(hash(a, b, c) * G.length)];
const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };
const _st = {};
const sty = (rgb, a) => { const q = Math.max(0, Math.min(1, Math.round(a * 40) / 40)); const k = rgb + '|' + q; return _st[k] || (_st[k] = 'rgba(' + rgb + ',' + q + ')'); };
const mix = (a, b, k) => { const p = a.split(',').map(Number), q = b.split(',').map(Number); return p.map((v, i) => Math.round(v * (1 - k) + q[i] * k)).join(','); };

/* ---- state ---- */
const mq = matchMedia('(prefers-reduced-motion: reduce)');
const S = { q: Q.get('q') || '', sec: 'all', tags: new Set(), open: null, vis: [], visSet: new Set() };
const RM = () => mq.matches;
const RM_T = 4.6;
let V = null, app = null, last = 0, lastArt = 0, raf = 0, resizeObs = null;
const t0 = performance.now();
const nowT = () => (performance.now() - t0) / 1000;
const isPhone = () => !!app && app.clientWidth < 900;

const SCR = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>=';
function decode(node, text, o = {}) {
  if (!node) return;
  if (node._r) cancelAnimationFrame(node._r);
  if (RM()) { node.textContent = text; return; }
  const dur = o.dur || 520, s0 = performance.now() + (o.delay || 0), n = text.length;
  const step = now => {
    if (RM()) { node.textContent = text; node._r = 0; return; }
    const p = (now - s0) / dur;
    if (p < 0) { node._r = requestAnimationFrame(step); return; }
    if (p >= 1) { node.textContent = text; node._r = 0; return; }
    let out = '';
    for (let i = 0; i < n; i++) { const c = text[i]; out += c === ' ' ? ' ' : (p > (i / n) * .55 + .45 ? c : SCR[(Math.random() * SCR.length) | 0]); }
    node.textContent = out;
    node._r = requestAnimationFrame(step);
  };
  node._r = requestAnimationFrame(step);
}
function fit(c) {
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return null;
  const d = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * d), H = Math.round(h * d);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.setTransform(d, 0, 0, d, 0, 0);
  return { x, w, h };
}
function rel(el, base) {
  const a = base.getBoundingClientRect(), r = el.getBoundingClientRect(), k = a.width / (base.offsetWidth || 1) || 1;
  return { x: (r.left - a.left) / k, y: (r.top - a.top) / k, w: r.width / k, h: r.height / k };
}

/* ---- drawn placeholder pictures: glyphs in the site's character style; a motif says what kind of thing it stands for ---- */
const sd = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
const ln = (d, th) => Math.max(0, 1 - d / th);
function rectO(u, v, x0, y0, x1, y1, th) { return ln(Math.min(sd(u, v, x0, y0, x1, y0), sd(u, v, x0, y1, x1, y1), sd(u, v, x0, y0, x0, y1), sd(u, v, x1, y0, x1, y1)), th); }
function shape(m, u, v, ar, sh) {
  const X = (u - .5) * ar, Y = v - .5, uv = (a, b) => [a, b], th = .035;
  switch (m) {
    case 'rings': { const d = Math.hypot(X, Y); return d < .47 ? Math.max(0, Math.abs(Math.sin(d * 18)) - .7) * 3.4 * (1 - d * 1.2) : 0; }
    case 'sun': { const d = Math.hypot(X, Y), a = Math.atan2(Y, X), pet = .15 + .12 * Math.abs(Math.cos(a * 4.5)); return d < .08 ? 1 : d < pet ? .85 : d < pet + .05 ? 1 - (d - pet) / .05 : 0; }
    case 'frame': return Math.max(rectO(u, v, .1, .12, .9, .88, th), ln(sd(u, v, .1, .3, .9, .3), th), v > .4 && v < .8 && ((u > .16 && u < .46) || (u > .54 && u < .84 && v < .58) || (u > .54 && u < .84 && v > .64)) ? .55 : 0);
    case 'blocks': { let s = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) s = Math.max(s, rectO(u, v, .1 + i * .29, .12 + j * .42, .31 + i * .29, .46 + j * .42, th) * .9); return s; }
    case 'flow': { let s = 0; for (let i = 0; i < 4; i++) { const cx = .14 + i * .24; s = Math.max(s, rectO(u, v, cx - .08, .36, cx + .08, .64, th)); if (i < 3) s = Math.max(s, ln(sd(u, v, cx + .09, .5, cx + .15, .5), th), ln(sd(u, v, cx + .13, .44, cx + .15, .5), th), ln(sd(u, v, cx + .13, .56, cx + .15, .5), th)); } return s; }
    case 'nodes': { const P = []; for (let i = 0; i < 6; i++) P.push([.14 + .72 * hash(i, 1, sh), .2 + .6 * hash(i, 2, sh)]); let s = 0; for (let i = 0; i < 5; i++) s = Math.max(s, ln(sd(u, v, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]), .03) * .8); s = Math.max(s, ln(sd(u, v, P[0][0], P[0][1], P[3][0], P[3][1]), .03) * .7); for (const p of P) s = Math.max(s, ln(Math.hypot((u - p[0]) * ar, v - p[1]), .07)); return s; }
    case 'path': { const f = x => .56 - .2 * Math.sin(x * 5.2 + (sh & 3)); let s = ln(Math.abs(v - f(u)), .05); for (const k of [.1, .3, .55, .8]) s = Math.max(s, ln(Math.hypot((u - k) * ar, v - f(k)), .06)); return s; }
    case 'house': return Math.max(ln(sd(u, v, .3, .46, .5, .18), th), ln(sd(u, v, .5, .18, .7, .46), th), rectO(u, v, .34, .46, .66, .84, th), rectO(u, v, .46, .62, .54, .84, th) * .8);
    case 'pair': { const c1 = Math.hypot((u - .28) * ar, v - .5), c2 = Math.hypot((u - .72) * ar, v - .5); return Math.max(ln(Math.abs(c1 - .25), .04), ln(Math.abs(c2 - .25), .04), ln(sd(u, v, .4, .5, .6, .5), th), ln(sd(u, v, .56, .44, .6, .5), th), ln(sd(u, v, .56, .56, .6, .5), th)); }
    default: return 0;
  }
}
const ARTS = new Set();
function drawArt(cv, t) {
  const f = fit(cv); if (!f) return;
  const { x, w, h } = f, d = cv.dataset, cw = +d.cw || 11, ch = Math.round(cw * 1.3), cols = Math.ceil(w / cw), rows = Math.ceil(h / ch), ar = w / h;
  const calm = RM() || d.calm === '1', sh = strHash(d.art), rgb = d.rgb || COL.old, mo = d.motif;
  x.clearRect(0, 0, w, h);
  x.font = (cw + 1) + 'px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const s = shape(mo, (c + .5) / cols, (r + .5) / rows, ar, sh), hv = hash(c, r, sh);
    let a = .04 + .045 * hv + s * (.66 + .34 * hv);
    if (!calm) a += .04 * Math.sin(t * 1.3 + c * .4 + r * .3);
    if (a < .05) continue;
    const idx = calm ? Math.floor(hv * 30) : Math.floor(t * (.35 + 2 * hv) + hv * 30);
    x.fillStyle = s > .5 && hv > .66 ? sty(COL.hi, Math.min(1, a + .12)) : sty(rgb, Math.min(1, a));
    x.fillText(glyph(c, r, idx + sh), (c + .5) * cw, (r + .5) * ch);
  }
}
function paintArts(root) {
  $$('canvas[data-art]', root || D).forEach(cv => { ARTS.add(cv); drawArt(cv, RM() ? RM_T : nowT()); });
}
const artHTML = (cls, seed, motif, rgb, cw, extra) => `<canvas class="${cls}" data-art="${esc(seed)}" data-motif="${motif}" data-rgb="${rgb}"${cw ? ` data-cw="${cw}"` : ''} aria-hidden="true"${extra || ''}></canvas>`;

/* ---- the character field behind the page ---- */
function drawField(cv, t, spec) {
  const f = fit(cv); if (!f) return;
  const { x, w, h } = f, calm = RM(), ph = isPhone(), cw = ph ? 15 : 16, ch = ph ? 19 : 20, cols = Math.ceil(w / cw), rows = Math.ceil(h / ch);
  x.clearRect(0, 0, w, h);
  x.font = (ph ? 11 : 12) + 'px ' + MONO; x.textAlign = 'center'; x.textBaseline = 'middle';
  const hot = spec.hot ? spec.hot() : [];
  for (let r = 0; r < rows; r++) {
    const py = r * ch + ch / 2;
    for (let c = 0; c < cols; c++) {
      const px = c * cw + cw / 2, tn = spec.tint(px, py, w, h);
      const rate = .15 + 1.1 * hash(c, r, 7), idx = Math.floor(t * rate + hash(c, r, 8) * 60);
      let a = calm ? .05 + .03 * hash(c, r, 3) : .06 + .04 * Math.sin(t * .5 + c * .21 + r * .17);
      if (!calm && hash(c, r, idx + 9) > .965) a += .2;
      a *= tn.gain; let rgb = tn.rgb;
      for (let i = 0; i < hot.length; i++) {
        const q = hot[i], d = q.w != null ? Math.hypot(Math.max(q.x - px, 0, px - q.x - q.w), Math.max(q.y - py, 0, py - q.y - q.h)) : Math.hypot(px - q.x, py - q.y) - q.r;
        if (d < q.k) { const k = 1 - Math.max(0, d) / q.k, v = (q.v || .5) * k * k; if (v > a * .5) { a += v; rgb = q.rgb; } }
      }
      if (a < .02) continue;
      x.fillStyle = sty(rgb, a);
      x.fillText(glyph(c, r, idx), px, py);
    }
  }
}

/* ---- small html parts ---- */
const enChip = e => (e.lang === 'en' ? `<abbr class="en" title="${esc(L('enTitle'))}">EN</abbr>` : '');
const stChip = e => (e.status ? `<span class="st st-${e.status}"><i></i>${esc(L('st_' + e.status))}</span>` : '');
const tagsHTML = e => (e.tags.length ? `<ul class="tags" aria-label="Tags">${e.tags.map(t => `<li>${esc(tagL(t))}</li>`).join('')}</ul>` : '');
const linksHTML = e => `<div class="lks">${e.links.length ? e.links.map(l => l.href ? `<a class="lk" href="${esc(l.href)}">${esc(l.u)}</a>` : `<span class="lk none" dir="ltr">${esc(l.u)} · nicht geprüft</span>`).join('') : `<span class="lk none">${esc(L('linkPending'))}</span>`}</div>`;
const sameHTML = e => (e.same ? `<a class="same" href="#${e.same}">${esc(L('same'))}</a>` : '');
function viewHTML(e, o = {}) {
  const cur = e.sec === 'cur', rgb = cur ? COL.cur : COL.old, H = o.h || 2;
  const links = linksHTML(e);
  if (e.view) {
    const v = e.view;
    const meta = o.meta === false ? '' : `<div class="pv-meta"><span class="y">${esc(e.year)}</span>${EN(e.client, 'span', 'c')}${EN(e.scope.trim(), 'span')}${enChip(e)}</div>`;
    const top = [['what', v.top1], ['role', v.top2], ['tasks', v.top3]].map(([k, s]) => `<div class="pv-c"><dt>${esc(L(k))}</dt><dd>${EN(s, 'p')}</dd></div>`).join('');
    const image = m => `<img loading="lazy" src="${esc(m.src)}" alt="${esc(e.client)} · ${esc(m.label)}">`;
    const gal = e.images.slice(0,5).map(image).join('');
    const sl = e.images.slice(5).map(m=>`<figure>${image(m)}<figcaption lang="en" dir="ltr">${esc(m.label)}</figcaption></figure>`).join('');
    return `<article class="pv" aria-labelledby="pvt-${e.id}">${meta}
<header class="pv-hd" data-css="--zc:${rgb}">${e.media ? `<img class="pv-art" src="${esc(e.media)}" alt="">` : ''}<dl class="pv-top">${top}</dl><div class="pv-tt"><h${H} class="pv-title" id="pvt-${e.id}" lang="en" dir="ltr">${esc(vt(v.title))}</h${H}></div></header>
<section class="pv-sec" data-css="--zc:${rgb}">${EN(v.briefLabel, 'h' + (H + 1))}${EN(v.brief, 'p')}</section>
<div class="pv-gal">${gal}</div>
<section class="pv-sec" data-css="--zc:${rgb}">${EN(v.challengeLabel, 'h' + (H + 1))}${EN(v.challenge, 'p')}</section>
<div class="pv-sl" role="group" aria-label="${esc(L('slides'))}">${sl}</div>
<section class="pv-sec" data-css="--zc:${rgb}">${EN(v.stackLabel, 'h' + (H + 1))}${EN(v.stack, 'p')}</section>
${links}<details class="pv-sec"><summary class="pill">Originaltext · EN</summary><p class="original" lang="en" dir="ltr">${esc(e.original)}</p></details></article>`;
  }
  const sent = e.sent ? `<p class="pv-sent" lang="de" dir="ltr">${esc(e.sent)}</p><span class="draft">${esc(L('draft'))}</span>` : `<p class="pv-sent pending">${esc(L('pending'))}</p>`;
  return `<article class="pv cur" aria-labelledby="pvt-${e.id}">
<header class="pv-hd" data-css="--zc:${rgb}">${artHTML('pv-art', e.id + ':hd', e.motif, rgb, 13)}<div class="pv-tt"><h${H} class="pv-title" id="pvt-${e.id}">${esc(e.title)}</h${H}>${stChip(e)}</div></header>
<div class="pv-body">${sent}${tagsHTML(e)}${links}</div>
<figure class="pv-slot">${artHTML('', e.id + ':slot', e.motif, rgb, 10)}<figcaption>${esc(L('imageSlot'))}</figcaption></figure></article>`;
}

/* ---- filter ---- */
const norm = s => String(s).toLowerCase();
const hay = e => norm([titleOf(e), e.year || L('now'), e.scope || '', e.sent || '', e.tags.map(tagL).join(' '), e.status ? L('st_' + e.status) : ''].join(' \n '));
const matches = e => (S.sec === 'all' || S.sec === e.sec) && (!S.tags.size || e.tags.some(t => S.tags.has(t))) && (!S.q.trim() || hay(e).includes(norm(S.q.trim())));
const active = () => (S.q.trim() ? 1 : 0) + (S.sec !== 'all' ? 1 : 0) + S.tags.size;
const secList = sec => E.filter(e => e.sec === sec && S.visSet.has(e.id));
const svg = (p, w = 18) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICO = { search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', back: '<path d="M15 5l-7 7 7 7"/>' };
function filterHTML() {
  const sec = [['all', 'secAll'], ['cur', 'secCur'], ['old', 'secOld']].map(([k, l]) => `<button type="button" class="fchip" data-sec="${k}" aria-pressed="false">${esc(L(l))}</button>`).join('');
  const tags = TAGS.map(t => `<button type="button" class="fchip" data-tag="${t}" aria-pressed="false">${esc(tagL(t))}</button>`).join('');
  return `<div class="fbar"><label class="fsearch"><span class="sr">${esc(L('search'))}</span><span class="ico">${svg(ICO.search)}</span><input id="q" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${esc(L('searchPh'))}"><button type="button" class="fclear" id="fclear" aria-label="${esc(L('clear'))}" hidden>${svg(ICO.x, 16)}</button></label><button type="button" class="pill fbtn" id="fbtn" aria-haspopup="dialog">${svg(ICO.filter)}<span>${esc(L('filter'))}</span><b id="fbadge" hidden></b></button></div>
<div class="fpanel" id="fpanel"><div class="fgroup fg-sec" role="group" aria-label="${esc(L('secTitle'))}"><span class="flab" aria-hidden="true">${esc(L('secTitle'))}</span>${sec}</div><div class="fgroup fg-tags" role="group" aria-label="${esc(L('tagsTitle'))}"><span class="flab" aria-hidden="true">${esc(L('tagsTitle'))}</span>${tags}</div><div class="fnote"><span class="fres" id="fres"></span><button type="button" class="pill freset" data-act="reset">${esc(L('reset'))}</button></div></div>`;
}
function emptyHTML() {
  return `<div class="empty" role="group" aria-labelledby="empt"><span class="gl" aria-hidden="true">∅</span><h2 id="empt">${esc(L('none'))}${S.q.trim() ? ' · „' + esc(S.q.trim()) + '“' : ''}</h2><p>${esc(L('noneHelp'))}</p><button type="button" class="pill pri" data-act="reset">${esc(L('reset'))}</button></div>`;
}
function resetFilter() { S.q = ''; S.sec = 'all'; S.tags.clear(); const q = $('#q'); if (q) q.value = ''; refresh(); }
function syncFilterUI() {
  $$('[data-sec]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sec === S.sec)));
  $$('[data-tag]').forEach(b => b.setAttribute('aria-pressed', String(S.tags.has(b.dataset.tag))));
  const q = $('#q'); if (q && q.value !== S.q) q.value = S.q;
  const n = S.vis.length, m = E.length;
  $('#fclear').hidden = !S.q;
  const bd = $('#fbadge'); bd.hidden = !active(); bd.textContent = active();
  const msg = L('count', { n, m });
  $('#fres').textContent = msg; $('#meta').textContent = msg; $('#live').textContent = n ? msg : L('none');
  const sh = $('#fsshow'); sh.disabled = !n; sh.textContent = n ? (n === 1 ? L('show1') : L('showN', { n })) : L('showNone');
}
function refresh() {
  S.vis = E.filter(matches).map(e => e.id); S.visSet = new Set(S.vis);
  syncFilterUI();
  V.render(); layoutAll();
  if (S.open && !S.visSet.has(S.open) && !V.docked) closeEntry();
}

/* ---- modal helper (sheets and dialogs): inert background, focus in, focus back ---- */
const Mo = { cur: null, opener: null };
function modalShow(el, opener) {
  if (Mo.cur && Mo.cur !== el) modalHide(Mo.cur, false);
  Mo.cur = el; Mo.opener = opener || D.activeElement;
  el.inert = false; el.setAttribute('aria-hidden', 'false');
  $$('#app > .top, #app > .filter, #app > .scroll').forEach(n => { n.inert = true; });
  el.classList.add('on'); D.documentElement.classList.add('modal-open');
  const f = $('[data-autofocus]', el) || el;
  requestAnimationFrame(() => { try { f.focus({ preventScroll: true }); if (!el.contains(D.activeElement)) ($('.msheet', el) || el).focus({ preventScroll: true }); } catch (_) { /* */ } });
}
function modalHide(el, restore) {
  el.classList.remove('on'); el.inert = true; el.setAttribute('aria-hidden', 'true');
  if (Mo.cur === el) D.documentElement.classList.remove('modal-open');
  $$('#app > .top, #app > .filter, #app > .scroll').forEach(n => { n.inert = false; });
  const op = Mo.opener; if (Mo.cur === el) { Mo.cur = null; Mo.opener = null; }
  if (restore !== false && op && op.isConnected) { try { op.focus({ preventScroll: true }); } catch (_) { /* */ } }
}

/* ---- address of an opened entry: #id. Deep links get a base entry below, so Back always closes. ---- */
const baseUrl = () => location.href.split('#')[0];
const entryFromHash = () => { let id = ''; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { /* */ } const e = byId[id]; return e && e.openable ? e : null; };
function sync(initial) {
  const e = entryFromHash(), prev = S.open;
  if (e && !S.visSet.has(e.id)) { S.q = ''; S.sec = 'all'; S.tags.clear(); refresh(); }
  S.open = e ? e.id : null;
  if (prev !== S.open || initial) V.setOpen(S.open, prev, !!initial);
}
function openEntry(id) { if (S.open === id) return; if (S.open) { history.replaceState({ m: 1 }, '', baseUrl() + '#' + id); sync(); } else { history.pushState({ m: 1 }, '', baseUrl() + '#' + id); sync(); } }
function closeEntry() {
  if (!S.open) return;
  if (history.state && history.state.m) history.back();
  else { history.replaceState(null, '', baseUrl()); sync(); }
}

function placeFilter() {
  const fp = $('#fpanel'), fs = $('#fsbody'), fl = $('.filter'), sc = $('#scroll');
  if (!fp) return;
  const ph = isPhone(), a = D.activeElement;
  if (ph && fp.parentNode !== fs) fs.appendChild(fp);
  else if (!ph && fp.parentNode !== fl) { fl.appendChild(fp); if (Mo.cur === $('#fsheet')) modalHide($('#fsheet'), false); }
  /* tab order follows what is on screen: dock below the list on a phone, bar above it on a desktop */
  if (ph && fl.previousElementSibling !== sc) { app.insertBefore(fl, sc.nextSibling); }
  else if (!ph && fl.nextElementSibling !== sc) { app.insertBefore(fl, sc); }
  if (a && a !== D.body && a.isConnected && D.activeElement !== a) { try { a.focus({ preventScroll: true }); } catch (_) { /* */ } }
}
function layoutAll() {
  if (!app) return;
  placeFilter();
  absorbStyles(); if (V.layout) V.layout(); absorbStyles();
  redraw();
}
function redraw() {
  try { if (V.frame) V.frame(RM() ? RM_T : nowT()); } catch (e) { console.error(e); }
  if (RM()) { ARTS.forEach(cv => { if (cv.isConnected) drawArt(cv, RM() ? RM_T : nowT()); else ARTS.delete(cv); }); }
}
function tick(ts) {
  if (RM()) { raf = 0; return; }
  raf = requestAnimationFrame(tick);
  if (D.hidden || ts - last < 50) return;
  last = ts;
  try { if (V.frame) V.frame(nowT()); } catch (e) { console.error(e); }
  if (ts - lastArt > 110) { lastArt = ts; ARTS.forEach(cv => { if (cv.isConnected) { if (cv.offsetParent) drawArt(cv, nowT()); } else ARTS.delete(cv); }); }
}
function loop() { if (!raf && !RM()) raf = requestAnimationFrame(tick); }

function wire() {
  D.addEventListener('click', e => {
    const t = e.target; let b;
    if ((b = t.closest('[data-act="reset"]'))) { resetFilter(); const q = $('#q'); if (q && !isPhone()) q.focus(); return; }
    if ((b = t.closest('[data-sec]'))) { S.sec = b.dataset.sec; refresh(); return; }
    if ((b = t.closest('[data-tag]'))) { const k = b.dataset.tag; if (S.tags.has(k)) S.tags.delete(k); else S.tags.add(k); refresh(); return; }
    if ((b = t.closest('#fclear'))) { S.q = ''; $('#q').value = ''; refresh(); $('#q').focus(); return; }
    if (t.closest('#fbtn')) { modalShow($('#fsheet'), $('#fbtn')); return; }
    if (t.closest('#fsshow') || t.closest('#fsheet [data-close]') || t.closest('#fsheet .mbk')) { modalHide($('#fsheet')); return; }
    if (t.closest('#fsreset')) { resetFilter(); return; }
    if ((b = t.closest('a[href="#"]'))) e.preventDefault();
  });
  D.addEventListener('input', e => { if (e.target.id === 'q') { S.q = e.target.value; refresh(); } });
  D.addEventListener('keydown', e => {
    if(e.key==='Tab' && Mo.cur){const f=[...Mo.cur.querySelectorAll('a[href],button,input,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);if(f.length){if(e.shiftKey&&D.activeElement===f[0]){f.at(-1).focus();e.preventDefault();}else if(!e.shiftKey&&D.activeElement===f.at(-1)){f[0].focus();e.preventDefault();}}}
    if (e.key !== 'Escape'  || e.metaKey || e.ctrlKey || e.altKey) return;
    const fs = $('#fsheet');
    if (Mo.cur === fs) { modalHide(fs); e.preventDefault(); return; }
    const q = $('#q'); if (D.activeElement === q && q.value) { S.q = ''; q.value = ''; refresh(); e.preventDefault(); return; }
    if (S.open) { closeEntry(); e.preventDefault(); }
  });
  addEventListener('hashchange', () => sync());
  addEventListener('popstate', () => sync());
  if (mq.addEventListener) mq.addEventListener('change', () => { R.classList.toggle('rm', RM()); loop(); layoutAll(); paintArts(); });
}

function skeleton() {
  D.body.insertAdjacentHTML('afterbegin', `<div id="stage"><div id="frame"><div id="app" data-v="${V.id}">
<canvas id="field" aria-hidden="true"></canvas>
<header class="top"><a class="pill back" href="/">${svg(ICO.back, 16).replace('<svg ', '<svg class="flip" ')}<span>${esc(L('back'))}</span></a><h1 class="ttl"><span id="ttl">${esc(L('title'))}</span><i class="caret" aria-hidden="true"></i></h1><p class="kicker">${esc(L('sub'))}</p><p class="meta" id="meta" aria-hidden="true"></p></header>
<section class="filter" role="search" aria-label="${esc(L('filter'))}">${filterHTML()}</section>
<div class="scroll" id="scroll"><main id="content"></main><footer class="foot" aria-label="${esc(L('impressum'))}"><a href="/impressum.html">${esc(L('impressum'))}</a><i aria-hidden="true">·</i><a href="/datenschutz.html">${esc(L('datenschutz'))}</a><i aria-hidden="true">·</i><a href="/teamwork/">${esc(L('teamwork'))}</a><i aria-hidden="true">·</i><a href="/glossar/">Glossar</a><i aria-hidden="true">·</i><a href="mailto:info@dreambau.com">Kontakt</a></footer></div>
<div class="modal fs" id="fsheet" role="dialog" aria-modal="true" aria-labelledby="fs-t" aria-hidden="true" inert><div class="mbk"></div><section class="msheet" tabindex="-1"><span class="grab" aria-hidden="true"></span><header class="mh"><h2 id="fs-t">${esc(L('filterTitle'))}</h2><button type="button" class="pill" data-close data-autofocus>${esc(L('close'))}</button></header><div class="mb" id="fsbody"></div><footer class="mf"><button type="button" class="pill" id="fsreset">${esc(L('reset'))}</button><button type="button" class="pill pri" id="fsshow"></button></footer></section></div>
</div></div></div><p class="sr" id="live" role="status" aria-live="polite"></p>`);
  app = $('#app');
}

function start(Vv) {
  V = Vv;
  R.dataset.v = V.id; R.classList.toggle('rm', RM());

  D.title = `${L('title')} · dreambau.com`; document.querySelector('.nojs').remove();
  skeleton(); wire();
  V.mount($('#content'), app);
  if (Q.get('q') != null) S.q = Q.get('q');
  placeFilter();
  S.vis = E.filter(matches).map(e => e.id); S.visSet = new Set(S.vis);
  syncFilterUI();
  V.render();
  const e0 = entryFromHash();
  if (e0 && !(history.state && history.state.m)) { const b = baseUrl(); history.replaceState({ b: 1 }, '', b); history.pushState({ m: 1 }, '', b + '#' + e0.id); }
  sync(true);
  resizeObs = new ResizeObserver(() => layoutAll()); resizeObs.observe(app);
  layoutAll(); paintArts();
  loop();
  if (!RM()) decode($('#ttl'), L('title'), { dur: 600 });
}

const controller = { E, byId, S, L, LANG, DIR, COL, NEU, MONO, RM_T, titleOf, scopeOf, vt, esc, EN, hl, hash, glyph, sty, mix, strHash, decode, fit, rel, drawField, drawArt, paintArts, artHTML, viewHTML, enChip, stChip, tagsHTML, linksHTML, sameHTML, tagL, secList, emptyHTML, openEntry, closeEntry, modalShow, modalHide, Mo, isPhone, RM, redraw, layoutAll, refresh, svg, ICO, start, $, $$,
};
referenceTimeline = controller;
})();

/* ---- C · Zeitstrahl ---- */
(() => {
'use strict';
const M = referenceTimeline, { $, $$, E, S, L, esc, hl, vt, tagL, COL, NEU, MONO, mix, rel, hash, glyph, sty, strHash, viewHTML, openEntry, closeEntry, decode, paintArts, fit, enChip, stChip, sameHTML, emptyHTML } = M;
const R = document.documentElement;
/* the ray: segments in time order with a weight each (width on the axis); 2019 to 2022 hold no entry and are cut short */
const SEGS = [
  { k: '2017', w: 1.0 }, { k: '2018', w: 1.0 }, { k: 'brk', w: .5 }, { k: '2023', w: 2.4 }, { k: '2024', w: 1.1 }, { k: 'now', w: 4.4 },
];
const segOf = e => (e.sec === 'cur' ? 'now' : e.year);
SEGS.forEach(s => { s.nodes = s.k === 'brk' ? [] : E.filter(e => segOf(e) === s.k).map(e => e.id); });
if (SEGS.reduce((a, s) => a + s.nodes.length, 0) !== E.length) throw new Error('an entry has no place on the ray');
const segLabel = s => (s.k === 'now' ? L('now') : s.k === 'brk' ? '//' : s.k);

let app = null, nodesEl = null, mode = null, hoverId = null, sideMode = null, tiersUsed = 0;
/* the docked panel (440 px) is used from 1280 px; keep in sync with the two container queries in c.css and the width test in behaviour.mjs.
   Below that the ray would get less than ~750 px, and with long (Finnish) labels it ran out of rows at 1100 px: the panel is a sheet then */
const isDocked = () => app.clientWidth >= 1280;
const eh = (s, q) => `<span lang="en" dir="ltr">${hl(vt(s), q)}</span>`;

function nodeHTML(e) {
  const q = S.q.trim(), cur = e.sec === 'cur';
  const name = cur ? hl(e.title, q) : `<span lang="en" dir="ltr">${hl(vt(e.client), q)}</span>`;
  const tags = e.tags.length ? `<span class="tags">${e.tags.map(t => `<span class="tag">${hl(tagL(t), q)}</span>`).join('')}</span>` : '';
  const ds = cur
    ? (e.sent ? `<span lang="de" dir="ltr">${hl(e.sent, q)}</span><span class="draft">${esc(L('draft'))}</span>` : `<span class="pending">${hl(L('pending'), q)}</span>`) + tags
    : `<span><span class="y">${hl(e.year, q)}</span> · ${eh(e.scope.trim(), q)}</span>${tags}`;
  const inner = `<span class="orb"><canvas class="oc" aria-hidden="true"></canvas>${e.openable ? '' : '<i class="ex" aria-hidden="true">↗</i>'}${cur ? '' : `<abbr class="en enb" title="${esc(L('enTitle'))}">EN</abbr>`}</span><span class="lb"><span class="nm">${name}</span><span class="mk">${cur ? stChip(e) : enChip(e)}</span><span class="ds">${ds}</span>${e.openable ? '' : `<span class="sr">${esc(L('noView'))}</span>`}</span>`;
  const main = e.openable
    ? `<a class="nd" href="#${e.id}" data-id="${e.id}">${inner}</a>`
    : `<div class="nd" role="group" aria-label="${esc(e.client)} · ${esc(L('noView'))}">${inner}</div>`;
  return `<li class="node ${e.sec}${e.openable ? '' : ' row'}" data-id="${e.id}">${main}${e.same ? sameHTML(e) : ''}</li>`;
}
function shHTML(s) {
  if (s.k === 'brk') return S.vis.length === E.length ? `<li class="sh brk" aria-hidden="true"><p>// 2019–2022 · ${esc(L('axisBreak'))}</p></li>` : '';
  if (!s.nodes.some(id => S.visSet.has(id))) return '';
  return `<li class="sh ${s.k === 'now' ? 'now' : ''}"><h2>${esc(segLabel(s))}</h2></li>`;
}
function legendHTML() {
  return `<ul class="c-legend" aria-label="${esc(L('legend'))}"><li data-css="--lc:var(--cur)"><i class="dot"></i>${esc(L('cur'))}</li><li data-css="--lc:var(--old)"><i class="dot"></i>${esc(L('old'))}</li><li><abbr class="en" title="${esc(L('enTitle'))}">EN</abbr>${esc(L('enTitle'))}</li><li><i class="sw"></i>${esc(L('noView'))}</li><li><span class="slash" aria-hidden="true">//</span>${esc(L('axisBreak'))}</li></ul>`;
}
function bandHTML() {
  return SEGS.map(s => `<span class="seg ${s.k === 'now' ? 'now' : s.k === 'brk' ? 'brk' : ''}" data-css="flex-grow:${s.w}">${esc(segLabel(s))}${s.k === 'brk' ? `<span class="sr">${esc(L('axisBreak'))}</span>` : ''}</span>`).join('');
}
function scramble(node) {
  if (!node || M.RM() || node._busy) return;
  const html = node.innerHTML, txt = node.textContent;
  node._busy = true; decode(node, txt, { dur: 420 });
  setTimeout(() => { node.innerHTML = html; node._busy = false; }, 470);
}

/* orb: the same glyph disc as in the Teamwork map */
function drawOrb(cv, t, rgb, hot, id, row) {
  const f = fit(cv); if (!f) return;
  const { x, w, h } = f, Rr = w / 2, calm = M.RM(), sc = Rr / 22, sh = strHash(id);
  x.clearRect(0, 0, w, h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = Math.max(8, 9.5 * sc).toFixed(1) + 'px ' + MONO;
  const col = row ? mix(rgb, NEU, .45) : rgb;
  [[0, 1], [6.5, 5], [12.5, 10], [18, 15]].forEach(([rr, cnt], ri) => {
    for (let k = 0; k < cnt; k++) {
      const hv = hash(sh + ri, k, 3), ang = cnt === 1 ? 0 : (k / cnt) * 6.2832 + ri * .7 + (calm ? 0 : t * .35 * (ri % 2 ? 1 : -1));
      const px = Rr + Math.cos(ang) * rr * sc, py = Rr + Math.sin(ang) * rr * sc;
      const a = calm ? .55 + .3 * hv : .45 + .45 * (.5 + .5 * Math.sin(t * (2 + 3 * hv) + k));
      const head = hot ? hv > .45 : hv > .88;
      x.fillStyle = head ? sty('240,246,255', Math.min(1, a + .3)) : sty(col, Math.min(1, a + (hot ? .2 : 0)));
      x.fillText(glyph(sh + ri, k, calm ? Math.floor(hv * 30) : Math.floor(t * (1.5 + 5 * hv) + hv * 30)), px, py);
    }
  });
}
const isHot = li => !!li && (li.dataset.id === hoverId || li.dataset.id === S.open || li.contains(document.activeElement));

/* the horizontal layout: nodes are placed along the ray by time; where labels would collide they move to another tier above or below the axis */
function placeH() {
  const stage = $('#c-stage'), W = stage.clientWidth, rtl = M.DIR === 'rtl', X = x => (rtl ? W - x : x);
  const total = SEGS.reduce((a, s) => a + s.w, 0); let acc = 0;
  SEGS.forEach(s => { s.x0 = acc / total * W; acc += s.w; s.x1 = acc / total * W; });
  const bandH = 30, stem = 14, gap = 12, pad = 12;
  const lis = $$('.node', nodesEl); lis.forEach(li => li.classList.remove('up'));
  let NH = 0; lis.forEach(li => { NH = Math.max(NH, li.offsetHeight); });
  /* y is measured from the middle of the axis band: negative above, positive below */
  const placed = [], hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  let last = -1; const out = [];
  tiersUsed = 0;
  SEGS.forEach(s => s.nodes.forEach((id, i) => {
    const li = nodesEl.querySelector(`.node[data-id="${id}"]`); if (!li) return;
    const w = li.offsetWidth, h = li.offsetHeight;
    let cx = s.x0 + (i + .5) / s.nodes.length * (s.x1 - s.x0);
    cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, cx));
    const side = last > 0 ? [-1, 1] : [1, -1], order = [];
    for (let k = 1; k <= 8; k++) side.forEach(s => order.push(s * k));   // alternating above and below, row by row
    let pick = null, cand = null;
    for (const t of order) {
      const up = t > 0, k = Math.abs(t);
      const top = up ? -(bandH / 2 + stem + (k - 1) * (NH + gap) + h) : bandH / 2 + stem + (k - 1) * (NH + gap);
      const box = { x0: cx - w / 2, x1: cx + w / 2, y0: top, y1: top + h };
      const sb = up ? { x0: cx - 2, x1: cx + 2, y0: top + h, y1: -bandH / 2 } : { x0: cx - 2, x1: cx + 2, y0: bandH / 2, y1: top };
      cand = { t, up, top, h, box, sb };
      if (!placed.some(p => hit(p.box, box) || hit(p.sb, box) || hit(p.box, sb))) { pick = cand; break; }
    }
    if (!pick) pick = cand;   // no free place in 8 rows per side (not reached with the shipped texts): take the deepest row instead of failing
    placed.push(pick); last = pick.up ? 1 : -1; tiersUsed = Math.max(tiersUsed, Math.abs(pick.t));
    out.push({ id, li, w, h, cx, ...pick });
  }));
  const minY = Math.min(-bandH / 2, ...out.map(o => o.top)) - pad, maxY = Math.max(bandH / 2, ...out.map(o => o.top + o.h)) + pad;
  /* wide screens: the stage grows to the room that is left under the legend (up to 640 px), the ray stays in the middle of it */
  const sc = $('#scroll'), foot = $('.foot');
  const room = sc.clientHeight - (stage.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop) - (foot ? foot.offsetHeight + 28 : 0) - parseFloat(getComputedStyle(sc).paddingBottom);
  const H = Math.max(360, maxY - minY, Math.min(room, 640)), mid = -minY + (H - (maxY - minY)) / 2;
  css(stage,'height',H.toFixed(0)+'px');
  css($('.c-band', stage),'top',(mid-bandH/2).toFixed(1)+'px');
  let svg = '';
  out.forEach(o => {
    o.li.classList.toggle('up', o.up);
    css(o.li,'left',(X(o.cx)-o.w/2).toFixed(1)+'px'); css(o.li,'top',(mid+o.top).toFixed(1)+'px');
    const rgb = M.byId[o.id].sec === 'cur' ? COL.cur : COL.old;
    const y1 = o.up ? mid + o.top + o.h : mid + bandH / 2, y2 = o.up ? mid - bandH / 2 : mid + o.top;
    svg += `<line x1="${X(o.cx).toFixed(1)}" y1="${y1.toFixed(1)}" x2="${X(o.cx).toFixed(1)}" y2="${y2.toFixed(1)}" data-css="--zc:${rgb}"/>`;
  });
  $('#c-links').innerHTML = svg;
}
function clearH() { $$('.node', nodesEl).forEach(li => { css(li,'left','');css(li,'top',''); li.classList.remove('up'); }); css($('#c-stage'),'height',''); $('#c-links').innerHTML = ''; }

/* the project view: docked panel (wide) or bottom sheet (otherwise) */
function viewInto(host, e) {
  host.innerHTML = `<div class="pvbox">${viewHTML(e)}</div>`;
  absorbStyles(); paintArts(host);
}
function markOpen(id) { $$('.nd[aria-current]', nodesEl).forEach(n => n.removeAttribute('aria-current')); const n = id && $(`.nd[data-id="${id}"]`, nodesEl); if (n) n.setAttribute('aria-current', 'true'); }
function showOpen(id, prev, initial) {
  markOpen(id);
  const e = M.byId[id], docked = isDocked(), opener = $(`.nd[data-id="${id}"]`), kicker = L('view') + ' · ' + (e.sec === 'cur' ? L('now') : e.year);
  if (docked) {
    if (sideMode === 'sheet') { M.modalHide($('#cs'), false); $('#cs-b').innerHTML = ''; }
    sideMode = 'dock';
    const side = $('#c-side'); side.classList.toggle('cur', e.sec === 'cur');
    $('#c-hint').hidden = true; $('#c-view').hidden = false;
    $('#sd-k').textContent = kicker;
    viewInto($('#sd-b'), e);
    side.scrollTop = 0;
    if (!initial) { const h = $('#sd-b .pv-title'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  } else {
    if (sideMode === 'dock') { $('#c-view').hidden = true; $('#sd-b').innerHTML = ''; $('#c-hint').hidden = false; }
    sideMode = 'sheet';
    const cs = $('#cs');
    $('#cs-k').textContent = kicker;
    viewInto($('#cs-b'), e);
    cs.setAttribute('aria-labelledby', 'pvt-' + id);
    $('#cs-b').scrollTop = 0;
    M.modalShow(cs, opener);
  }
}
function hideOpen(prev, initial) {
  markOpen(null);
  if (sideMode === 'sheet') { M.modalHide($('#cs'), false); $('#cs-b').innerHTML = ''; }
  if (sideMode === 'dock') { $('#c-view').hidden = true; $('#sd-b').innerHTML = ''; $('#c-hint').hidden = false; }
  sideMode = null;
  if (prev && !initial) { const a = $(`.nd[data-id="${prev}"]`); if (a) a.focus({ preventScroll: true }); }
}

const V = {
  id: 'c', name: 'Zeitstrahl',
  get docked() { return !!app && isDocked(); },
  mount(c, a) {
    app = a;
    c.innerHTML = `<div class="c-body"><section class="c-map" aria-label="${esc(L('axis'))}">${legendHTML()}<div class="c-empty" id="c-empty"></div><div class="c-stage" id="c-stage"><div class="c-band" aria-hidden="true">${bandHTML()}</div><svg class="c-links" id="c-links" aria-hidden="true"></svg><ol class="c-nodes" id="c-nodes"></ol></div></section>
<aside class="c-side" id="c-side" aria-label="${esc(L('view'))}"><div class="c-hint" id="c-hint"><span class="gl" aria-hidden="true">◍</span><h2>${esc(L('view'))}</h2><p>${esc(L('hint'))}</p></div><div id="c-view" hidden><div class="sd-h"><span class="pd-k" id="sd-k"></span><button type="button" class="pill" data-closeview>${esc(L('close'))}</button></div><div class="sd-b" id="sd-b"></div></div></aside></div>`;
    nodesEl = $('#c-nodes');
    a.insertAdjacentHTML('beforeend', `<div class="modal cs" id="cs" role="dialog" aria-modal="true" aria-hidden="true" inert><div class="mbk" id="cs-bk"></div><section class="msheet" tabindex="-1"><span class="grab" aria-hidden="true"></span><header class="mh"><p class="pd-k" id="cs-k"></p><button type="button" class="pill pd-x" data-closeview data-autofocus>${esc(L('close'))}</button></header><div class="mb" id="cs-b"></div><footer class="mf"><button type="button" class="pill pri" data-closeview>${esc(L('close'))}</button></footer></section></div>`);
    c.addEventListener('click', ev => {
      const t = ev.target.closest('a.nd[data-id]');
      if (t) { if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey || ev.button) return; ev.preventDefault(); openEntry(t.dataset.id); return; }
      const sm = ev.target.closest('a.same');
      if (sm) { ev.preventDefault(); openEntry(sm.getAttribute('href').slice(1)); return; }
      if (ev.target.closest('[data-closeview]')) closeEntry();
    });
    c.addEventListener('mouseover', ev => {
      const t = ev.target.closest('.node'), id = t ? t.dataset.id : null;
      if (id === hoverId) return;
      hoverId = id;
      if (t && !S.q.trim()) scramble($('.nm', t));
    });
    c.addEventListener('mouseleave', () => { hoverId = null; });
    $('#cs').addEventListener('click', ev => { if (ev.target.closest('[data-closeview]') || ev.target.id === 'cs-bk') closeEntry(); });
  },
  render() {
    mode = M.isPhone() ? 'v' : 'h';
    let html = '';
    (mode === 'h' ? SEGS : SEGS.slice().reverse()).forEach(s => {
      if (mode === 'v') html += shHTML(s);
      s.nodes.forEach(id => { if (mode === 'h' || S.visSet.has(id)) html += nodeHTML(M.byId[id]); });
    });
    const a = document.activeElement, keep = a && a.closest && a.closest('.node') ? a.closest('.node').dataset.id : null;
    nodesEl.innerHTML = html; markOpen(S.open);
    $$('.node', nodesEl).forEach(li => { const ok = S.visSet.has(li.dataset.id); li.classList.toggle('dim', !ok); li.inert = !ok; });
    $('#c-empty').innerHTML = S.vis.length ? '' : emptyHTML();
    if (keep) { const n = $(`.nd[data-id="${keep}"]`); if (n) n.focus({ preventScroll: true }); }
  },
  setOpen(id, prev, initial) { if (id) showOpen(id, prev, initial); else hideOpen(prev, initial); },
  layout() {
    const m = M.isPhone() ? 'v' : 'h';
    if (m !== mode) V.render();
    if (m === 'h') placeH(); else clearH();
    const sc = $('#scroll'); css(app,'--sideh',Math.max(420,sc.clientHeight-24)+'px');
    if (S.open) {
      const want = isDocked() ? 'dock' : 'sheet';
      if (want !== sideMode) showOpen(S.open, S.open, true);
    }
  },
  frame(t) {
    const cv = $('#field'); if (!cv || !nodesEl) return;
    const lis = $$('.node', nodesEl).filter(li => li.offsetParent && !li.classList.contains('dim'));
    const orbs = lis.map(li => { const o = $('.orb', li), r = rel(o, app); return { li, o, id: li.dataset.id, x: r.x + r.w / 2, y: r.y + r.h / 2, R: r.w / 2, cur: li.classList.contains('cur'), row: li.classList.contains('row'), hot: isHot(li) }; });
    M.drawField(cv, t, {
      tint: (px, py, w) => ({ rgb: mix(COL.old, COL.cur, Math.max(0, Math.min(1, (M.DIR === 'rtl' ? w - px : px) / w * 1.25 - .15))), gain: .8 }),
      hot: () => orbs.map(o => ({ x: o.x, y: o.y, r: o.R, k: o.hot ? 90 : 52, v: o.hot ? .6 : .3, rgb: o.cur ? COL.cur : COL.old })),
    });
    orbs.forEach(o => { const cvs = $('.oc', o.o); if (cvs) drawOrb(cvs, t, o.cur ? COL.cur : COL.old, o.hot, o.id, o.row); });
  },

};
M.tiers = () => tiersUsed;
M.start(V);
})();
