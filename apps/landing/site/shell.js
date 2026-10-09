/*! dreambau.com landing page – runtime ("shell").
 *
 * Hand-written, no dependencies, no network access. It plays exactly one of the productions in
 * ./p/ (picked at random on every load; force one with ?anim=4k|16k|64k). A production is a
 * real-time WebGL2 picture plus music that is synthesised in the browser (WebAudio, no samples).
 * The runtime provides the rest: the tagline as a signed-distance texture, the audio clock, the
 * sound switch, Esc/skip, the closing line and the fallbacks. The API is documented in docs/CONTRACT.md.
 */
(() => {
'use strict';

const doc = document, $ = id => doc.getElementById(id), root = doc.documentElement;
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');                       // headless test mode: no autoplay, no adaptive scaling, manual clock
const D = (window.Dream = window.Dream || {});
D.ids = ['4k', '16k', '64k'];
D.prods = D.prods || {};                          // a single-file build registers the productions before the runtime runs
D.add = def => { D.prods[def.id] = def; };
D.state = Object.assign(D.state || {}, { id: null, T: 0, audio: 'idle', muted: false, mode: 'boot', error: null, scale: 1, fps: 0, lang: 'de', langSource: 'fallback', langFallback: '', ...D.state });   // the object that i18n.js writes into stays

const ER = 100;                                   // audio-energy envelope rate (values per second)
const SR = 44100;                                 // sample rate of the generated music
const TAIL = 2.5;                                 // seconds of reverb tail rendered after the production
const AUDIO_PREF = 'dreambau.sound';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
};

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------
let def = null, gl = null, canvas = $('c');
let W = 2, H = 2, scale = 1, maxPx = 2.4e6;
let T = 0, last = 0, raf = 0, hidden = doc.hidden, running = false, skipping = false, finished = false;
let drawProg = null;                              // set for `frag` productions
const TT = [0, 0, 1, .4];                         // tagline block in p-space: centre x, y, half width, half height
let ctaShown = false, overlayPaused = false;
const paused = () => hidden || overlayPaused;

const A = {                                       // audio
  ctx: null, gain: null, src: null, buf: null, env: null, ready: false, failed: false,
  playing: false, startCtx: 0, startT: 0, muted: false,
};
const ui = { snd: $('snd'), skip: $('skip'), cta: $('cta'), dip: $('dip'), play: $('play'), tag: $('tag') };

// ---------------------------------------------------------------------------------------------
// Tagline as signed-distance field (system font rasterised at runtime; nothing is downloaded)
// ---------------------------------------------------------------------------------------------
const TX = { W: 1024, H: 0, SPREAD: 14, tex: null, mask: null, lines: [] };

// Squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on a w×h grid.
function edt1d(grid, offset, stride, length, f, v, z) {
  const INF = 1e20;
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], d = q - r;
    grid[offset + q * stride] = f[r] + d * d;
  }
}
function edt(grid, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

function buildText(lines, lang = D.state.lang, dir = root.dir) {
  const SW = TX.W, SP = TX.SPREAD, INF = 1e20;
  const fam = '"Inter","SF Pro Display","Segoe UI",Roboto,"Helvetica Neue",Arial,"Liberation Sans","DejaVu Sans",system-ui,sans-serif';
  const cv = doc.createElement('canvas'); cv.width = SW; cv.height = 8;
  const attached = lang === 'ja' || lang === 'zh-Hans';
  if (attached) { cv.hidden = true; cv.lang = lang; doc.body.appendChild(cv); }
  try {
  const x = cv.getContext('2d', { willReadFrequently: true });
  const wght = 800, rel = lines.map((_, i) => i === lines.length - 1 ? 1 : .68);   // lead-in lines are smaller than the brand line
  let F = 200;
  x.font = `${wght} ${F}px ${D.i18n ? D.i18n.fam : fam}`;
  F *= Math.min(1, .93 * SW / Math.max(...lines.map((l, i) => x.measureText(l).width * rel[i])));
  const bands = rel.map(r => Math.round(F * r * 1.32));
  const SH = Math.ceil((bands.reduce((a, b) => a + b, 0) + SP * 2) / 4) * 4;
  cv.height = SH;
  const N = SW * SH, data = new Uint8Array(N * 4).fill(0), mask = new Uint8Array(N);
  const outer = new Float64Array(N), inner = new Float64Array(N);
  let y0 = SP;
  const rasterLines = [];
  lines.forEach((txt, li) => {
    x.clearRect(0, 0, SW, SH);
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = `${wght} ${F * rel[li]}px ${D.i18n ? D.i18n.fam : fam}`;
    x.direction = li === lines.length - 1 ? 'ltr' : dir || 'ltr';
    const m = x.measureText('x'), asc = m.actualBoundingBoxAscent || F * rel[li] * .5;
    x.fillText(txt, SW / 2, y0 + bands[li] * .5 + asc / 2);
    const px = x.getImageData(0, 0, SW, SH).data;
    for (let i = 0; i < N; i++) {                    // anti-aliased coverage → sub-pixel accurate field
      const a = px[i * 4 + 3] / 255;
      outer[i] = a === 1 ? 0 : a === 0 ? INF : Math.max(0, .5 - a) ** 2;
      inner[i] = a === 1 ? INF : a === 0 ? 0 : Math.max(0, a - .5) ** 2;
      if (a > .5) mask[i] = 255;
    }
    edt(outer, SW, SH); edt(inner, SW, SH);
    for (let yy = 0; yy < SH; yy++) {
      const dst = (SH - 1 - yy) * SW;                // GL row 0 = bottom of the block
      for (let xx = 0; xx < SW; xx++) {
        const i = yy * SW + xx, sd = Math.sqrt(inner[i]) - Math.sqrt(outer[i]);   // positive inside
        data[(dst + xx) * 4 + li] = clamp(Math.round((sd / (2 * SP) + .5) * 255), 0, 255);
      }
    }
    rasterLines.push({ text: txt, y: y0, h: bands[li] });
    y0 += bands[li];
  });
  for (let i = 0; i < N; i++) data[i * 4 + 3] = 255;
  return { H: SH, F, data, mask, lines: rasterLines };
  } finally { if (attached) cv.remove(); }
}

if (D.i18n) D.i18n.redraw = (lines, lang, dir) => {
  if (!gl || root.classList.contains('static')) return true;
  const old = { ...TX };
  try {
    const raster = buildText(lines, lang, dir);
    Object.assign(TX, raster, { tex: null, ptsTex: null });
    uploadText(); if (def.pts) uploadPoints(def.pts);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Tagline upload failed');
    layout(); draw();
  } catch {
    if (TX.tex && TX.tex !== old.tex) gl.deleteTexture(TX.tex);
    if (TX.ptsTex && TX.ptsTex !== old.ptsTex) gl.deleteTexture(TX.ptsTex);
    Object.assign(TX, old); return false;
  }
  if (old.tex) gl.deleteTexture(old.tex); if (old.ptsTex) gl.deleteTexture(old.ptsTex);
  return true;
};

function uploadText() {
  TX.tex = gl.createTexture(); if (!TX.tex) throw new Error('Tagline texture unavailable');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TX.tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TX.W, TX.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, TX.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

// n random points inside the glyphs → RGBA32F texture, 1024 wide: (x/hw, y/hw, line, random). Texture unit 1.
function uploadPoints(n) {
  const w = 1024, h = Math.ceil(n / w), a = new Float32Array(w * h * 4), SW = TX.W, SH = TX.H;
  let s = 0x9e3779b9, k = 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lineOf = y => { for (let i = 0; i < TX.lines.length; i++) if (y < TX.lines[i].y + TX.lines[i].h) return i; return TX.lines.length - 1; };
  for (let tries = 0; k < n && tries < n * 400; tries++) {
    const px = rnd() * SW, py = rnd() * SH;
    if (!TX.mask[(py | 0) * SW + (px | 0)]) continue;
    a[k * 4] = (px / SW) * 2 - 1;                     // -1..1 across the block width
    a[k * 4 + 1] = -(py / SH * 2 - 1) * (SH / SW);    // y up, same unit as x
    a[k * 4 + 2] = lineOf(py);
    a[k * 4 + 3] = rnd();
    k++;
  }
  TX.ptsTex = gl.createTexture(); if (!TX.ptsTex) throw new Error('Tagline points unavailable');
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, TX.ptsTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, a);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
}

// ---------------------------------------------------------------------------------------------
// GL helpers for productions
// ---------------------------------------------------------------------------------------------
const VS_TRI = '#version 300 es\nvoid main(){vec2 v=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(v*2.-1.,0.,1.);}';

const preFS = () => `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform vec2 R;      // drawing-buffer size in pixels
uniform float T;     // production time in seconds (keeps running after the end)
uniform vec4 E;      // live audio energy 0..1: x low, y mid, z high, w overall
uniform vec4 TT;     // tagline block in p-space (p=(2.*gl_FragCoord.xy-R)/R.y): xy centre, z half width, w half height
uniform sampler2D S; // tagline distance field, rgb = the three lines
uniform sampler2D P; // text-target points, see tpt()
out vec4 O;
#define PI 3.14159265359
#define TAU 6.28318530718
const float TSW=${TX.W}.,TSP=${TX.SPREAD}.;
uint pcg(uint v){v=v*747796405u+2891336009u;v=((v>>((v>>28u)+4u))^v)*277803737u;return (v>>22u)^v;}
float h1(float x){return float(pcg(floatBitsToUint(x)))*2.3283064e-10;}
float h2(vec2 p){return float(pcg(floatBitsToUint(p.x)^pcg(floatBitsToUint(p.y))))*2.3283064e-10;}
vec2 h22(vec2 p){uint a=pcg(floatBitsToUint(p.x)^pcg(floatBitsToUint(p.y)));return vec2(float(a),float(pcg(a)))*2.3283064e-10;}
vec3 h3(vec3 p){uint a=pcg(floatBitsToUint(p.x)^pcg(floatBitsToUint(p.y)^pcg(floatBitsToUint(p.z))));uint b=pcg(a),c=pcg(b);return vec3(float(a),float(b),float(c))*2.3283064e-10;}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
float vn3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h2(i.xy+i.z*37.),h2(i.xy+vec2(1,0)+i.z*37.),f.x),mix(h2(i.xy+vec2(0,1)+i.z*37.),h2(i.xy+1.+i.z*37.),f.x),f.y),mix(mix(h2(i.xy+(i.z+1.)*37.),h2(i.xy+vec2(1,0)+(i.z+1.)*37.),f.x),mix(h2(i.xy+vec2(0,1)+(i.z+1.)*37.),h2(i.xy+1.+(i.z+1.)*37.),f.x),f.y),f.z);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+17.1;a*=.5;}return s;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
// signed distances (p-space units, negative inside the glyphs) to the three lines of the tagline
vec3 tdist(vec2 p){vec2 q=(p-TT.xy)/TT.zw;vec3 d=(.5-texture(S,q*.5+.5).rgb)*2.*TSP*(TT.z/(TSW*.5));vec2 o=max(abs(q)-1.,0.)*TT.zw;return d+length(o);}
float tsd(vec2 p){vec3 d=tdist(p);return min(d.x,min(d.y,d.z));}
// i-th text-target point: xy relative to TT.xy in units of TT.z (x -1..1), z = line 0..2, w = random 0..1
vec4 tpt(int i){return texelFetch(P,ivec2(i&1023,i>>10),0);}
`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log || '');
    const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 1).join('\n') : '';
    throw new Error(`shader compile error (${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'}): ${log}\n${ctx}`);
  }
  return s;
}

