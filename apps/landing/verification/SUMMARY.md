# Verification summary

All mandatory local checks passed. The full animation run initially had three failures because the old accessibility fixture expected German while the browser correctly chose English. The fixture now explicitly selects German; its full real-time recheck passed for all three animations, the clock, idle stop and random selection. Geometry and audio results below remain from the original full run. The original failed report and all new frame sheets are retained in private recovery evidence.

## Language release evidence

- 169 source tests passed; complete release checks ship 47 dictionaries and verify all 46 non-German pins.
- All 47 languages passed six viewport sizes; fresh comparison sheets selected every requested language with no missing glyphs or fallback.
- Exact VER-11 probes passed: 14 lines, 3 negative controls, 3,557 code points including all 71 unassigned points; missing 2D context checked.
- nginx served-byte, MIME, CSP, missing-file and animation-start checks passed.
- Nine live-clock rotation cases passed; Arabic frame sheets cover all three animations.
- Chromium visible-text glyph checks passed for all 47 languages. Optional cached Firefox/WebKit timing probes exceeded limits under host load; no three-engine timing pass or real-device acceptance is claimed.

## 4k

| check | result | detail |
|---|---|---|
| size budget: 3791 of 4096 bytes (gzip 2050) | pass | 93 % |
| static scan: no network, media or asset APIs, no eval or new Function, in the shipped files | pass |  |
| timeline: dur 60 s, fin 53 s, cta 54.5 s | pass |  |
| first frame is nearly black (mean luminance 0.1 %) | pass |  |
| three or more distinct phases (differences between snapshots: 0.08 0.13 0.16 0.06) | pass |  |
| continuous change: no still period of 3 s or more before fin | pass |  |
| order independence: the picture at 53.3 s is the same after a full run as on a fresh page (difference 0.0000) | pass |  |
| flash safety: largest 66 ms step 6.9 % luminance, 2 large reversals per second at most | pass |  |
| picture follows the music: bass energy vs brightness r=0.52 (lag 0 ms), vs activity r=0.39 (lag 0 ms) | pass |  |
| tagline revealed line by line, in order: 41.5 s → 45.5 s → 49.5 s | pass |  |
| final composition 16:9: text contrast 16.7 / 16.3 / 16.3, bottom band 0.0 % luminance | pass |  |
| final composition 21:9: text contrast 16.8 / 16.5 / 16.3, bottom band 0.0 % luminance | pass |  |
| final composition 4:3: text contrast 16.4 / 16.7 / 16.6, bottom band 0.0 % luminance | pass |  |
| final composition portrait 9:16: text contrast 16.4 / 16.7 / 16.8, bottom band 0.0 % luminance | pass |  |
| picture cost in software GL at 640x360: mean 224.1 ms, worst 658.6 ms (rule of thumb ≤ 150 ms ≈ 60 fps on an integrated GPU) | warn | informational |
| music: loudness, silent start, fade-out, no clipping, progression | pass | peak -2.2 dBFS  rms -20.1 dBFS  stereo corr 0.94  est. tempo 123 BPM  clipped 0 |
| real-time behaviour: autoplay allowed/blocked, mute, Esc, reduced motion, no WebGL, no network | pass | Passed targeted all-production recheck after explicitly selecting German in the German accessibility fixture; includes clock, idle stop and 60 random loads. |
| contact sheet written (verification/4k/frames/sheet.png) | pass | Generated frame collection retained as private recovery evidence. |

## 16k

| check | result | detail |
|---|---|---|
| size budget: 10191 of 16384 bytes (gzip 4911) | pass | 62 % |
| static scan: no network, media or asset APIs, no eval or new Function, in the shipped files | pass |  |
| timeline: dur 60 s, fin 53 s, cta 54.5 s | pass |  |
| first frame is nearly black (mean luminance 0.0 %) | pass |  |
| three or more distinct phases (differences between snapshots: 0.19 0.07 0.09 0.12) | pass |  |
| continuous change: no still period of 3 s or more before fin | pass |  |
| order independence: the picture at 53.3 s is the same after a full run as on a fresh page (difference 0.0000) | pass |  |
| flash safety: largest 66 ms step 1.5 % luminance, 1 large reversals per second at most | pass |  |
| picture follows the music: bass energy vs brightness r=0.45 (lag -33 ms), vs activity r=0.41 (lag -33 ms) | pass |  |
| tagline revealed line by line, in order: 43.5 s → 47 s → 51 s | pass |  |
| final composition 16:9: text contrast 12.7 / 12.9 / 12.1, bottom band 0.0 % luminance | pass |  |
| final composition 21:9: text contrast 12.7 / 12.9 / 12.2, bottom band 0.0 % luminance | pass |  |
| final composition 4:3: text contrast 12.7 / 13.0 / 12.1, bottom band 0.0 % luminance | pass |  |
| final composition portrait 9:16: text contrast 13.2 / 13.5 / 13.0, bottom band 0.0 % luminance | pass |  |
| picture cost in software GL at 640x360: mean 34.7 ms, worst 52.1 ms (rule of thumb ≤ 150 ms ≈ 60 fps on an integrated GPU) | pass | informational |
| music: loudness, silent start, fade-out, no clipping, progression | pass | peak -3.3 dBFS  rms -21.2 dBFS  stereo corr 0.53  est. tempo 99 BPM  clipped 0 |
| real-time behaviour: autoplay allowed/blocked, mute, Esc, reduced motion, no WebGL, no network | pass | Passed targeted all-production recheck after explicitly selecting German in the German accessibility fixture; includes clock, idle stop and 60 random loads. |
| contact sheet written (verification/16k/frames/sheet.png) | pass | Generated frame collection retained as private recovery evidence. |

