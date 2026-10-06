# Shared brief for all three productions

**Where this lives.** The landing page of dreambau.com (a building / construction company in Berlin). On every load the page
plays one of three productions, picked at random. Each production is a complete audiovisual piece of about one minute.
The theme, taken over from the MorphDemo benchmark this work is derived from, is **FROM NOISE TO ORDER**, and for a
builder it reads naturally: *rubble and static become a plan, the plan becomes a building, the building becomes a place.*

**The only text** (given by the owner, not up for creative change). It is drawn by the production, line by line, in this order:

1. `Jeht nich…`
2. `jibs nich…`
3. `dreambau.com`

It means "can't be done doesn't exist" in Berlin dialect: a promise that the impossible gets built. Show the lines on musical
events. The three lines are provided by the runtime as distance fields (`tdist`) and as particle targets (`tpt`), see
`docs/CONTRACT.md`. Afterwards the page itself adds the small closing line `info@dreambau.com (nich warten, quatschen)` at the
bottom: keep the bottom 12 % of the final composition calm and dark.

**Translations.** The page will be offered in many languages, not only German. The three lines and the closing line come from the
runtime, not from the production. If your production shows or says anything else, list each such text in `REPORT.md` under
"Texts". Every new text, and the blind description of the animation (`docs/NEXT-STEPS.md` §12), must exist as a draft in every
language of the language list (§7) before the production is released. Translations live in their own language files and do
not count against the size budget of the production. A language goes live one at a time, after a native speaker has read it;
until then visitors get German.

**Tone.** Confident, warm, a little humorous, never kitschy. This is a company's front door, not a tech demo reel: no plasma,
no rotozoomers, no lens-flare spam, no stock "matrix" rain. Real craft in the details: timing, easing, restraint, colour.

**Structure (all three).** `dur` 60 s, `fin` 53 s, `cta` 54.5 s.
Emergence (0 to ~13 s): sparse, noisy, unstable, nearly black at t=0, and the sound starts almost silent.
Transformation (~13 to ~40 s): structure appears, grows and becomes musical (a beat enters around 13 s).
Resolution (~40 to 60 s): the first word arrives at 40-43 s, the second at 44-47 s, the last (`dreambau.com`) at 48-51 s,
each on a musical event; the final composition is stable and legible from `fin`, the music resolves and fades out by `dur`.

**Do not** name any AI model, tool vendor or person in files, comments or reports you write. Comments in English.

**Definition of done** (check every point, fix, repeat):

- [ ] `node tools/build.mjs <id>` is within the size budget of the production file.
- [ ] `node tools/audio.mjs <id>` reports no problems; the spectrogram shows the intended structure; the three word hits are audible events at the times the picture reveals the words.
- [ ] `node tools/shot.mjs <id> --every 2.5 --sheet` reviewed with your own eyes (open `verification/<id>/frames/sheet.png` with the Read tool): clearly distinct phases, steady visible motion, no dead period longer than 3 s, `t=0` almost black, final composition legible.
- [ ] Final composition checked at 960x540, at portrait `--size 390x844` and wide `--size 1680x720` (text and subject fully visible, bottom band calm).
- [ ] Text contrast in the final frame: the words are clearly brighter than their surroundings (aim for contrast ≥ 7:1 against the local background) and have crisp anti-aliased edges.
- [ ] `node tools/bench.mjs <id>`: worst frame ≤ ~150 ms at 640x360 in software GL.
- [ ] `node tools/e2e.mjs <id>` passes.
- [ ] No console errors or warnings from the page.
- [ ] `REPORT.md` has a "Texts" section: every text the production shows or says beyond the three lines and the closing line (or "none"), so that it can be translated.
- [ ] `verification/<id>/REPORT.md` written: what you built (2-3 sentences), timeline table (time, picture, sound), the sync points, measured size/budget, bench numbers, known weaknesses.

Edit **only** `src/p/<id>.js` and write only below `verification/<id>/`. Never run `node tools/build.mjs` without an id.
If you need a runtime or tool change, do not edit those files: describe it in your final report.