// prog(vs, fs): vs/fs are GLSL bodies; the runtime prepends the prelude to the fragment shader. vs defaults to the full-screen triangle.
D.prog = (vs, fs) => {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs ? (vs.startsWith('#version') ? vs : '#version 300 es\n' + vs) : VS_TRI));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs.startsWith('#version') ? fs : preFS() + fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('shader link error: ' + gl.getProgramInfoLog(p));
  p.u = {};
  return p;
};
// Prelude declarations for a vertex shader that wants the common uniforms.
D.preVS = () => '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\nuniform vec2 R;uniform float T;uniform vec4 E;uniform vec4 TT;uniform sampler2D S;uniform sampler2D P;\n#define PI 3.14159265359\n#define TAU 6.28318530718\nvec4 tpt(int i){return texelFetch(P,ivec2(i&1023,i>>10),0);}\nuint pcg(uint v){v=v*747796405u+2891336009u;v=((v>>((v>>28u)+4u))^v)*277803737u;return (v>>22u)^v;}\nfloat h1(float x){return float(pcg(floatBitsToUint(x)))*2.3283064e-10;}\n';
const loc = (p, n) => (n in p.u ? p.u[n] : (p.u[n] = gl.getUniformLocation(p, n)));
let curEnv = [0, 0, 0, 0];
// bind(p): use program and set the common uniforms (R, T, E, TT, S, P).
D.bind = p => {
  gl.useProgram(p);
  let l;
  if ((l = loc(p, 'R'))) gl.uniform2f(l, W, H);
  if ((l = loc(p, 'T'))) gl.uniform1f(l, T);
  if ((l = loc(p, 'E'))) gl.uniform4f(l, curEnv[0], curEnv[1], curEnv[2], curEnv[3]);
  if ((l = loc(p, 'TT'))) gl.uniform4f(l, TT[0], TT[1], TT[2], TT[3]);
  if ((l = loc(p, 'S'))) gl.uniform1i(l, 0);
  if ((l = loc(p, 'P'))) gl.uniform1i(l, 1);
  return p;
};
D.tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
// rt(w, h, float): offscreen colour target { tex, fb, w, h }. float → RGBA16F when renderable, else RGBA8.
D.rt = (w, h, float, linear = true) => {
  const tex = gl.createTexture(), fb = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const hf = float && gl.getExtension('EXT_color_buffer_float');
  if (hf) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.activeTexture(gl.TEXTURE0);
  return { tex, fb, w, h, float: !!hf };
};
D.size = () => [W, H];
D.gl = () => gl;
D.text = TX;

