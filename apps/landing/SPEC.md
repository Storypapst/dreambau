# DreamBau Landing Demo

*Specification v1.0 (2026-10-02). Derived from the MorphDemo specification v1.1: the creative task and the output
requirements are carried over and translated from "three native executables" to "three productions on a web page".
The appendix lists exactly what was kept, what changed and why.*

Create three original real-time audiovisual productions under strict size constraints, for the landing page of
**dreambau.com**.

All three belong to the same project and must be completed in this run. **Every time the page is loaded, exactly one of the
three is played, picked at random.**

## Fixed by the owner

These parts are not creative freedom. They are taken over literally.

* **The text.** Three lines, shown in this order, each on a musical event:
  1. `Jeht nich…`
  2. `jibs nich…`
  3. `dreambau.com`
* **The closing line.** At the very end, small and unobtrusive: `info@dreambau.com (nich warten, quatschen)`.
  The address is a working `mailto:` link.
* **Start.** The production runs when the page is loaded, ideally with sound on, and there is always a button to switch the
  sound off (and on again).
* **Everything else is creative freedom**, within the rules below.

## Runtime environment

The page will be opened by visitors on:

* current desktop browsers (Chrome/Edge, Firefox, Safari) at about 1920×1080;
* current phones (iOS Safari, Android Chrome) in portrait, about 390×844;
* WebGL2 and WebAudio available (about 97 % of visitors). Where WebGL2 is missing the page degrades to a static page (see
  *Behavior*).

The page is a set of **static files**. It may be served by any web server or opened from disk. It must not need a build
step on the server, a CDN, a font service, analytics or any network access after its own files have loaded.

The reference test host of this run is described in `ENVIRONMENT.json` (headless Chromium, software-rendered WebGL2,
4 CPU cores, no sound device). Read it instead of guessing.

## Required productions

Produce exactly these three productions:

* `4k`: production file of at most **4 096 bytes**
* `16k`: production file of at most **16 384 bytes**
* `64k`: production file of at most **65 536 bytes**

The sizes are upper limits on the minified, uncompressed JavaScript file of the production, shaders and music score
included (the web analogue of the exact byte sizes of the native executables; padding a web file to an exact length would
only make the page slower).

Every production must independently satisfy the complete task described below.

The **runtime** (`site/shell.js` with `site/index.html`) plays the role the operating system and its libraries play for a
native executable and does not count towards the budgets. It provides the canvas, the clock, the audio output, the sound
switch, Esc/skip, the random choice, the tagline as a distance-field texture, the closing line and the fallbacks. A
production provides everything that is seen and heard. The contract between the two is `docs/CONTRACT.md`.

Final artifacts may not be thin wrappers around something that performs the production elsewhere: no video, no `<iframe>`,
no embedded player, no remote service, no prerecorded media of any kind.

## Working conditions

There is no limit on development time, tokens, cost or iterations. Work until the result is as good as you can make it.

## Creative brief

Theme:

**FROM NOISE TO ORDER**

Interpret the theme freely. For a builder it reads naturally: rubble and static become a plan, the plan becomes a building,
the building becomes a place.

Do not recreate an existing demo, artwork, game, film scene, or supplied visual reference.

Each production should have its own visual identity and should feel like a coherent audiovisual work rather than a
collection of unrelated technical effects. The three productions may share concepts, code, visual language, music systems
or production ideas, but each one must be a complete standalone piece that satisfies all requirements independently.

Each production must have a recognisable progression:

1. **Emergence**: begin from a sparse, unstable, chaotic, noisy or minimal state.
2. **Transformation**: develop into increasingly structured visual and musical forms.
3. **Resolution**: arrive at a clear climax, final form or conclusion.

These do not have to be literal separate scenes. A continuously transforming environment is valid as long as the
progression is clearly perceptible.

The tone is that of a company's front door: confident, warm, a little humorous, never kitschy.

## Required output

Each of the three productions must:

* render in real time;
* contain continuous animation;
* contain generated audio or music;
* include intentional synchronisation between sound and visuals;
* contain at least three visually distinguishable phases or states;
* include meaningful transitions between them;
* display the three lines of the text, in order, each on a musical event, and have them complete and legible from `fin` on;
* end on a calm final composition that shows the tagline and, from `cta` on, the closing line (the small closing line is
  HTML, added by the runtime, so that it is real text: selectable, readable by screen readers, a working `mailto:` link);
* run for approximately one minute, **between 50 and 70 seconds**, and then hold the final composition (no loop, no
  restart, no blank page);
* allow early termination with **Escape** (and with a visible skip control for touch devices): the page jumps cleanly to
  the final composition.

Do not extend the runtime beyond the 50-70 s range.

## Sound and the browser

* The sound is part of the piece and **starts together with the picture** where the browser allows it.
* Browsers refuse to start sound before the first user gesture. Then the picture starts anyway, the sound button invites
  ("Ton an"), and the first click, tap or key press switches the sound on; the music joins at the current position of the
  picture. The music must therefore start almost silent (below -30 dBFS for the first 3 s) so that a late join is not
  audible as a cut.
* A sound button (`aria-pressed`, keyboard operable, also on the **M** key) is always present. Switching the sound off is
  remembered for the next visit; nothing else is stored.
