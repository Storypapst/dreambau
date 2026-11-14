# Report: production `formsache16k`, "Formsache"

Brief and the conversation it came from: [`docs/briefs/formsache16k.md`](../../docs/briefs/formsache16k.md).
Theme: the same question, a different answer every time.

## What was built

A table seen from above, dark wood under one lamp. A lump of pale clay is asked the same question twenty times, visible as
three rings of light and audible as the same three notes, and answers with a different form each time: star, ring, snail,
fried egg, bone, flower, two lumps, moon. Four wooden bars slide in one after the other and close into a brick mould. While it
is open on one side the clay still sticks a tongue out, smaller each time; the seventeenth answer leaves the mould as a sausage
and walks off (the one answer in twenty that goes astray). From the closed mould come three identical bricks, one for each
line of the tagline. The first eight answers and the sausage stay on the table as keepsakes.

One full-screen fragment shader (2D distance fields, no raymarching, no render targets), driven by uniforms that are computed
from `T` alone, twelve poses a second like stop motion. The music is a small ensemble made from oscillators and noise: plucked
bass, marimba, musical box, brushes, a kazoo for the wrong notes.

## Timeline

108 BPM, beat 0.556 s, bar 2.222 s, 27 bars = 60 s, swung eighths. One beat grid for picture and music.

| time | picture | sound |
|---|---|---|
| 0 to 4.4 s | black; the lamp comes on slowly; at 2.5 s a lump of clay falls in | near silence, a quiet room tone, a plop |
| 4.4 s (beat 8) | first question: three rings of light run out from the lump | the motif C D G on a musical box |
| 6.7 s (beat 12) | first answer: the lump springs into a star, is carried to the side, a new lump falls in | a whoop and a sparkle |
| 8.9 and 11.1 s | second question and answer: a ring | motif with marimba, a boing |
| 13.3 s (bar 6) | the lamp turns up; from here one question and answer in every bar: snail, fried egg | bass and brushes enter |
| 17.8, 22.2, 26.7 s | a wooden bar slides in from below, from the left, from above; the answers bone, flower, two lumps, moon are pressed flat against the bars | a knock on each downbeat |
| 26.7 s (bar 12) | the lump is pressed into the open mould; more light; only a tongue still sticks out when it answers | walking bass, soft chords |
| 31.1 to 37.8 s | question and answer twice a bar, the tongue shrinks | the last note of the answer closes in on the right one |
| 38.9 s (beat 70) | the clay leaves through the open side as a sausage, lies there and then walks to the edge | a fanfare that lands a semitone too high, then nothing, then one dry knock |
| 40.0 s (bar 18) | the fourth bar comes down and closes the mould; the mould moves aside and makes room | knock |
| 41.1 s (beat 74) | a brick; **"Kann alles. Außer konstant."** swells into place | the right answer A F, a bell, a chord |
| 45.6 s (beat 82) | a second brick, the same; **"Unser Part."** | the same answer |
| 50.0 s (beat 90) | a third brick, the same; **"dreambau.com"** | the same answer, final chord |
| 53 s | final composition: mould with a fresh lump, three bricks in a row, the tagline, the keepsakes at the sides | C, A, F ring out |
| 55.6 s (beat 100) | the sausage wriggles once more | a very quiet echo of the fanfare |

## Sync points

* Every question: the rings start on the first note of the motif, one ring for each note.
* Every answer: the form springs out on the last note of the answer (beats 12, 20, then beat 3 of every bar, then every second beat).
* Bars of the mould: each arrives exactly on a downbeat (beats 32, 40, 48, 72) with a knock.
* Every lump lands with a plop, every brick is laid down with a knock.
* The three lines: beats 74, 82, 90, each on the last note of the same answer. Measured reveal: 41.5 s, 46 s, 50.5 s.
* The lamp follows the bass (`E.x`), at most 14 % brighter. Measured: brightness against bass energy r = 0.78, lag 0 ms.

## Measured (`npm run verify -- formsache16k`, software GL)

| what | result |
|---|---|
| size | 10 992 of 16 384 bytes (67 %), gzip 5 524 |
| first frame | mean luminance 0.0 % |
| phases | differences between snapshots 0.05, 0.07, 0.08, 0.05 |
| flash safety | largest step in 66 ms: 2.0 % luminance |
| text contrast, final frame | 16:9 13.0 / 13.3 / 14.8; 21:9 13.1 / 13.3 / 14.8; 4:3 13.0 / 13.3 / 14.8; portrait 13.8 / 13.8 / 14.7 |
| bottom band, final frame | 0.6 to 0.8 % luminance |
| picture cost at 640x360 | mean 108 ms, worst 162 ms |
| music | peak -0.9 dBFS, RMS -23.2 dBFS, estimated tempo 108 BPM, no clipping, first second above -55 dBFS is second 2 (-40.9), silent from second 58 |
| real-time behaviour (`e2e.mjs`) | all checks passed |
| start-page build | `build:apex` and `check:apex` passed with the eight productions |
| languages | `check:languages -- --complete --release` passed; of `e2e:lang --quick` only `glyph-probes` fails, as it does without this production (fonts of the test machine) |

## Known weaknesses

* The rounded edges are lit from screen-space derivatives of one distance field. Where two forms meet, the crease shows
  steps of two pixels when the picture is magnified.
* The shadow is the same field shifted along its gradient. The shadow of a lifted thing therefore stays attached to its far
  side instead of separating from it.
* The tested shapes are 16:9, 21:9, 4:3 and a portrait phone (390 and 360 wide). In windows between about 0.7 and 1.1 wide to high the keepsakes
  at the sides come close to the mould and to the tagline.
* In landscape the sausage comes to rest near the "Esc" hint at the bottom right, until the hint disappears at 53 s.
* The contact sheet with a frame every 5 s mostly catches the questions (the rings); most answers fall between its frames.
* Everything was checked in software GL in a headless browser. No run on a real GPU or phone yet, and nobody has listened to
  the music on loudspeakers: levels, spectrum and the timing of the events were measured, not heard.

## Texts

None in the picture. The production shows and says nothing besides the three closing lines, which the runtime draws: its own claim "Kann alles. Außer konstant." / "Unser Part." (keys `claim.formsache16k.1` and `.2`, translated into all 47 languages as drafts) and the brand "dreambau.com".