// ---------------------------------------------------------------------------------------------
// Music kit (WebAudio, rendered offline). Productions schedule notes at absolute times in seconds.
// ---------------------------------------------------------------------------------------------
D.kit = (c, dest, layer = 0, layers = 1) => {
  const sr = c.sampleRate;
  // The music is rendered by `layers` parallel offline contexts. Every sound event (o, n, p, or a custom source guarded
  // with K.mine()) belongs to exactly one of them, in creation order; buses, sends and automation exist in all of them.
  let ev = 0;
  const mine = () => ev++ % layers === layer, nop = c.createGain();
  const nb = c.createBuffer(1, sr * 2, sr), nd = nb.getChannelData(0);
  for (let i = 0, s = 1234567; i < nd.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; nd[i] = s / 2147483648 - 1; }
  const K = {
    c, sr, out: dest, noise: nb, mine,
    hz: n => 440 * 2 ** ((n - 69) / 12),
    // Tone with exponential pitch glide f1→f2 over gt seconds and exponential decay over d seconds. Returns the gain node.
    o(type, t, d, f1, f2, v, to = dest, gt = d) {
      if (!mine()) return nop;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + gt);
      g.gain.setValueAtTime(1e-4, t);
      g.gain.linearRampToValueAtTime(v, t + .004);
      g.gain.exponentialRampToValueAtTime(1e-4, t + d);
      o.connect(g).connect(to);
      o.start(t); o.stop(t + d + .02);
      return g;
    },
    // Filtered noise burst, filter sweeps f1→f2, exponential decay. type: bandpass | highpass | lowpass
    n(t, d, f1, f2, q, v, to = dest, type = 'bandpass') {
      if (!mine()) return nop;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = nb; s.loop = true;
      f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f1, t);
      if (f2 && f2 !== f1) f.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(1e-4, t);
      g.gain.linearRampToValueAtTime(v, t + .002);
      g.gain.exponentialRampToValueAtTime(1e-4, t + d);
      s.connect(f).connect(g).connect(to);
      s.start(t, (t * 7.31) % 1.5); s.stop(t + d + .02);
      return g;
    },
    // Sustained note: attack a, held for d, release r; optional second detuned oscillator (det cents) and low-pass lp (Hz).
    p(type, t, d, f, v, a = .05, r = .3, to = dest, lp = 0, det = 0) {
      if (!mine()) return nop;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, t + Math.max(a, d));
      g.gain.linearRampToValueAtTime(0, t + Math.max(a, d) + r);
      let tail = g;
      if (lp) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; g.connect(f2); tail = f2; }
      tail.connect(to);
      for (const dt of det ? [-det, det] : [0]) {
        const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = dt;
        o.connect(g); o.start(t); o.stop(t + Math.max(a, d) + r + .02);
      }
      return g;
    },
    // Stereo reverb from generated noise. Returns the send input; wet is the return level.
    rev(sec = 2.5, decay = 3, wet = .3, to = dest, damp = .25) {
      const len = sr * sec | 0, ir = c.createBuffer(2, len, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0, s = 98765 + ch * 7771; i < len; i++) {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          lp += damp * ((s / 2147483648 - 1) - lp);
          d[i] = lp * (1 - i / len) ** decay;
        }
      }
      const conv = c.createConvolver(), i = c.createGain(), g = c.createGain();
      conv.buffer = ir; g.gain.value = wet;
      i.connect(conv); conv.connect(g).connect(to);
      return i;
    },
    // Feedback delay (dark). Returns the send input.
    dly(time, fb, wet = .3, to = dest, lp = 2800) {
      const d = c.createDelay(2), f = c.createGain(), w = c.createGain(), i = c.createGain(), l = c.createBiquadFilter();
      d.delayTime.value = time; f.gain.value = fb; w.gain.value = wet; l.type = 'lowpass'; l.frequency.value = lp;
      i.connect(d); d.connect(l); l.connect(f); f.connect(d); l.connect(w); w.connect(to);
      return i;
    },
    // Gain + pan stage: returns the input node.
    bus(v = 1, pan = 0, to = dest) {
      const g = c.createGain(); g.gain.value = v;
      if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(to); } else g.connect(to);
      return g;
    },
    // Sidechain-style pumping: dip `param` at every time in `times` and let it recover.
    duck(param, times, depth = .35, rel = .14, lead = 0) {
      param.setValueAtTime(1, 0);
      for (const t of times) { param.setTargetAtTime(depth, t - lead, .004); param.setTargetAtTime(1, t - lead + .035, rel); }
    },
    // Soft-clip saturation stage: returns the input node.
    sat(amount = 2, to = dest) {
      const w = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
      w.curve = curve; w.oversample = '2x'; w.connect(to);
      return w;
    },
  };
  return K;
};

