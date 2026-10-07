# Contract: how a production plugs into the page

A **production** is one complete audiovisual piece: a real-time WebGL2 picture and music that is synthesised in the
browser. The page (`site/shell.js`, the *runtime*) picks one of the three productions at random on every load, plays it
for about a minute and ends on a calm final composition that shows the tagline and the closing line. The runtime
plays the role the operating system plays for a native demo: it owns the canvas, the clock, the audio output, the sound
switch, Esc/skip, the tagline texture and the fallbacks. A production owns everything that is *seen and heard*.

```
src/p/<id>.js     the production (id = 4k | 16k | 64k), plain classic script, calls Dream.add({...})
site/p/<id>.js    build output (minified); the page loads exactly one of these per visit
```

Build and look: `node tools/build.mjs <id>` · `node tools/shot.mjs <id> --every 5 --sheet` · `node tools/audio.mjs <id>` ·
`node tools/e2e.mjs <id> --dev` (details at the end).

## 1. The production object

```js
Dream.add({
  id: '4k',            // must match the file name
  dur: 60,             // total length in seconds, 50..70. The music has faded out by then.
  fin: 54,             // time at which the final composition (all three text lines) is complete and stable. Skip jumps to fin+0.3.
  cta: 55.5,           // time at which the small closing line fades in (HTML, bottom centre). Default fin+1.5
  px: 2.4e6,           // optional: maximum number of drawing-buffer pixels (default 2.4e6 ≈ 1080p). Lower it for heavy shaders.
  pts: 0,              // optional: number N of random points inside the tagline glyphs → texture P, see tpt()

  frag: `...`,         // EITHER a full-screen fragment shader body (see §2) ...
  init(gl, D) {},      // ... OR custom GL: init once, then draw every frame
  draw(gl, T, D) {},   //     (viewport is set, default framebuffer bound, nothing cleared)

  music(K, D) {},      // schedules the whole piece into an OfflineAudioContext (see §4)
});
```

Rules the runtime relies on:

* **The picture is a function of `T`** (seconds) and the inputs below, not of history. The runtime jumps in time (Esc,
  audio that joins late, the test harness seeks). A frame rendered as the very first frame must look right. No
  `Date.now()`, no `Math.random()` in anything visual: use the hash functions. Feedback/trail buffers are allowed
  only as decoration that does not change the look of the composition when it starts from empty.
* `T` keeps running after `dur` (idle animation of the final composition at 30 fps; the runtime stops rendering after a
  few minutes). Clamp your story with `min(T, …)` and keep the final composition alive with something cheap and slow.
* **The music is deterministic**: same notes on every load (use a seeded generator, never `Math.random()`).
* Scripts are classic scripts (no `import`/`export`). The build wraps the file in an IIFE. Shader sources are written as
  ``/*glsl*/`...` `` (no `${}` inside); the build strips comments and whitespace from them.
* No external assets of any kind, no network, no `fetch`, no fonts, no images, no audio files.

## 2. Shader prelude (prepended to every fragment shader you compile with `D.prog` or `frag`)

GLSL ES 3.00, `precision highp float`. Declared for you:

| name | meaning |
|---|---|
| `uniform vec2 R` | drawing-buffer size in pixels |
| `uniform float T` | production time in seconds |
| `uniform vec4 E` | live energy of the **actual rendered music** at time T, 0..1, fast attack, ~140 ms release: `x` low band (< 180 Hz, kicks/bass), `y` mid, `z` high (hats), `w` overall. Drive glows, pulses, camera shake with it; it is in sync with what is heard. It is 0 until the music exists, so the picture must also look right with `E = 0`. |
| `uniform vec4 TT` | the tagline block in *p-space*: `xy` centre, `z` half width, `w` half height |
| `uniform sampler2D S` | the tagline as three signed-distance fields, one per line (r, g, b) |
| `uniform sampler2D P` | text-target points, read with `tpt()` (only when `pts` is set) |
| `out vec4 O` | the fragment colour |

p-space is `vec2 p = (2.*gl_FragCoord.xy - R) / R.y;` → y in [-1, 1], x in [-aspect, aspect], origin in the centre.
`TT` places the tagline block centred and fitted for the current aspect ratio (landscape, ultrawide, portrait phone).
The three lines are **"Jeht nich…"** (line 0, small), **"jibs nich…"** (line 1, small), **"dreambau.com"** (line 2, large).

Helpers:

```glsl
vec3  tdist(vec2 p)   // signed distance (p-space units, negative = inside glyph) to line 0, 1, 2. 0 at the outline.
float tsd(vec2 p)     // union of the three lines
vec4  tpt(int i)      // i-th text-target point: xy relative to TT.xy in units of TT.z (x in -1..1), z = line 0..2, w = random 0..1
float h1(float), h2(vec2), vec2 h22(vec2), vec3 h3(vec3)    // hashes → [0,1) (integer hash, no sin)
float vn(vec2), vn3(vec3), fbm(vec2)                         // value noise, 5-octave fbm
mat2  rot(float a);  PI, TAU
```

Typical use: `float a = smoothstep(.004, -.004, tdist(p).z);` is a crisp brand line; `exp(-tdist(p).z*30.)` a glow.
A particle system aims at `TT.xy + tpt(i).xy * TT.z`. A 3D scene can map a point on a plane to `p` and call `tsd`.

A vertex shader may start with `D.preVS()` (declares `R,T,E,TT,S,P`, `tpt`, `pcg`, `h1`). Without a vertex shader
`D.prog(null, fs)` uses a full-screen triangle (`D.tri()`).

## 3. JS helpers

```js
const p = D.prog(vsOrNull, fsBody);   // compile + link (throws with the shader log and the offending lines)
D.bind(p);                            // gl.useProgram + set R, T, E, TT, S(unit 0), P(unit 1)
D.tri();                              // draw the full-screen triangle
const rt = D.rt(w, h, float);         // offscreen colour target {tex, fb, w, h, float}; RGBA16F when renderable, else RGBA8
D.size()                              // [W, H] of the drawing buffer;   D.gl() the WebGL2 context;   D.text the tagline block info
```

Draw calls without vertex attributes work (`gl.drawArrays(gl.POINTS, 0, N)` with `gl_VertexID`). The runtime does not
clear the framebuffer, set blending or depth state; that is up to you.

## 4. Music

`music(K, D)` is called once with a kit bound to an `OfflineAudioContext` (44.1 kHz stereo, length `dur` + 2.5 s tail).
Schedule everything at absolute times in seconds. `K.c` is the context, `K.out` the master bus. The runtime puts a
compressor on the bus, normalises the result to about -20 dBFS RMS / -1 dBFS peak, applies a 40 ms fade in and a
1.6 s fade out at the very end, then plays it through an `AudioBufferSourceNode` and measures `E` from it.
Raw WebAudio nodes and `K.c.createBuffer` (own DSP loops) are fine. The kit only saves bytes:

```js
K.hz(midi)                                    // note → Hz
K.o(type, t, d, f1, f2, v, to=K.out, gt=d)    // oscillator, exp pitch glide f1→f2 over gt s, exp decay over d s. kick = K.o('sine', t, .4, 160, 42, 1, out, .1)
K.n(t, d, f1, f2, q, v, to, type='bandpass')  // filtered-noise burst, filter sweeps f1→f2, exp decay. hat, snare, riser, rain …
K.p(type, t, d, f, v, a, r, to, lp, det)      // sustained note: attack a, hold d, release r, optional lowpass lp (Hz) and detuned pair (cents)
K.rev(sec, decay, wet, to, damp)              // reverb (generated stereo noise IR); returns the SEND input node
K.dly(time, fb, wet, to, lp)                  // feedback delay; returns the send input
K.bus(v, pan, to)                             // gain+pan stage; returns its input
K.duck(gain.gain, times, depth, rel, lead)    // sidechain-style pumping on a GainNode at the given times
K.sat(amount, to)                             // soft-clip stage; returns its input
K.mine()                                      // true if this sound event belongs to this render context, see below
```

**Parallel rendering.** To keep the wait short, the runtime renders the music in up to four offline contexts at the same
time (one per audio thread) and adds the results; the master compressor then runs once on the sum. `music()` is called once
per context with the same code path. Every *sound event* belongs to exactly one context, assigned in creation order:
`K.o`, `K.n` and `K.p` do that for you (they return a harmless dummy gain node in the contexts that skip the event).
So: **create every sound source through `K.o` / `K.n` / `K.p`**. A custom source made from raw nodes must start with
`if (!K.mine()) return;`. Buses, sends, filters, reverb, delay, `K.duck` and automation of the master gain exist in every
context and are fine. Be deterministic (no `Math.random`) so all contexts see the same sequence. Keep the render time
(`node tools/audio.mjs <id>` prints it) at or below about 6 s here: few hundred notes, one reverb send, one delay send,
no automated filters on every note.

Requirements for the music:

* **The first 3 seconds are near-silent** (below -30 dBFS after normalisation). The sound may have to join late
  (autoplay blocked, slow render); a late join must not be audible as a cut. Quiet noise swells, distant clicks.
