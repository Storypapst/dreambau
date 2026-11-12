/* Prototype of the map "Navigieren": the posts of the list as places on mesas in a canyon, drawn as an isometric raster
   of characters. The list in the HTML is the content; this file adds the map, the figure and the sheet. Nothing is
   requested, nothing is stored. KARTE_LABELS is put in front of this file by build.mjs. */
(() => {
  'use strict';
  const D = document, root = D.documentElement;
  const $ = (id) => D.getElementById(id);
  const stage = $('stage'), cv = $('map'), list = $('posts'), tip = $('tip'), panel = $('panel'), veil = $('veil');
  const x = cv && cv.getContext && cv.getContext('2d');
  if (!x || !list) return;

  /* ---- language: ?lang=de|fi|ar (the posts keep their own language) ---- */
  const wanted = new URLSearchParams(location.search).get('lang');
  const LANG = Object.prototype.hasOwnProperty.call(KARTE_LABELS, wanted) ? wanted : 'de';
  const L = KARTE_LABELS[LANG];
  if (LANG !== 'de') {
    root.lang = LANG;
    root.dir = LANG === 'ar' ? 'rtl' : 'ltr';
    for (const el of D.querySelectorAll('[data-l]')) el.textContent = L[el.dataset.l];
    for (const el of D.querySelectorAll('[data-l-aria]')) el.setAttribute('aria-label', L[el.dataset.lAria]);
    D.title = `${L.title} · dreambau.com`;
  }
  root.classList.add('js');
  for (const a of D.querySelectorAll('.langs a')) if (a.dataset.lang === LANG) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');

  /* ---- the posts, read from the list (newest first) ---- */
  const posts = [...list.querySelectorAll('li.row')].map((row, rank) => ({
    row, rank, no: row.dataset.no, date: row.dataset.date, newest: row.hasAttribute('data-newest'),
    link: row.querySelector('.tt a'), video: Boolean(row.querySelector('.mk.src')), title: row.querySelector('.tt a').textContent, short: row.querySelector('.ex').textContent,
  }));
  if (posts.length === 0) { root.classList.remove('js'); return; }

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const COARSE = matchMedia('(hover: none)').matches;
  const RM = () => motion.matches;
  const css = getComputedStyle(root);
  const token = (name) => css.getPropertyValue(name).trim();
  const FG = token('--fg'), CREAM = token('--cream'), CUR = token('--cur'), OLD = token('--old'), BG = token('--bg'), MONO = token('--mono');
  const inks = new Map();
  const ink = (rgb, alpha) => {
    const key = `${rgb}/${Math.round(alpha * 50)}`;
    let value = inks.get(key);
    if (!value) { value = `rgba(${rgb},${(Math.round(alpha * 50) / 50).toFixed(2)})`; inks.set(key, value); }
    return value;
  };

  /* ---- the world: an endless grid of cells; every SLOT cells a mesa, bridges between neighbours ---- */
  const SLOT = 17, TW = 26, TH = 13, HZ = 12, MAXH = 10;
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>=', STRATA = '|=|:#|-|', FLOOR = '.·:.';
  const hash = (a, b, c) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const mod = (n, m) => ((n % m) + m) % m;

  /* The posts lie on a tile of PA x PB mesas that repeats like a texture; the shapes of the mesas never repeat. */
  const SLOTS = Math.max(30, posts.length * 3), PA = Math.ceil(Math.sqrt(SLOTS * 1.2)), PB = Math.ceil(SLOTS / PA);
  const order = [];
  for (let b = 0; b < PB; b += 1) for (let a = 0; a < PA; a += 1) order.push({ a, b, key: hash(a, b, 99) });
  order.sort((p, q) => p.key - q.key);
  const slotPost = new Map(order.slice(0, posts.length).map((slot, index) => [`${slot.a},${slot.b}`, posts[index]]));
  const HOME = order[0];

  const mesas = new Map();
  function mesa(a, b) {
    const k = `${a},${b}`;
    let m = mesas.get(k);
    if (m) return m;
    const post = slotPost.get(`${mod(a, PA)},${mod(b, PB)}`) || null;
    /* heights from 2 to MAXH, more low than high; a high mesa is narrower, so the land looks spiky */
    const h = 2 + Math.floor(Math.pow(hash(a, b, 3), 1.3) * (MAXH - 1)), narrow = post ? Math.max(0.92, 1.12 - h * 0.035) : 1.12 - h * 0.035;
    const rad = [];
    for (let q = 0; q < 8; q += 1) rad.push(((post ? 3.9 : 3.1) + hash(a, b, 20 + q) * 1.5) * narrow);
    m = { a, b, k, post, rad, cx: a * SLOT + Math.round((hash(a, b, 1) - 0.5) * 4), cy: b * SLOT + Math.round((hash(a, b, 2) - 0.5) * 4), h };
    mesas.set(k, m);
    return m;
  }
  const radius = (m, di, dj) => {
    const t = (((Math.atan2(dj, di) / (2 * Math.PI)) + 1) % 1) * 8, q = Math.floor(t), f = t - q;
    return m.rad[q % 8] * (1 - f) + m.rad[(q + 1) % 8] * f;
  };
  const inside = (m, i, j) => { const di = i - m.cx, dj = j - m.cy, r = radius(m, di, dj); return di * di + dj * dj <= r * r; };
  const slotOf = (i, j) => mesa(Math.round(i / SLOT), Math.round(j / SLOT));

  function cellHeight(i, j) {
    const m = slotOf(i, j), di = i - m.cx, dj = j - m.cy, d = Math.hypot(di, dj), r = radius(m, di, dj);
    if (d <= r) return m.h;
    const sector = Math.floor((((Math.atan2(dj, di) / (2 * Math.PI)) + 1) % 1) * 8);
    if (d <= r + 1.7 && hash(m.a * 8 + sector, m.b, 50) > 0.55) return Math.ceil(m.h / 2);   // a terrace on part of the rim
    if (d <= r + 2.8 && hash(i, j, 6) > 0.9) return 1;                                      // rubble at the foot
    return hash(i, j, 8) < 0.006 ? 2 + Math.floor(hash(i, j, 12) * (MAXH - 2)) : 0;   // a lone spire
  }
  const chunks = new Map();
  function H(i, j) {
    const ci = i >> 4, cj = j >> 4, key = `${ci},${cj}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new Int8Array(256);
      for (let v = 0; v < 16; v += 1) for (let u = 0; u < 16; u += 1) chunk[v * 16 + u] = cellHeight(ci * 16 + u, cj * 16 + v);
      if (chunks.size > 4000) chunks.clear();
      chunks.set(key, chunk);
    }
    return chunk[(j & 15) * 16 + (i & 15)];
  }

  /* A bridge joins the centres of two neighbouring mesas (dir 0: towards a+1, dir 1: towards b+1); the part between the
     two rims hangs. Which bridges exist is fixed so that every mesa can be reached from every other. */
  const bridges = new Map();
  function bridge(a, b, dir) {
    const k = `${a},${b},${dir}`;
    let br = bridges.get(k);
    if (br) return br;
    const A = mesa(a, b), B = dir ? mesa(a, b + 1) : mesa(a + 1, b);
    const present = dir ? ((a & 1) === 0 || hash(a, b, 11) < 0.45) : ((b & 1) === 0 || (a & 1) !== 0 || hash(a, b, 10) < 0.45);
    const vx = B.cx - A.cx, vy = B.cy - A.cy;
    let t0 = 0, t1 = 1;
    while (t0 < 0.5 && inside(A, A.cx + vx * t0, A.cy + vy * t0)) t0 += 0.01;
    while (t1 > 0.5 && inside(B, A.cx + vx * t1, A.cy + vy * t1)) t1 -= 0.01;
    br = { A, B, present, vx, vy, t0: t0 - 0.02, t1: t1 + 0.02, len: Math.hypot(vx, vy) };
    bridges.set(k, br);
    return br;
  }
  const bridgeZ = (br, t) => { const u = Math.max(0, Math.min(1, (t - br.t0) / (br.t1 - br.t0))); return br.A.h + (br.B.h - br.A.h) * u - Math.sin(Math.PI * u) * 1.2; };
  const neighbours = (m) => {
    const out = [];
    if (bridge(m.a, m.b, 0).present) out.push(mesa(m.a + 1, m.b));
    if (bridge(m.a - 1, m.b, 0).present) out.push(mesa(m.a - 1, m.b));
    if (bridge(m.a, m.b, 1).present) out.push(mesa(m.a, m.b + 1));
    if (bridge(m.a, m.b - 1, 1).present) out.push(mesa(m.a, m.b - 1));
    return out;
  };
  /* The height of the ground where the figure can stand: a mesa or a bridge; null where it cannot. */
  function ground(i, j) {
    const m = slotOf(i, j);
    if (inside(m, i, j)) return m.h;
    for (const [a, b, dir] of [[m.a, m.b, 0], [m.a - 1, m.b, 0], [m.a, m.b, 1], [m.a, m.b - 1, 1]]) {
      const br = bridge(a, b, dir);
      if (!br.present) continue;
      const t = ((i - br.A.cx) * br.vx + (j - br.A.cy) * br.vy) / (br.len * br.len);
      if (t < br.t0 || t > br.t1) continue;
      const px = br.A.cx + br.vx * t - i, py = br.A.cy + br.vy * t - j;
      if (px * px + py * py <= 0.5) return bridgeZ(br, t);
    }
    return null;
  }

  /* ---- state ---- */
  const home = mesa(HOME.a, HOME.b);
  const fig = { i: home.cx + 1.4, j: home.cy + 0.6, z: home.h, walking: false };
  const worldX = (i, j) => ((i - j) * TW) / 2, worldY = (i, j, z) => ((i + j) * TH) / 2 - z * HZ;
  const cam = { x: worldX(home.cx, home.cy), y: worldY(home.cx, home.cy, home.h) - 10 };
  let W = 0, Hh = 0, dpr = 1, follow = false, path = [], goal = null, nearPost = null, hover = null, opened = null, clock = 0, dirty = true;
  let jump = 0, stun = 0, score = 0, steer = null, critters = [];
  const JUMP = 0.55, cleared = new Map();
  const jumpHeight = () => (jump > 0 ? Math.sin((Math.PI * (JUMP - jump)) / JUMP) : 0);
  let marks = [], tops = [];
  const keys = new Set();

  /* ---- drawing ---- */
  function drawTerrain(t) {
    const hw = TW / 2, hh = TH / 2;
    const s0 = Math.floor((cam.y - Hh / 2) / hh) - 2, s1 = Math.ceil((cam.y + Hh / 2) / hh) + 2 + Math.ceil(((MAXH + 1) * HZ) / hh);
    const d0 = Math.floor((cam.x - W / 2) / hw) - 2, d1 = Math.ceil((cam.x + W / 2) / hw) + 2;
    const tick = Math.floor(t * 0.8);
    for (let s = s0; s <= s1; s += 1) {
      for (let d = d0 + ((s + d0) & 1); d <= d1; d += 2) {
        const i = (s + d) / 2, j = (s - d) / 2, h = H(i, j);
        const sx = d * hw - cam.x + W / 2, base = s * hh - cam.y + Hh / 2;
        if (h === 0) {
          const f = hash(i, j, 7);
          if (f < 0.12) { x.fillStyle = ink(FG, 0.1 + f * 0.5); x.fillText(FLOOR[Math.floor(f * 33)], sx, base); }
          continue;
        }
        const top = base - h * HZ, dropL = Math.max(0, h - H(i, j + 1)), dropR = Math.max(0, h - H(i + 1, j)), drop = Math.max(dropL, dropR) * HZ;
        let rgb = FG, alpha = Math.min(0.9, 0.34 + h * 0.055), lit = false;
        if (h >= 2) {
          const m = slotOf(i, j);
          if (m.post && h === m.h && inside(m, i, j)) { lit = hover === m.post || opened === m.post; rgb = m.post.newest ? CUR : OLD; alpha = lit ? 0.98 : 0.7; }
        }
        /* the column hides what lies behind it; the top face is a little lighter than the ground */
        x.beginPath();
        x.moveTo(sx, top - hh); x.lineTo(sx + hw, top); x.lineTo(sx + hw, top + drop); x.lineTo(sx, top + hh + drop); x.lineTo(sx - hw, top + drop); x.lineTo(sx - hw, top);
        x.closePath();
        x.fillStyle = BG; x.fill();
        x.beginPath();
        x.moveTo(sx, top - hh); x.lineTo(sx + hw, top); x.lineTo(sx, top + hh); x.lineTo(sx - hw, top);
        x.closePath();
        x.fillStyle = ink(rgb, rgb === FG ? 0.03 + h * 0.008 : lit ? 0.22 : 0.1); x.fill();
        /* the cliff: one sign per level, the same sign at the same altitude everywhere, like layers of rock */
        for (let k = 1; k <= dropL && k <= h; k += 1) {
          const level = h - k;
          x.fillStyle = ink(FG, 0.2 + (level % 3) * 0.09);
          x.fillText(STRATA[level % STRATA.length], sx - hw / 2, top + hh / 2 + (k - 0.5) * HZ);
        }
        for (let k = 1; k <= dropR && k <= h; k += 1) {
          const level = h - k;
          x.fillStyle = ink(FG, 0.09 + (level % 3) * 0.05);
          x.fillText(STRATA[level % STRATA.length], sx + hw / 2, top + hh / 2 + (k - 0.5) * HZ);
        }
        /* the rim: a line wherever the neighbour is lower */
        const backL = H(i - 1, j) < h, backR = H(i, j - 1) < h;
        if (dropL || dropR || backL || backR) {
          x.beginPath();
          if (dropL) { x.moveTo(sx - hw, top); x.lineTo(sx, top + hh); }
          if (dropR) { x.moveTo(sx, top + hh); x.lineTo(sx + hw, top); }
          if (backL) { x.moveTo(sx - hw, top); x.lineTo(sx, top - hh); }
          if (backR) { x.moveTo(sx, top - hh); x.lineTo(sx + hw, top); }
          x.strokeStyle = ink(rgb, rgb === FG ? 0.3 : 0.75); x.lineWidth = 1; x.stroke();
        }
        const live = hash(i, j, 5) < 0.05 ? Math.floor(tick + hash(i, j, 9) * 7) : 0;
        x.fillStyle = ink(rgb, alpha);
        x.fillText(GLYPHS[Math.floor(hash(i, j, 30 + live) * GLYPHS.length)], sx, top);
      }
    }
    return { i0: Math.floor((s0 + d0) / 2), i1: Math.ceil((s1 + d1) / 2), j0: Math.floor((s0 - d1) / 2), j1: Math.ceil((s1 - d0) / 2) };
  }

  const screen = (i, j, z) => [worldX(i, j) - cam.x + W / 2, worldY(i, j, z) - cam.y + Hh / 2];

  function drawBridge(br) {
    const steps = Math.max(2, Math.round((br.t1 - br.t0) * br.len * 2));
    const rope = [];
    for (let n = 0; n <= steps; n += 1) {
      const t = br.t0 + ((br.t1 - br.t0) * n) / steps;
      const [sx, sy] = screen(br.A.cx + br.vx * t, br.A.cy + br.vy * t, bridgeZ(br, t));
      rope.push([sx, sy]);
      x.fillStyle = BG;
      x.fillRect(sx - 4, sy - 5, 8, 10);
      x.fillStyle = ink(FG, 0.7);
      x.fillText('=', sx, sy);
    }
    if (rope[0][0] < -200 && rope[steps][0] < -200) return;
    x.strokeStyle = ink(FG, 0.34);
    x.lineWidth = 1;
    x.beginPath();
    rope.forEach(([sx, sy], n) => (n === 0 ? x.moveTo(sx, sy - 9) : x.lineTo(sx, sy - 9)));
    for (let n = 0; n <= steps; n += 2) { x.moveTo(rope[n][0], rope[n][1] - 9); x.lineTo(rope[n][0], rope[n][1] - 4); }
    x.stroke();
    /* a small animal runs to and fro on some bridges; the figure has to jump over it */
    if (hash(br.A.a, br.A.b, 60 + (br.B.a === br.A.a ? 1 : 0)) < 0.55) {
      const span = (br.t1 - br.t0) * br.len - 1.6, phase = (RM() ? 0 : clock * 1.3) / span + hash(br.A.a, br.A.b, 61) * 2, wave = Math.abs((phase % 2) - 1);
      const t = br.t0 + (0.8 + wave * span) / br.len, ci = br.A.cx + br.vx * t, cj = br.A.cy + br.vy * t, [sx, sy] = screen(ci, cj, bridgeZ(br, t));
      critters.push({ i: ci, j: cj, key: `${br.A.k},${br.B.k}` });
      x.fillStyle = BG; x.fillRect(sx - 9, sy - 15, 18, 12);
      x.font = `700 12px ${MONO}`; x.fillStyle = `rgb(${CREAM})`;
      x.fillText(Math.floor(clock * 6) % 2 ? '°m' : '°n', sx, sy - 9);
      x.font = `500 12px ${MONO}`;
    }
  }

  function drawMarks() {
    x.font = `700 12px ${MONO}`;
    for (const mark of marks) {
      const post = mark.m.post, rgb = post.newest ? CUR : OLD, lit = hover === post || opened === post;
      x.strokeStyle = ink(rgb, 0.9);
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(mark.cx, mark.cy - 6); x.lineTo(mark.cx, mark.y + 10); x.stroke();
      x.fillStyle = lit ? `rgb(${rgb})` : BG;
      x.fillRect(mark.x - 15, mark.y - 10, 30, 20);
      x.strokeRect(mark.x - 14.5, mark.y - 9.5, 29, 19);
      x.fillStyle = lit ? BG : `rgb(${rgb})`;
      x.fillText(post.no, mark.x, mark.y + 1);
      if (post.video) {   /* a round sign with a play triangle: this post leads to a video */
        x.beginPath(); x.arc(mark.x + 29, mark.y, 10, 0, Math.PI * 2);
        x.fillStyle = BG; x.fill(); x.stroke();
        x.beginPath(); x.moveTo(mark.x + 26, mark.y - 5); x.lineTo(mark.x + 34, mark.y); x.lineTo(mark.x + 26, mark.y + 5); x.closePath();
        x.fillStyle = `rgb(${rgb})`; x.fill();
      }
    }
  }

  function drawFigure(t) {
    const [sx, ground_] = screen(fig.i, fig.j, fig.z), up = jumpHeight(), sy = ground_ - up * HZ * 1.7;
    if (up > 0) { x.fillStyle = ink(FG, 0.34); x.fillText('_', sx, ground_ - 4); }
    if (stun > 0 && Math.floor(t * 20) % 2) return;
    const run = fig.walking && Math.floor(t * 8) % 2;
    x.fillStyle = BG;
    x.fillRect(sx - 12, sy - 27, 24, 26);
    x.font = `700 13px ${MONO}`;
    x.fillStyle = `rgb(${CUR})`;
    x.fillText(up > 0 ? '~' : fig.walking ? '-' : ' ', sx - 9, sy - 19);   // the scarf flies behind
    x.fillStyle = `rgb(${CREAM})`;
    x.fillText('o', sx, sy - 19 + (fig.walking && !up ? Math.sin(t * 14) : 0));
    x.fillText(up > 0 ? '^A^' : fig.walking ? (run ? '<A/' : '/A>') : '<A>', sx, sy - 7);   // no backslash: some system fonts draw it as a yen sign
  }

  function draw() {
    const t = RM() ? 0 : clock;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, Hh);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `500 12px ${MONO}`;
    const range = drawTerrain(t);
    marks = []; tops = []; critters = [];
    for (let b = Math.floor(range.j0 / SLOT) - 1; b <= Math.ceil(range.j1 / SLOT) + 1; b += 1) {
      for (let a = Math.floor(range.i0 / SLOT) - 1; a <= Math.ceil(range.i1 / SLOT) + 1; a += 1) {
        const m = mesa(a, b), [sx, sy] = screen(m.cx, m.cy, m.h);
        if (sx < -SLOT * TW || sx > W + SLOT * TW || sy < -SLOT * TH || sy > Hh + SLOT * TH) continue;
        for (const dir of [0, 1]) { const br = bridge(a, b, dir); if (br.present) drawBridge(br); }
        tops.push({ m, x: sx, y: sy });
        if (m.post) marks.push({ m, cx: sx, cy: sy, x: sx, y: sy - 30 });
      }
    }
    drawFigure(t);
    drawMarks();
    dirty = false;
  }

  function resize() {
    const box = stage.getBoundingClientRect();
    if (box.width === 0) return;
    W = box.width; Hh = box.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    dirty = true;
    if (RM()) draw();
  }

  /* ---- walking ---- */
  function route(from, wants) {
    const seen = new Map([[from.k, null]]), queue = [from];
    for (let n = 0; n < queue.length && n < 900; n += 1) {
      const m = queue[n];
      if (wants(m)) { const way = []; for (let at = m; at; at = seen.get(at.k)) way.unshift(at); return way; }
      for (const next of neighbours(m)) if (!seen.has(next.k)) { seen.set(next.k, m); queue.push(next); }
    }
    return null;
  }
  /* The mesa the figure stands on, or the nearer end of the bridge it stands on. */
  function standing() {
    const m = slotOf(fig.i, fig.j);
    if (inside(m, fig.i, fig.j)) return m;
    let best = m, bestD = Infinity;
    for (const c of [m, ...neighbours(m)]) { const d = Math.hypot(c.cx - fig.i, c.cy - fig.j); if (d < bestD) { best = c; bestD = d; } }
    return best;
  }
  function walkTo(wants, open) {
    const way = route(standing(), wants);
    if (!way) return;
    const target = way[way.length - 1];
    goal = open && target.post ? target : null;
    follow = true;
    if (RM()) {
      fig.i = target.cx; fig.j = target.cy; fig.z = target.h; path = [];
      cam.x = worldX(fig.i, fig.j); cam.y = worldY(fig.i, fig.j, fig.z) - 10;
      arrive(); draw();
      return;
    }
    path = way.map((m) => ({ i: m.cx, j: m.cy }));
    dirty = true;
  }
  function arrive() {
    fig.walking = false;
    const m = slotOf(fig.i, fig.j);
    updateNear();
    if (goal && goal === m) openPost(m.post);
    goal = null;
  }
  /* One step in the direction (di, dj); where the way is blocked the figure slides along the rim or the bridge. */
  function step(di, dj, amount) {
    const n = Math.hypot(di, dj);
    if (n === 0) return false;
    di = (di / n) * amount; dj = (dj / n) * amount;
    for (const [mi, mj] of [[di, dj], [di * 1.4, 0], [0, dj * 1.4]]) {
      if (mi === 0 && mj === 0) continue;
      const z = ground(fig.i + mi, fig.j + mj);
      if (z !== null) { fig.i += mi; fig.j += mj; fig.z = z; return true; }
    }
    return false;
  }
  function keyVector() {
    let di = 0, dj = 0;
    if (keys.has('up')) { di -= 1; dj -= 1; }
    if (keys.has('down')) { di += 1; dj += 1; }
    if (keys.has('left')) { di -= 1; dj += 1; }
    if (keys.has('right')) { di += 1; dj -= 1; }
    return [di, dj];
  }
  /* The finger steers: the figure runs towards the place the finger holds. */
  function steerVector() {
    const [sx, sy] = screen(fig.i, fig.j, fig.z), dx = steer.x - sx, dy = steer.y - (sy - 10);
    if (Math.hypot(dx, dy) < 16) return [0, 0];
    return [dx / TW + dy / TH, dy / TH - dx / TW];
  }
  /* The post whose mesa the figure stands on can be read: the sign says so, the space bar opens it. */
  function updateNear() {
    const m = slotOf(fig.i, fig.j), post = m.post && inside(m, fig.i, fig.j) ? m.post : null;
    if (post === nearPost) return;
    nearPost = post;
    readButton.hidden = !post;
    if (post && !opened) setHover(post, !COARSE); else if (!post) setHover(null);   // on a phone the read button says it, the box would cover the map
  }
  function startJump() { if (jump <= 0 && !RM()) { jump = JUMP; dirty = true; } }
  function act() { if (nearPost) openPost(nearPost); else startJump(); }
  /* An animal in the way: jumped over counts, run into throws the figure back a little. */
  function meetCritters(before) {
    for (const c of critters) {
      const d = Math.hypot(c.i - fig.i, c.j - fig.j);
      if (path.length > 0 && d < 1.7) startJump();
      if (d > 0.75) continue;
      if (jumpHeight() > 0.25) {
        if ((cleared.get(c.key) || -9) < clock - 1.5) { score += 1; scoreEl.hidden = false; scoreEl.textContent = `${L.score}: ${score}`; }
        cleared.set(c.key, clock);
      } else if (path.length === 0 && stun <= 0 && (cleared.get(c.key) || -9) < clock - 0.6) {
        fig.i = before.i - (fig.i - before.i) * 6; fig.j = before.j - (fig.j - before.j) * 6;
        const z = ground(fig.i, fig.j);
        if (z === null) { fig.i = before.i; fig.j = before.j; } else fig.z = z;
        stun = 0.4;
      }
    }
  }

  let last = 0, idle = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (RM() || D.hidden || opened) { if (dirty && !D.hidden) draw(); return; }
    clock += dt;
    let moving = false;
    const before = { i: fig.i, j: fig.j };
    if (path.length > 0) {
      let left = 6.5 * dt;
      while (left > 0 && path.length > 0) {
        const di = path[0].i - fig.i, dj = path[0].j - fig.j, d = Math.hypot(di, dj);
        if (d <= left) { fig.i = path[0].i; fig.j = path[0].j; path.shift(); left -= d; } else { fig.i += (di / d) * left; fig.j += (dj / d) * left; left = 0; }
      }
      const z = ground(fig.i, fig.j);
      if (z !== null) fig.z = z;
      fig.walking = moving = true;
      if (path.length === 0) arrive();
    } else if (stun <= 0 && (keys.size > 0 || steer)) {
      const [di, dj] = steer ? steerVector() : keyVector();
      if (step(di, dj, 5.5 * dt)) { fig.walking = moving = true; follow = true; updateNear(); } else if (fig.walking) { fig.walking = false; dirty = true; }
    } else if (fig.walking) { fig.walking = false; dirty = true; }
    if (jump > 0) { jump = Math.max(0, jump - dt); moving = true; }
    if (stun > 0) { stun = Math.max(0, stun - dt); moving = true; }
    meetCritters(before);
    if (follow) {
      const tx = worldX(fig.i, fig.j), ty = worldY(fig.i, fig.j, fig.z) - 10, ease = Math.min(1, dt * 5);
      if (Math.abs(tx - cam.x) + Math.abs(ty - cam.y) > 0.5) { cam.x += (tx - cam.x) * ease; cam.y += (ty - cam.y) * ease; moving = true; }
    }
    idle += dt;
    if (moving || dirty || idle > 0.4) { idle = 0; draw(); if (hover) placeTip(); }
  }

  /* ---- hover, click, drag ---- */
  const markAt = (px, py) => marks.find((mark) => Math.abs(px - mark.x) <= 22 && Math.abs(py - mark.y) <= 20)
    || marks.find((mark) => Math.abs(px - mark.cx) <= TW * 1.6 && Math.abs(py - mark.cy) <= TH * 1.8) || null;
  const topAt = (px, py) => tops.find((top) => Math.abs(px - top.x) <= TW * 2 && Math.abs(py - top.y) <= TH * 2.2) || null;

  function placeTip() {
    if (!tip.firstChild) { tip.hidden = true; return; }
    const mark = marks.find((item) => item.m.post === hover && item.x > 0 && item.x < W && item.y > 0 && item.y < Hh) || marks.find((item) => item.m.post === hover);
    if (!mark) { tip.hidden = true; return; }
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(W - box.width - 8, mark.x - box.width / 2));
    let top = mark.y - box.height - 16;
    if (top < 8) top = mark.cy + 18;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, Math.min(Hh - box.height - 8, top))}px`;
  }
  function setHover(post, withTip = true) {
    if (hover === post) return;
    if (hover) hover.row.classList.remove('on');
    hover = post;
    stage.classList.toggle('hit', Boolean(post));
    if (post && withTip) {
      post.row.classList.add('on');
      tip.textContent = '';
      const head = D.createElement('p'); head.className = 'th'; head.dir = 'ltr';
      head.textContent = `${post.no} · ${post.date}${post.newest ? ` · ${L.newest}` : ''}`;
      const name = D.createElement('p'); name.className = 'tn'; name.textContent = post.title; name.lang = post.link.lang; name.dir = 'ltr';
      const text = D.createElement('p'); text.className = 'tx'; text.textContent = post.short; text.lang = post.link.lang; text.dir = 'ltr';
      tip.append(head, name, text);
      if (post === nearPost) { const how = D.createElement('p'); how.className = 'tk'; how.textContent = L.near; tip.append(how); }
      placeTip();
    } else { tip.textContent = ''; tip.hidden = true; }
    dirty = true;
    if (RM()) draw();
  }

  const local = (event) => { const box = cv.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
  let press = null;
  cv.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    press = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y, moved: false, touch: event.pointerType === 'touch', at: performance.now() };
    if (press.touch && !RM()) { const [px, py] = local(event); steer = { x: px, y: py }; path = []; goal = null; }
    cv.setPointerCapture(event.pointerId);
  });
  cv.addEventListener('pointermove', (event) => {
    const [px, py] = local(event);
    if (press) {
      const dx = event.clientX - press.x, dy = event.clientY - press.y;
      if (press.touch) { if (Math.hypot(dx, dy) >= 8) press.moved = true; if (steer) { steer.x = px; steer.y = py; } return; }
      if (!press.moved && Math.hypot(dx, dy) < 5) return;
      press.moved = true; follow = false;
      stage.classList.add('drag');
      setHover(null);
      cam.x = press.cx - dx; cam.y = press.cy - dy; dirty = true;
      if (RM()) draw();
      return;
    }
    if (event.pointerType !== 'touch') { const mark = markAt(px, py); setHover(mark ? mark.m.post : null); }
  });
  cv.addEventListener('pointerup', (event) => {
    const was = press; press = null;
    stage.classList.remove('drag');
    steer = null;
    if (!was || was.moved || (was.touch && performance.now() - was.at > 350)) return;
    const [px, py] = local(event), mark = markAt(px, py), top = mark || topAt(px, py);
    if (mark) { setHover(mark.m.post); walkTo((m) => m === mark.m, true); } else if (top) walkTo((m) => m === top.m, false);
  });
  cv.addEventListener('pointercancel', () => { press = null; steer = null; stage.classList.remove('drag'); });
  cv.addEventListener('pointerleave', () => { if (!press) setHover(null); });

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  stage.addEventListener('keydown', (event) => {
    if (event.target !== stage || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = KEYS[event.key];
    if (key) {
      event.preventDefault();
      path = []; goal = null;
      if (RM()) { keys.add(key); if (step(...keyVector(), 1)) { follow = true; cam.x = worldX(fig.i, fig.j); cam.y = worldY(fig.i, fig.j, fig.z) - 10; updateNear(); } keys.clear(); draw(); } else keys.add(key);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (event.key === ' ' || nearPost) act();
    }
  });
  stage.addEventListener('keyup', (event) => { keys.delete(KEYS[event.key]); });
  stage.addEventListener('blur', () => keys.clear());
  $('center').addEventListener('click', () => { follow = true; dirty = true; if (RM()) { cam.x = worldX(fig.i, fig.j); cam.y = worldY(fig.i, fig.j, fig.z) - 10; draw(); } });

  const readButton = $('read'), scoreEl = $('score');
  readButton.addEventListener('click', () => { if (nearPost) openPost(nearPost); });
  $('jump').addEventListener('click', startJump);
  if (matchMedia('(hover: none)').matches) $('hint').textContent = L.hintTouch;

  /* ---- the list drives the map: a row walks the figure to its post and opens it ---- */
  for (const post of posts) {
    post.link.addEventListener('click', (event) => {
      event.preventDefault();
      stage.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
      back = post.link;
      setHover(post, false);
      walkTo((m) => m.post === post, true);
    });
    post.row.addEventListener('pointerenter', () => { if (!opened) setHover(post, false); });
    post.row.addEventListener('pointerleave', () => { if (!opened && hover === post) setHover(null); });
  }

  /* ---- the sheet ---- */
  let back = null;
  const focusable = () => [...panel.querySelectorAll('a[href], button')];
  function openPost(post) {
    if (opened === post) return;
    opened = post;
    tip.hidden = true;
    const meta = $('panel-meta'), title = $('panel-title'), body = $('panel-body');
    meta.textContent = '';
    const when = D.createElement('span'); when.dir = 'ltr'; when.textContent = `${post.no} · ${post.date}`;
    meta.append(when);
    const marksEl = post.row.querySelector('.mks');
    if (marksEl) meta.append(marksEl.cloneNode(true));
    title.textContent = post.title; title.lang = post.link.lang; title.dir = 'ltr';
    const full = post.row.querySelector('.voll').cloneNode(true);
    body.textContent = ''; body.lang = full.lang; body.dir = 'ltr';
    body.append(...full.childNodes);
    if (!back) back = D.activeElement === D.body ? stage : D.activeElement;
    veil.hidden = false; panel.hidden = false;
    panel.scrollTop = 0;
    $('close').focus();
    dirty = true;
    if (RM()) draw();
  }
  function closePost() {
    if (!opened) return;
    opened = null;
    veil.hidden = true; panel.hidden = true;
    setHover(nearPost);
    const target = back; back = null;
    if (target && target.focus) target.focus({ preventScroll: true });
    dirty = true;
    if (RM()) draw();
  }
  $('close').addEventListener('click', closePost);
  veil.addEventListener('click', closePost);
  D.addEventListener('keydown', (event) => {
    root.classList.add('kb');
    if (!opened) return;
    if (event.key === 'Escape') { event.preventDefault(); closePost(); return; }
    if (event.key !== 'Tab') return;
    const items = focusable(), first = items[0], final = items[items.length - 1];
    if (event.shiftKey && D.activeElement === first) { event.preventDefault(); final.focus(); } else if (!event.shiftKey && D.activeElement === final) { event.preventDefault(); first.focus(); }
  });

  new ResizeObserver(resize).observe(stage);
  motion.addEventListener('change', () => { dirty = true; draw(); });
  resize();
  draw();
  updateNear();
  requestAnimationFrame(frame);
  /* for the browser check: where things are and what is open (read-only) */
  window.karte = { state: () => ({ lang: LANG, posts: posts.length, figure: { i: fig.i, j: fig.j, z: fig.z }, camera: { x: cam.x, y: cam.y }, opened: opened ? opened.no : null, near: nearPost ? nearPost.no : null, jumping: jump > 0, walking: path.length > 0, score, hover: hover ? hover.no : null, marks: marks.map((mark) => ({ no: mark.m.post.no, x: mark.x, y: mark.y })), free: tops.filter((top) => !top.m.post).map((top) => ({ x: top.x, y: top.y })), tile: [PA, PB] }) };
})();