// ---------------------------------------------------------------------------------------------
// Audio: offline render → normalise → analyse → play
// ---------------------------------------------------------------------------------------------
const AC = window.AudioContext || window.webkitAudioContext;
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const idle = () => new Promise(r => setTimeout(r, 0));

// How many offline contexts render the music in parallel (each on its own audio thread): up to 4, fewer on small devices.
function layerCount() {
  const q = +Q.get('ctx'); if (q >= 1) return Math.min(8, q | 0);
  const hc = navigator.hardwareConcurrency || 2, dm = navigator.deviceMemory || 4;
  return clamp(Math.min(hc, dm >= 4 ? 4 : dm >= 2 ? 2 : 1), 1, 4);
}
const masterComp = c => {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 3.5; comp.attack.value = .006; comp.release.value = .2;
  return comp;
};

async function renderMusic() {
  if (!OAC || !def.music) throw new Error('no offline audio');
  const len = Math.ceil((def.dur + TAIL) * SR), n = layerCount();
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => {
    const c = new OAC(2, len, SR), master = c.createGain();
    if (n === 1) master.connect(masterComp(c)).connect(c.destination); else master.connect(c.destination);
    def.music(D.kit(c, master, i, n), D);
    return c.startRendering();
  }));
  if (n === 1) return parts[0];
  const mix = parts[0];
  for (let i = 1; i < n; i++) {
    for (let ch = 0; ch < 2; ch++) { const a = mix.getChannelData(ch), b = parts[i].getChannelData(ch); for (let k = 0; k < a.length; k++) a[k] += b[k]; }
    parts[i] = null;
  }
  // master dynamics once on the summed mix: the same chain a single context has in its graph
  const c = new OAC(2, len, SR), src = c.createBufferSource();
  src.buffer = mix; src.connect(masterComp(c)).connect(c.destination); src.start();
  return c.startRendering();
}