* The music is **rendered once, offline, before it plays** (a short precalculation of a second or two is acceptable and
  the picture runs meanwhile), normalised to a moderate programme level (about -20 dBFS RMS, peak below -1 dBFS), and the
  picture reads an envelope measured from the rendered sound, so picture and sound stay in sync whatever the output latency.
* The picture follows the audio clock (corrected for output latency) while sound plays, and a free-running clock otherwise.

## Procedural and self-contained content

Each production must be self-contained.

Visual content must be generated at runtime. Audio must be synthesised or generated at runtime.

Do not rely on external production assets, including: textures; image files; meshes or model files; fonts used as
production content; prerecorded music; prerecorded sound samples; video; external scene or timeline data; external shader
files; downloaded content; network resources.

Compact data embedded directly in the production is allowed. Procedural geometry, mathematical functions, shader code,
generated samples, synthesised instruments, procedural textures, compact lookup tables and embedded parameter data are
allowed.

*Note on the tagline:* its letter shapes are rasterised at runtime from the visitor's own system font into a signed distance
field. No font file is shipped or downloaded; the text is the owner's content, not production content.

## Behavior

The page must:

* start without user configuration;
* produce visible output without requiring interaction;
* produce audible output where the browser permits it, and ask for one click where it does not;
* run the intended sequence from beginning to end;
* make no network request beyond loading its own files; set no cookies; use no tracking;
* degrade gracefully: **no WebGL2** or a failing production → a static page with the tagline and the closing line; **no
  JavaScript** → the same; **no audio support** → the show runs silently and the sound button disappears;
* respect **`prefers-reduced-motion`**: show the final composition at once without sound and offer "Animation abspielen";
* pause while the tab is hidden (picture and sound), keep the battery in mind (lower the render scale when the frame rate
  drops, render the final composition at 30 fps and stop after a few minutes);
* be **photosensitivity-safe**: no full-screen flashes or strobing, beat pulses change large areas by at most about 15 %,
  never more than three noticeable pulses per second;
* be responsive: 16:9, 21:9, 4:3 and portrait phones, with the tagline and the main subject fully visible;
* keep the bottom of the final composition calm and dark so that the closing line is legible (contrast ≥ 4.5:1);
* be accessible: the tagline is also present as text (`<h1>`), controls are real buttons with labels and visible focus.

A short initialisation or precalculation phase is acceptable, but it should not replace the real-time nature of the production.

## Deliverables

Produce:

1. the page (`site/index.html`), the runtime (`site/shell.js`) and the three built productions (`site/p/4k.js`,
   `site/p/16k.js`, `site/p/64k.js`);
2. complete source code for all of it (`src/p/*.js` for the productions);
3. everything required to rebuild the productions from source (`npm install && npm run build`), including the size check;
4. a short `README.md` with the exact build, run, deploy and verification commands and a brief description of the
   implementation;
5. the verification evidence (`verification/`): contact sheets, audio spectrograms and reports, the machine-readable
   `report.json`.

Only the three production files are subject to the size budgets. Source code, build files and documentation are not.

## Final verification

Before finishing:

* build all three productions and verify that each is within its size budget;
* run all three in a browser; verify that every production works from beginning to end, with its music;
* verify that each production lasts between 50 and 70 seconds and that the tagline is complete by `fin`;
* verify the sound behaviour with autoplay allowed and with autoplay blocked, the mute button, Esc, reduced motion and the
  no-WebGL fallback;
* verify that each production works independently, without external assets and without network requests;
* leave the built files and the complete source tree in the requested output location.

Do not finish with only one or two productions completed. The requested output is the complete set of all three.

---

## Appendix: from MorphDemo to the landing page

| MorphDemo | DreamBau landing |
|---|---|
| Three native Linux executables of exactly 65 536 / 16 384 / 4 096 bytes | Three web productions (`4k`, `16k`, `64k`) of at most 4 096 / 16 384 / 65 536 bytes of minified JavaScript each; the runtime does not count, like system libraries |
| Run once, the program exits | The page picks one production at random on every load; after the production it holds the final composition |
| Theme FROM NOISE TO ORDER; emergence, transformation, resolution | Kept unchanged |
| Show the word **MORPH** at least once | Show the owner's three lines on musical events, then the small closing line `info@dreambau.com (nich warten, quatschen)` |
| 50 to 70 s, terminates by itself, Escape ends it cleanly | 50 to 70 s, then holds the final composition; Escape (or the skip control) jumps to it |
| Generated audio, intentional sync, three phases with transitions | Kept. Audio is synthesised with WebAudio, rendered offline, played from a buffer; picture reads an envelope of the rendered sound |
| No external assets, no network | Kept, and made checkable: the harness fails on any request that leaves the page |
| Reference host `ENVIRONMENT.json` (NixOS, RTX 5090, PipeWire) | Reference test host `ENVIRONMENT.json` (headless Chromium, software WebGL2); target is the visitors' browsers |
| Runs unattended, audible output | **Sound on at start where the browser allows it, always a sound off/on button**, and a graceful path where autoplay is blocked |
| Fullscreen window on a 1920×1080 display | Responsive page: desktop, ultrawide, portrait phone; adaptive render scale |
| Build with gcc/nasm/make, packers | `npm install && npm run build` (esbuild); no packer needed, the budget is checked on the minified file |
| Final verification: sizes, run, duration | Same, plus sound policy, Esc, reduced motion, no-WebGL, no-network, flash and contrast checks (`node tools/verify.mjs`) |
