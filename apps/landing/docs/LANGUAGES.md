# Start-page languages

The approved list contains 47 languages. Frank confirmed on 2026-10-07 that all 47 remain and are offered without a reader gate. The German source remains verbatim; the 46 other files are draft translations. `reviewed` is informational and is false for every non-German language. No reader name, date or private inventory is published.

The current scope is the start page's 16 keys, including all three animation descriptions. Code-view, Referenzen and footer keys join in the PR that supplies their approved German wording. Legal pages remain German. This change does not invent a legal/privacy sentence or claim a native reader's approval.

## Build and checks

Run from this app with Node 20:

```sh
npm ci
npm run build
npm run sync:languages -- --pin
npm run check:languages -- --complete --release
npm run test:languages
npm run build:apex
npm run check:nginx
npm run e2e:lang
npm run sheet:languages -- --all
npm run e2e:lang -- --rotate
npm run e2e:lang -- --only rtl-frames
npm run verify
```

`sync:languages -- --table <private-file> --check` checks the sanitized table mirror without writing. The sanitized fixture is `tools/fixtures/languages.md`. Existing owner-approved availability and truthful review markers are preserved during table synchronization. `--pin` hashes the exact public language bytes after changes; publication fails when an offered file differs from its pin. Rebuild before using `dist/apex/`. The published manifest contains all 47 approved rows in table order, with no private metadata.

`check:languages` reports C1–C12 for syntax, Unicode, keys, placeholders, limits, source bindings, font list and script order. `--complete` requires every file. `--release` adds R1–R6, including availability, hashes, generated manifest, all animation descriptions and the published file set. The waived reader gate is not silently reintroduced.

`e2e:lang --quick` covers German, English, Arabic and Japanese at 390×844 and 320×568. A full run checks every available file at all six specified viewport sizes. Each run builds and cleans its own temporary directory so concurrent tests cannot remove one another's files. `--allow-missing` records device font limitations instead of treating them as a translation failure. The ordinary full run uses no such waiver.

`sheet:languages --all` writes offline HTML, comparison PNGs, rendered closing frames and hashes to `dist/lang-sheet/`. `--lang de,en,ar,ja` selects rows; `--non-latin` selects scripts. The report identifies missing code points and the language actually rendered. These sheets are evidence for human review, not a review marker. The rotate check chooses the measured smallest font, the longest contact phrase and Arabic, then rotates each of the three animations while its clock runs. `rtl-frames` exports 32 Arabic frames per animation for joining inspection.

`check:nginx` launches and removes an isolated nginx container. It verifies the exact apex file hashes, linked styles, script MIME types, CSP, missing-file 404s and all three animation starts with Chromium. The dedicated path-filtered landing workflow runs independently of root application checks.

The Linux CI font baseline excludes only `fonts-unifont`. GNU Unifont supplies hexadecimal filler glyphs for unassigned code points, so those font-provided pictures differ from the browser's missing-glyph references ([GNU Unifont source documentation](https://www.unifoundry.com/unifont/doxygen/html/unihexgen_8c.html)). This is a test-environment limit, not a product font change: the fixed 14 positive lines, three negative controls and all 3,557 code points remain strictly checked. A visitor with unusual placeholder fonts can still expose the spec's `SCR-10` limitation. The request hold-back test enforces the full second with a monotonic clock rather than assuming a requested timer duration is an elapsed duration.

## Runtime contract

Classic `i18n.js`, `i18n/index.js`, then `shell.js` preserve the existing CSP. Only German and the chosen file are loaded. URL selection preserves other parameters and hashes, uses replaceState, and stores no language in cookies or local storage. Missing scripts, invalid manifests, missing visible glyphs and three-second deadlines fall back to German.

`Dream.i18n.ready` never rejects. The first file failure ends startup waiting immediately; a late German file refreshes fallback descriptions without selecting a late non-German file. `Dream.t(key, vars)` resolves chosen text, German, then empty; text is inserted as text. Unknown placeholders remain. Number formatting uses Latin digits. The Latin brand inside a RTL blind description is directionally isolated.

`Dream.setLang(code)` returns a Promise of success. It checks visible glyphs, swaps Tagline textures with allocation/error checks, deletes replaced textures, updates text/direction and URL, and notifies `Dream.onLang`. Failed raster or texture work retains the old language and resources. It never changes the animation clock or audio state. The picker and its backdrop never unlock sound. Reduced motion performs a direct swap; otherwise the existing cross-fade hides it.

The German canvas stays detached. Japanese and Chinese canvases carry their language hint while temporarily attached, and are removed even after raster errors. Device fonts remain the honest limit: glyph detection cannot certify natural wording, Nastaliq shape, Devanagari marks or real Safari/screen-reader behavior.

## Selected Raster A restoration

The design correction restores the previously selected Raster A rather than the simplified pills. The change adds 1,762 source CSS bytes to the previous fully used 3,072-byte allowance. The bounded source-style allowance is now 5,120 bytes; the runtime, manifest, shell and gzip limits remain separately enforced. This is a source-footprint proxy, not a claim about measured server transfer. See Storypapst/dreambau#147 and Storypapst/dreambau-docs#97.