async function finalise(buf) {                    // loudness, fades, then the envelope used by the visuals
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)];
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i += 2) { const a = ch[0][i], b = ch[1][i]; peak = Math.max(peak, Math.abs(a), Math.abs(b)); sum += a * a + b * b; }
  const rms = Math.sqrt(sum / (n / 2 * 2)) || 1e-6;
  const g = Math.min(.89 / (peak || 1), .1 / rms, 8);          // peak at most -1 dBFS, programme about -20 dBFS RMS
  const fi = Math.round(.04 * SR), fo = Math.round(1.6 * SR);
  for (let c = 0; c < 2; c++) {
    const d = ch[c];
    for (let i = 0; i < n; i++) {
      let m = g;
      if (i < fi) m *= i / fi;
      if (i > n - fo) m *= .5 + .5 * Math.cos(Math.PI * (i - (n - fo)) / fo);
      d[i] *= m;
    }
  }
  await idle();
  // energy envelope: low / mid / high band + overall, ER values per second, normalised by the 98th percentile
  const hop = Math.round(SR / ER), m = Math.ceil(n / hop), raw = new Float32Array(m * 4);
  const a1 = 1 - Math.exp(-2 * Math.PI * 180 / SR), a2 = 1 - Math.exp(-2 * Math.PI * 2500 / SR);
  let l1 = 0, l2 = 0;
  for (let k = 0; k < m; k++) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, cnt = 0;
    for (let i = k * hop, e = Math.min(n, i + hop); i < e; i++, cnt++) {
      const x = (ch[0][i] + ch[1][i]) * .5;
      l1 += a1 * (x - l1); l2 += a2 * (x - l2);
      const lo = l1, mi = l2 - l1, hi = x - l2;
      s0 += lo * lo; s1 += mi * mi; s2 += hi * hi; s3 += x * x;
    }
    raw[k * 4] = Math.sqrt(s0 / cnt); raw[k * 4 + 1] = Math.sqrt(s1 / cnt); raw[k * 4 + 2] = Math.sqrt(s2 / cnt); raw[k * 4 + 3] = Math.sqrt(s3 / cnt);
    if (k % 800 === 799) await idle();
  }
  const env = new Float32Array(m * 4), rel = Math.exp(-1 / (ER * .14));
  for (let b = 0; b < 4; b++) {
    const col = []; for (let k = 0; k < m; k++) col.push(raw[k * 4 + b]);
    const p98 = col.slice().sort((x, y) => x - y)[Math.floor(m * .98)] || 1e-6;
    let e = 0;
    for (let k = 0; k < m; k++) { e = Math.max(col[k] / p98, e * rel); env[k * 4 + b] = Math.min(1, e); }
  }
  A.env = env;
  return buf;
}

function envAt(t) {
  const e = A.env;
  if (!e) return curEnv = [0, 0, 0, 0];
  const x = clamp(t, 0, (e.length / 4 - 2) / ER) * ER, i = Math.floor(x), f = x - i;
  curEnv = [0, 1, 2, 3].map(b => e[i * 4 + b] * (1 - f) + e[(i + 1) * 4 + b] * f);
  return curEnv;
}

function setSnd(state) {
  if (A.failed) state = 'na';                     // no usable sound: the switch stays hidden, whatever happens next
  const b = ui.snd;
  b.dataset.state = state; D.state.audio = state;
  const on = state === 'on' || state === 'wait';
  b.setAttribute('aria-checked', on ? 'true' : 'false');          // role="switch" named "Ton": on = the sound is (or is about to be) on
  b.title = (D.t && D.t(on ? 'snd.hint_off' : 'snd.hint_on')) || (on ? 'Ton aus (M)' : 'Ton an (M)');
  b.hidden = state === 'na';
}

function audioReady() {
  if (!A.failed) A.ctx = A.ctx || makeCtx();
  if (A.failed || !A.ctx) { A.failed = true; return setSnd('na'); }
  maybeStart();
}

function makeCtx() {
  if (!AC || TEST) return null;
  try {
    const ctx = new AC({ latencyHint: 'playback' });
    A.gain = ctx.createGain(); A.gain.gain.value = A.muted ? 0 : 1; A.gain.connect(ctx.destination);
    ctx.onstatechange = () => {
      if (ctx.state === 'running') { if (A.ready) maybeStart(); else setSnd(A.muted ? 'off' : 'wait'); }
      else if (ctx.state === 'suspended' && !paused() && !A.playing && !A.muted) setSnd('blocked');
    };
    return ctx;
  } catch (e) { return null; }
}

function maybeStart() {                           // start playback as soon as the browser lets us and the music exists
  const ctx = A.ctx;
  if (!ctx || A.playing || !A.ready || paused()) return;
  if (ctx.state !== 'running') { if (!A.muted) setSnd('blocked'); else setSnd('off'); return; }
  if (T >= def.fin + .1 || skipping) { setSnd(A.muted ? 'off' : 'on'); return; }       // too late: the show is over
  const when = ctx.currentTime + .06, off = clamp(T + .06, 0, A.buf.duration - .01);
  const src = ctx.createBufferSource();
  src.buffer = A.buf; src.connect(A.gain);
  src.onended = () => { if (A.src === src) { A.playing = false; A.src = null; } };
  const g = A.gain.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(0, ctx.currentTime);
  g.linearRampToValueAtTime(A.muted ? 0 : 1, ctx.currentTime + (off > 3 ? .5 : .08));
  src.start(when, off);
  A.src = src; A.playing = true; A.startCtx = when; A.startT = off;
  setSnd(A.muted ? 'off' : 'on');
}

function audioNow() {                             // production time implied by the audio output position, or null
  const ctx = A.ctx;
  if (!A.playing || !ctx || ctx.state !== 'running') return null;
  let out;
  const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
  if (ts && ts.performanceTime > 0) out = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
  else out = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  return A.startT + (out - A.startCtx);
}

