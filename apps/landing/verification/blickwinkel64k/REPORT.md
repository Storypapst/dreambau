# blickwinkel64k: "Blickwinkel"

Theme: impossible is a matter of perspective. You look through the eye of a machine: a glass prism in front of the lens
first doubles and splits a few lamps in the dark, then three beams of exposed concrete are cast in timber formwork and
stripped on the beat, and a dolly zoom along the one diagonal from which they line up closes them into an impossible
triangle on the click at 40 s. The shadow on the floor keeps showing three separate beams. Glass and marimba play the same
figure in G Lydian at 108 BPM, the glass a sixteenth late like a refracted image, until both fall into unison on the click.

The conversation that led to it, with every question, answer and the choice: `docs/briefs/blickwinkel64k.md`.

## Timeline

108 BPM, beat 0.556 s, bar 2.222 s. `dur` 60 s, `fin` 53 s, `cta` 54.5 s.

| time | picture | sound |
|---|---|---|
| 0 to 13.3 s (bars 0-6) | black at first; lamps on the floor of a dark hall appear as soft discs, and through a prism in front of the lens a second time, shifted and split into colour; the focus searches; strong grain | air swelling from silence, single glass notes from 3.3 s, each with a refracted echo (0.17 s late, 18 cents sharp, on the other side), a low pad |
| 13.3 s (bar 6) | the key light comes on (0.9 s ramp); the prism starts to slide out of view; the formwork of the floor beam is built | kick (half time), pizzicato bass, marimba figure |
| 15.6 s (bar 7) | the lamps' doubled images move towards their true places | the glass voice enters with the same figure, a sixteenth late |
| 17.8 s (bar 8) | floor beam stripped: the formwork halves move apart and drop; the column formwork rises | low thud and a clatter of boards; woody clicks on the off-beats |
| 22.2 s (bar 10) | column stripped; props rise and the cantilever formwork grows out from the column top | thud and clatter; shaker joins |
| 26.7 s (bar 12) | cantilever stripped | thud and clatter |
| 28.9 s (bar 13) | the three props are pulled, one per beat; the cantilever gives a tiny bit and holds | three small metal tings |
| 13 to 35.6 s | the camera circles the beams (about 180 degrees) and rises to the diagonal: they clearly do not meet | harmony G, A/G, Em7, A, Em7 |
| 31.1 to 40 s (bars 14-18) | the camera settles onto the diagonal | kick on every beat; the glass voice's delay shrinks from a sixteenth to nothing |
| 35.6 to 40 s (bars 16-18) | dolly zoom: the camera pulls back from 3.4 to 600 units while zooming in, so the picture keeps its size and the perspective goes flat; the last small offset from the line closes exactly on the click; the triangle moves into the band above the tagline | D major, riser; one eighth of silence before the click |
| 40.0 s (bar 18) | click: the impossible triangle is closed; a short focus snap and a warm lift of the light (no flash); "Jeht nich…" arrives split into colour and aligns | wood block, glass G major chord, soft low boom, glass bell D6; marimba and glass in unison |
| 44.4 s (bar 20) | "jibs nich…" | glass bell G5 over A/G |
| 48.9 s (bar 22) | "dreambau.com" | glass bell B5 with the final G major chord, marimba arpeggio |
| 40 s and later | the light wanders (0.7 rad until 64 s), the pool of light opens, the camera pushes in by 6 %; the shadow keeps showing three separate beams from a changing angle | ringing out, faded by 58 s |

## Sync points

- Every phase change sits on a bar line (6, 8, 10, 12, 13, 14, 16, 18, 20, 22); the formwork drops on the thuds at
  bars 8, 10 and 12, the props on the tings at bar 13, beats 1 to 3.
- The visual gap at the hidden corner and the musical gap between marimba and glass close together (bars 14 to 18) and
  are both zero on the click at 40.0 s.
- Each tagline line starts on its bell (bars 18, 20, 22).
- The exposure follows the bass energy `E.x` (at most 7 %): measured r = 0.82 against brightness at 0 ms lag.

## Measurements (software GL, SwiftShader, this container)

| check | result |
|---|---|
| size | 15,002 of 65,536 bytes (23 %), gzip 6,858 |
| first frame | mean luminance 0.0 % |
| phases | snapshot differences 0.08 / 0.05 / 0.07 / 0.04 |
| continuous change | no still period; smallest 3 s change 0.0054 (threshold 0.004) |
| flash safety | largest 66 ms step 0.4 % luminance, no large reversals |
| picture and music | bass vs brightness r = 0.82, vs activity r = 0.39, lag 0 ms |
| tagline reveal | 40.5 s → 45 s → 49.5 s |
| final composition contrast | 16:9 16.8 / 16.9 / 17.0, 21:9 16.8 / 16.9 / 16.9, 4:3 16.9 / 17.0 / 17.0, 9:16 16.6 / 16.7 / 16.8 |
| bottom band | 0.3 % luminance in all four shapes |
| picture cost at 640x360 | mean 106.6 ms, worst 119.2 ms |
| music | peak -1.0 dBFS, RMS -20.7 dBFS, quarters -27.4 / -20.4 / -19.2 / -19.1 dBFS, first 3 s below -69 dBFS, render about 5.7 s |
| real time (`tools/e2e.mjs`) | all checks passed |
| apex build and check | passed, including the start of this production under the page's policy |

## Known weaknesses

- The triangle closes only from the final camera position, by design. While the camera circles and approaches
  (about 28 to 36 s) the cut at the end of the cantilever can be seen as a slanted notch, as on real Penrose sculptures.
- In landscape the triangle sits in the band above the tagline block, so on wide screens it is small (about a quarter of
  the height); in portrait it is large.
- The lens colour fringes are intended (the machine's eye) and are strongest at bright edges near the frame border.
- All checks ran in software GL; a run on real GPUs is still outstanding.
- The audio report estimates 215 BPM because it counts the sixteenths; the score is 108 BPM.
- The wished-for closing claim ("KI hat Kanten." / "Gut zum Hebeln." / "dreambau.com") needs a closing text per
  production in the runtime; until then the production ends with the runtime's tagline.

## Texts

None. The production shows only the three lines of the tagline (from the runtime) and the closing line (HTML). The
description for blind visitors is `blind.blickwinkel64k` in all 47 language files under `site/i18n/`.