## 64k

| check | result | detail |
|---|---|---|
| size budget: 24415 of 65536 bytes (gzip 10911) | pass | 37 % |
| static scan: no network, media or asset APIs, no eval or new Function, in the shipped files | pass |  |
| timeline: dur 60 s, fin 53 s, cta 54.5 s | pass |  |
| first frame is nearly black (mean luminance 0.0 %) | pass |  |
| three or more distinct phases (differences between snapshots: 0.14 0.09 0.13 0.03) | pass |  |
| continuous change: no still period of 3 s or more before fin | pass |  |
| order independence: the picture at 53.3 s is the same after a full run as on a fresh page (difference 0.0000) | pass |  |
| flash safety: largest 66 ms step 4.1 % luminance, 1 large reversals per second at most | pass |  |
| picture follows the music: bass energy vs brightness r=0.24 (lag 0 ms), vs activity r=0.36 (lag 0 ms) | pass |  |
| tagline revealed line by line, in order: 43 s → 47 s → 51 s | pass |  |
| final composition 16:9: text contrast 10.5 / 10.0 / 8.4, bottom band 3.9 % luminance | pass |  |
| final composition 21:9: text contrast 10.7 / 10.1 / 8.3, bottom band 3.5 % luminance | pass |  |
| final composition 4:3: text contrast 10.5 / 10.0 / 8.4, bottom band 3.9 % luminance | pass |  |
| final composition portrait 9:16: text contrast 9.7 / 8.4 / 7.3, bottom band 5.3 % luminance | pass |  |
| picture cost in software GL at 640x360: mean 34.6 ms, worst 98.1 ms (rule of thumb ≤ 150 ms ≈ 60 fps on an integrated GPU) | pass | informational |
| music: loudness, silent start, fade-out, no clipping, progression | pass | peak -1.4 dBFS  rms -20.2 dBFS  stereo corr 0.93  est. tempo 185 BPM  clipped 0 |
| real-time behaviour: autoplay allowed/blocked, mute, Esc, reduced motion, no WebGL, no network | pass | Passed targeted all-production recheck after explicitly selecting German in the German accessibility fixture; includes clock, idle stop and 60 random loads. |
| contact sheet written (verification/64k/frames/sheet.png) | pass | Generated frame collection retained as private recovery evidence. |

## Quick language modules

| check | result | detail |
|---|---|---|
| check:languages release/complete | pass | all source and pinned release checks passed |
| e2e:lang --quick: complete-runtime (VER-7, VER-8, VER-9b, VER-10, VER-11, VER-12, VER-13, VER-14, VER-15, VER-16, VER-17, VER-18, VER-19, VER-21, VER-22, VER-24, VER-25, VER-28), 4.4 s | pass |  |
| e2e:lang --quick: markup-contract (TXT-5, APP-6, APP-7, APP-9, CHO-10, FIL-13), 0.1 s | pass |  |
| e2e:lang --quick: switch-failures (VER-9d, VER-10, VER-11, VER-14, VER-18, VER-19, VER-20, VER-23), 1.3 s | pass |  |
| e2e:lang --quick: ver09a-requests (VER-9a), 2.2 s | pass |  |
| e2e:lang --quick: ver23-injections (VER-23), 7.8 s | pass |  |
| e2e:lang --quick: ver26-no-js (VER-26), 0.3 s | pass |  |
| VER-11 fixed glyph probes and cell clipping | pass | 14 positive lines, 3 negative controls, 3557 code points including all 71 unassigned detected; null 2D context checked. |