function setMuted(m, remember = true) {
  A.muted = m; D.state.muted = m;
  if (remember) store.set(AUDIO_PREF, m ? 'off' : null);
  if (A.ctx && A.gain) { const g = A.gain.gain, t = A.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(m ? 0 : 1, t, .05); }
  if (!A.ctx || A.ctx.state === 'running') setSnd(m ? 'off' : (A.ready ? 'on' : 'wait'));
  else setSnd(m ? 'off' : 'blocked');
  if (!m) unlock();
}

function unlock() {                               // must run inside a user gesture
  if (!A.ctx || paused()) return;
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  if (A.ctx.state !== 'running') { const p = A.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  maybeStart();
}

function stopAudio(fade = .3) {
  const ctx = A.ctx;
  if (!ctx || !A.src) return;
  const t = ctx.currentTime, g = A.gain.gain;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
  try { A.src.stop(t + fade + .02); } catch (e) { /* already stopped */ }
  A.playing = false; A.src = null;
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------
function layout() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.max(1, root.clientWidth), ch = Math.max(1, root.clientHeight);
  let s = dpr * scale;
  s = Math.min(s, Math.sqrt(maxPx / (cw * ch)));
  W = Math.max(2, Math.round(cw * s)); H = Math.max(2, Math.round(ch * s));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const asp = W / H, hw = Math.min(asp * .88, .92);
  TT[0] = 0; TT[1] = 0; TT[2] = hw; TT[3] = hw * TX.H / TX.W;
  D.state.scale = scale;
}

const drawListeners = new Set();
D.onDraw = fn => { drawListeners.add(fn); return () => drawListeners.delete(fn); };
D.redraw = () => { if (gl && def) guard(draw); };
function draw() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TX.tex);
  if (TX.ptsTex) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, TX.ptsTex); gl.activeTexture(gl.TEXTURE0); }
  envAt(T);
  if (drawProg) { D.bind(drawProg); D.tri(); }
  else def.draw(gl, T, D);
  for (const listener of drawListeners) { try { listener(T); } catch (error) { console.warn("[dreambau] source preview:", error); } }
}

function guard(fn) {
  try { fn(); } catch (e) { fail(e); }
}

function fail(e) {
  console.error('[dreambau] ' + (e && e.stack || e));
  D.state.error = String(e && e.message || e);
  cancelAnimationFrame(raf); running = false;
  A.failed = true; A.ready = false;               // the static page stays silent, also after the tab was hidden and shown again
  stopAudio(.1);
  setTimeout(() => { const c = A.ctx; A.ctx = null; try { if (c) c.close(); } catch (err) { /* already closed */ } }, 250);
  root.classList.add('static', 'done'); root.classList.remove('ready');
  ui.cta.classList.add('on');
}

function scheduleFrame() { if (running && !paused() && !raf) raf = requestAnimationFrame(frame); }
function pauseChanged() {
  if (paused()) { cancelAnimationFrame(raf); raf = 0; if (A.ctx) A.ctx.suspend().catch(() => {}); }
  else {
    last = performance.now();
    if (A.ctx && (A.playing || !A.muted)) A.ctx.resume().then(maybeStart).catch(() => {});
    scheduleFrame();
  }
}
let frames = 0, lastAdapt = 0, fpsT = 0, fpsN = 0;
function frame(now) {
  raf = 0;
  if (!running || paused()) return;
  let dt = Math.min(2, Math.max(0, (now - last) / 1000)); last = now;   // wall-clock time; the cap only guards against a long stall (sleep)
  const overT = T - def.dur;
  // clock: free-running, gently pulled towards the audio position when sound is playing
  const a = audioNow();
  let rate = 1;
  if (a != null) { const err = a - T; if (Math.abs(err) > .6) T = a; else rate = clamp(1 + err * .6, .6, 1.4); }
  T = Math.min(def.dur + TAIL, T + dt * rate);
  guard(() => draw());
  // finishing touches driven by the clock
  if (!ctaShown && T >= def.cta) showCta();
  if (!finished && T >= def.fin) { finished = true; root.classList.add('done'); }
  D.state.T = T;
  // performance monitor (not in test mode): lower the render scale when the frame rate stays low
  if (!TEST && overT < 0) {
    fpsT += dt; fpsN++;
    if (fpsT >= 1) { D.state.fps = Math.round(fpsN / fpsT); if (fpsN / fpsT < 40 && frames > 90 && now - lastAdapt > 1500 && scale > .5) { scale = Math.max(.5, scale * .8); lastAdapt = now; layout(); } fpsT = 0; fpsN = 0; }
  }
  frames++;
  // Keep all sixty seconds and the music tail, then retain this final frame without a polling loop.
  if (T >= def.dur + TAIL) running = false;
  scheduleFrame();
}

function showCta() { ctaShown = true; ui.cta.classList.add('on'); }

function skip() {
  if (!running || skipping || T >= def.fin) { if (T < def.cta) showCta(); return; }
  skipping = true;
  ui.dip.classList.add('on');
  stopAudio(.25);
  setTimeout(() => {
    T = def.fin + .3; if (!ctaShown) showCta();
    finished = true; root.classList.add('done');
    running = false; cancelAnimationFrame(raf); raf = 0;
    D.state.T = T; guard(draw);
    ui.dip.classList.remove('on');
    setTimeout(() => { skipping = false; }, 300);
  }, 260);
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------
function pickId() {
  const a = Q.get('anim');
  if (a) {
    if (D.ids.includes(a)) return a;
    const n = parseInt(a, 10); if (n >= 1 && n <= D.ids.length) return D.ids[n - 1];
    if ((TEST || Q.has('dev')) && /^\w+$/.test(a)) return a;   // work-in-progress productions are only reachable with ?test or ?dev
  }
  const r = window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 4294967296);
  return D.ids[r % D.ids.length];
}