* It **fades out to silence by `dur`** (the runtime adds a final fade, but end the musical material yourself).
* A recognisable progression: sparse → structured (rhythm, harmony) → resolution with a clear final chord/hit.
* **Intentional synchronisation**: the three words of the tagline appear on musical events you scheduled (a hit, a
  chord, a note per word), phase changes sit on bar lines, kick/bass drive pulses. Compute the beat grid from one
  `BPM` constant shared by `music()` and the picture (`beat = 60/BPM`). Document the sync points in a comment.
* No harsh or fatiguing sound: it plays on a company landing page. Keep energy above 8 kHz modest, no sudden
  peaks above the programme level, no sustained loud sub-bass below 35 Hz.

## 5. What the page needs from the picture

* `T = 0` is nearly black (mean luminance below about 8 %), no flash when the page appears.
* Three or more clearly different visual phases with a perceptible transition each: **Emergence** (sparse, noisy,
  unstable) → **Transformation** (structure appears and grows) → **Resolution** (clear final form). Something
  must visibly move at all times (no still period longer than ~3 s before `fin`).
* The tagline is revealed line by line, in order, on musical events, and is **complete and legible by `fin`**.
  It is the only text in the picture. (The small closing line is HTML and added by the runtime from `cta` on.)
* **The bottom ~12 % of the final composition stays calm and dark** (mean relative luminance below 12 %), because the
  closing line `info@dreambau.com (nich warten, quatschen)` is drawn there in light grey, 13 px.
* Works at 16:9, 21:9, 4:3 and **portrait phones (9:16)**: the tagline and the main subject stay fully visible
  (use `R`/`TT`, never fixed pixel sizes).
* **Photosensitivity**: no full-screen flashes, no strobing. Beat pulses may change the brightness of large areas by
  at most ~15 %; never more than 3 noticeable pulses per second.
* **Performance**: aim for 60 fps on an integrated laptop GPU at `px` pixels: bounded loops (raymarching ≤ ~64 steps,
  ≤ ~5 fbm octaves per pixel, particle counts ≤ ~400 k with a cheap vertex shader). The runtime lowers the render
  scale automatically when the frame rate drops, but do not rely on it.
* **Size budget** of the minified production file: **4k ≤ 4 096 bytes, 16k ≤ 16 384 bytes, 64k ≤ 65 536 bytes**
  (`node tools/build.mjs <id>` reports it and fails when over). The runtime, the shader prelude and the music kit do
  not count, exactly like the system libraries do not count for a native executable.

## 6. Tools

| command | what it does |
|---|---|
| `node tools/build.mjs <id> [--dev]` | `src/p/<id>.js` → `site/p/<id>.js`, minified, budget check. `--dev` keeps it readable (error line numbers). |
| `node tools/shot.mjs <id> --t 0,10,20 --size 960x540 --sheet` | frames at exact times (software WebGL, manual clock) + contact sheet `verification/<id>/frames/sheet.png`. `--every 2.5` renders a frame every 2.5 s. `--size 390x844` checks portrait. |
| `node tools/audio.mjs <id>` | renders the music offline, writes `verification/<id>/audio/{audio.wav,spectrogram.png,report.json}` and checks loudness, silence at the start/end, clipping, progression, tempo. |
| `node tools/e2e.mjs <id>` | real-time behaviour of the page: sound on/off/blocked, Esc, reduced motion, no WebGL, no network. |
| `node tools/sync.mjs <id>` | how closely the picture follows the bass energy of the music (correlation and lag, 30 Hz). |
| `node tools/bench.mjs <id>` | cost of the picture in software GL (relative number). |
| `node tools/verify.mjs [id]` | the whole acceptance run, see SPEC.md "Final verification". |
| `node tools/video.mjs <id>` | renders a preview video with sound (frame by frame, software GL). |

Look at the pictures: they are the feedback loop. Software rendering is slow for heavy shaders (seconds per frame at
960x540) but exact. Console errors of the page (shader compile errors with source lines) are printed by `shot.mjs`.

## Language contract

The current owner-approved release offers all 47 existing language rows without a reader gate; review markers remain truthful. Every animation description exists in all 47 files, outside the animation's byte budget. See [LANGUAGES.md](LANGUAGES.md) for source, runtime, publication checks and rendering proof. A new animation or approved text adds its German keys and all translations together, before its id joins `Dream.ids`. `Dream.onLang` callbacks re-read derived Tagline values rather than retaining textures across switches.