function loadProduction(id) {
  if (D.prods[id]) return Promise.resolve(D.prods[id]);
  return new Promise((res, rej) => {
    const s = doc.createElement('script');
    s.src = `p/${id}.js`; s.async = true;
    s.onload = () => D.prods[id] ? res(D.prods[id]) : rej(new Error('production ' + id + ' did not register'));
    s.onerror = () => rej(new Error('cannot load production ' + id));
    doc.head.appendChild(s);
  });
}

function getGL() {
  const o = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST, desynchronized: false };
  return canvas.getContext('webgl2', o);
}

function wire() {
  ui.snd.addEventListener('click', e => {
    e.stopPropagation();
    const s = ui.snd.dataset.state;
    if (s === 'blocked') { A.muted = false; setMuted(false); }
    else setMuted(!(s === 'off'));
  });
  ui.skip.addEventListener('click', skip);
  ui.play.addEventListener('click', () => { if (gl && !running) { go(); unlock(); } });
  const onButton = e => e.target instanceof Element && !!e.target.closest('button');
  addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.closest('#lang, #langsheet')) return;
    if (e.key === 'Escape') skip();
    else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) setMuted(!A.muted);
    else if (!A.muted && A.ctx && A.ctx.state !== 'running' && !onButton(e)) unlock();   // Enter/Space on a button is its click
  });
  // any real gesture may unlock the audio (browsers refuse to start sound before that); the sound button itself is
  // left out: its click handler decides between "switch on" and "switch off"
  const g = e => { if (A.ctx && A.ctx.state !== 'running' && !A.muted && !(e.target instanceof Element && e.target.closest('#snd, #lang, #langsheet, #langback'))) unlock(); };
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) addEventListener(ev, g, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => {
    hidden = doc.hidden;
    pauseChanged();
  });
  const menu = $('site-menu'), languages = $('langsheet');
  const overlaysChanged = () => {
    const next = !!(menu?.open || languages && !languages.hidden);
    if (next !== overlayPaused) { overlayPaused = next; pauseChanged(); }
  };
  const observer = new MutationObserver(overlaysChanged);
  if (menu) observer.observe(menu, { attributes: true, attributeFilter: ['open'] });
  if (languages) observer.observe(languages, { attributes: true, attributeFilter: ['hidden'] });
  overlaysChanged();
  addEventListener('resize', () => { if (gl && !D.state.error) { layout(); guard(draw); } });   // resizing clears the canvas: always redraw
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail(new Error('webgl context lost')); });
}

// Still final composition for visitors who prefer reduced motion (no animation, no sound).
function showStill() {
  A.muted = true; D.state.muted = true; setSnd('off');
  root.classList.add('still', 'done');
  T = def.fin + .3; layout(); guard(draw); showCta();
  running = false; D.state.T = T; D.state.mode = 'still';
}

// Start the show: the picture runs at once, the music renders in the background and joins as soon as it is
// ready and the browser allows sound.
let job = null;                                   // the music render, started as early as possible
const startAudioJob = () => job = job || renderMusic().then(finalise).then(buf => { A.buf = buf; A.ready = true; }).catch(e => { console.warn('[dreambau] audio unavailable:', e); A.failed = true; });

function go() {
  A.muted = store.get(AUDIO_PREF) === 'off'; D.state.muted = A.muted;
  setSnd(A.muted ? 'off' : 'wait');
  const audioP = startAudioJob();
  if (!TEST) {
    A.ctx = A.ctx || makeCtx();
    if (A.ctx && !A.muted) { try { A.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } }
    setTimeout(() => { if (A.ctx && A.ctx.state !== 'running' && !A.muted && !A.playing) setSnd('blocked'); }, 150);
  }
  audioP.then(() => { if (TEST) { if (A.failed) setSnd('na'); return; } audioReady(); });
  D.state.mode = 'play';
  if (TEST) { running = false; D.test = makeTestApi(audioP); return; }
  T = 0; finished = false; ctaShown = false; skipping = false;
  ui.cta.classList.remove('on'); root.classList.remove('done', 'still');
  running = true; last = performance.now(); scheduleFrame();
}

async function boot() {
  if (TEST) root.classList.add('test');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !Q.has('play');
  wire();
  const id = pickId();
  D.state.id = id; root.dataset.anim = id;
  if (D.i18n) D.i18n.apply();
  try {
    def = await loadProduction(id);
    def.fin = def.fin || def.dur - 6; def.cta = def.cta || def.fin + 1.5;
    if (!reduced) startAudioJob();                // renders on other threads while the picture is set up
    await (D.i18n && D.i18n.ready);               // the first tagline is drawn in the page's language (at most 3 s)
    maxPx = def.px || 2.4e6;
    if (Q.has('px')) maxPx = +Q.get('px');
    if (Q.has('q')) scale = clamp(+Q.get('q') || 1, .1, 1);
    gl = getGL();
    if (!gl) throw new Error('WebGL2 is not available');
    Object.assign(TX, buildText((ui.tag.dataset.lines || 'dreambau.com').split('|').slice(0, 3))); uploadText(); layout();
    if (def.pts) uploadPoints(def.pts);
    if (def.frag) drawProg = D.prog(null, def.frag);
    if (def.init) def.init(gl, D);
    draw();
  } catch (e) { return fail(e); }
  root.classList.add('ready');
  if (reduced) showStill(); else go();
}

const px1 = new Uint8Array(4);
const LIN = new Float32Array(256).map((_, i) => (i / 255) ** 2.2);
function frameAt(t) {                             // draw the frame at time t and read it back (RGBA, rows bottom-up)
  T = t; D.state.T = t; layout(); draw();
  const b = new Uint8Array(W * H * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
  return b;
}
const lumOf = (b, i) => .2126 * LIN[b[i]] + .7152 * LIN[b[i + 1]] + .0722 * LIN[b[i + 2]];
function makeTestApi(audioP) {
  const b64 = a => { let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
  return {
    ready: audioP,
    def: () => ({ id: def.id, dur: def.dur, fin: def.fin, cta: def.cta }),
    seek(t) {
      T = t; D.state.T = t; layout(); guard(draw); gl.finish();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);   // forces the GPU to complete (timing, screenshots)
      ui.cta.classList.toggle('on', t >= def.cta); root.classList.toggle('done', t >= def.fin);
      return { T, E: curEnv.slice() };
    },
    size: () => [W, H],
    env: t => envAt(t).slice(),
    audioInfo: () => A.buf ? { sr: A.buf.sampleRate, len: A.buf.length, dur: A.buf.duration } : null,
    pcm16(off, len) {                             // base64 of interleaved 16-bit PCM, for the WAV dump
      const sr = A.buf.sampleRate, i0 = Math.floor(off * sr), n = Math.min(Math.floor(len * sr), A.buf.length - i0);
      const l = A.buf.getChannelData(0), r = A.buf.getChannelData(1), out = new Int16Array(n * 2);
      for (let i = 0; i < n; i++) { out[2 * i] = clamp(l[i0 + i], -1, 1) * 32767; out[2 * i + 1] = clamp(r[i0 + i], -1, 1) * 32767; }
      return b64(new Uint8Array(out.buffer));
    },
    envArray: () => Array.from(A.env || []),
    // mean relative luminance of the whole frame and of its bottom 12 % (where the closing line sits)
    lum(t) {
      const b = frameAt(t), rows = Math.max(1, Math.round(H * .12));
      let all = 0, bot = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = lumOf(b, (y * W + x) * 4); all += l; if (y < rows) bot += l; }
      return { mean: all / (W * H), bottom: bot / (rows * W), W, H };
    },
    // coarse thumbnail (gamma space 0..1, row-major from the top) to compare phases
    thumb(t, tw = 32, th = 18) {
      const b = frameAt(t), out = new Array(tw * th * 3).fill(0), cnt = new Array(tw * th).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const cx = Math.min(tw - 1, x * tw / W | 0), cy = Math.min(th - 1, (H - 1 - y) * th / H | 0), k = cy * tw + cx, i = (y * W + x) * 4;
        out[k * 3] += b[i] / 255; out[k * 3 + 1] += b[i + 1] / 255; out[k * 3 + 2] += b[i + 2] / 255; cnt[k]++;
      }
      for (let k = 0; k < tw * th; k++) { out[k * 3] /= cnt[k]; out[k * 3 + 1] /= cnt[k]; out[k * 3 + 2] /= cnt[k]; }
      return out;
    },
    // luminance contrast of each tagline line against its immediate surroundings at time t
    textContrast(t) {
      const b = frameAt(t), n = TX.lines.length, SW = TX.W, SH = TX.H;
      const inS = new Float64Array(n), inN = new Float64Array(n), rgS = new Float64Array(n), rgN = new Float64Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const qx = ((2 * (x + .5) - W) / H - TT[0]) / TT[2], qy = ((2 * (y + .5) - H) / H - TT[1]) / TT[3];
        if (Math.abs(qx) >= 1 || Math.abs(qy) >= 1) continue;
        const o = ((Math.min(SH - 1, (qy * .5 + .5) * SH | 0)) * SW + Math.min(SW - 1, (qx * .5 + .5) * SW | 0)) * 4;
        let best = 0, bl = 0;
        for (let l = 0; l < n; l++) if (TX.data[o + l] > best) { best = TX.data[o + l]; bl = l; }
        const lum = lumOf(b, (y * W + x) * 4);
        if (best > 140) { inS[bl] += lum; inN[bl]++; } else if (best > 20 && best < 100) { rgS[bl] += lum; rgN[bl]++; }
      }
      return Array.from({ length: n }, (_, l) => {
        const a = inN[l] ? inS[l] / inN[l] : 0, r = rgN[l] ? rgS[l] / rgN[l] : 0;
        return { text: TX.lines[l].text, inside: a, around: r, ratio: (Math.max(a, r) + .05) / (Math.min(a, r) + .05), pixels: inN[l] };
      });
    },
    setScale(s) { scale = s; layout(); },
    setMaxPx(p) { maxPx = p; layout(); },
    skip, setMuted,
    audio: () => ({ ...D.state, playing: A.playing, ctx: A.ctx && A.ctx.state }),
  };
}

D.dbg = () => ({ playing: A.playing, ctx: A.ctx && A.ctx.state, ready: A.ready, failed: A.failed, T, muted: A.muted, gain: A.gain ? A.gain.gain.value : null, audioT: audioNow(), skipping, ctaShown, frames, fin: def && def.fin, dur: def && def.dur, running });

boot();
})();
