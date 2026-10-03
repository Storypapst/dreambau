# The three productions: what happens when

All three share the structure from `SPEC.md`: Emergence (about 0 to 13 s), Transformation (about 13 to 40 s),
Resolution (about 40 to 60 s). The three lines of the tagline arrive on musical events, `fin` = 53 s is the time from which the
final composition is complete, `cta` = 54.5 s is when the small closing line fades in, `dur` = 60 s is when the music has faded out.
Times below are seconds from the start of the production; one bar is four beats.

## 4k, "Rohbau" (isometric city out of TV static)

One fragment shader (2D, no raymarching) and a compact score: **122 BPM, A minor**, bar = 1.967 s.

| time | picture | sound |
|---|---|---|
| 0 to 13.8 s (bars 0-6) | TV snow fades in from black, ghost outlines of columns flicker where buildings will stand | Geiger-like clicks with rising density, filtered noise swell |
| 13.8 s (bar 7) | the cyan grid draws itself in as a radial wave, one ring per beat | kick enters |
| 15.7 s (bar 8) | columns rise one floor per beat with a small overshoot, centre first | metallic "hammer" accent on beat 4 of each bar |
| 17.7 s (bar 9) | grain recedes as the plan fills in | bass line (Am Am F G) |
| 29.5 s (bar 15) | dawn sky, windows light up in a wave, window lights breathe with the kick | arpeggio with dark delay, ducked pad |
| 41.3 s (bar 21) | the city dims to a calm silhouette; **"Jeht nich…"** | breakdown, bell A over an Am pad |
| 45.3 s (bar 23) | **"jibs nich…"** | bell C over an F pad, riser |
| 49.2 s (bar 25) | **"dreambau.com"** | bell E with the A major chord, rings out by 58 s |
| 53 s and later | final composition: dimmed city, lit windows twinkle slowly | fade out |

## 16k, "Traumhaus" (particles become a house, then the sentence)

262 144 GPU particles (`gl.POINTS` from `gl_VertexID`, additive blending, a small bloom), custom GL. **100 BPM,
C# minor to E major**, bar = 2.4 s. One beat grid drives picture and music.

| time | picture | sound |
|---|---|---|
| 0 to 12 s | a dim cloud of dust in a turbulent flow, rare glints | wind swell from silence, a soft low pad, distant glass pings, noise riser |
| 12 s (bar 5) | the lattice crystallises out of the cloud, the orbit starts | heartbeat kick, bass and pad enter |
| 16.8 to 24 s (bars 7-10) | a storey, the upper storey, the roof and the chimney rise, one per bar | one mallet note per bar (E, F#, G#, C#) |
| 26.4 s (bar 11) | windows and door light up | glass shimmer |
| 28.8 s (bar 12) | walls fill with warm light | pads open up |
| 31.2 s (bar 13) | the house floats, the orbit widens, bricks levitate | melody, soft snare, kick on every beat |
| 40.8 s (bar 17) | wave 1 of particles flies into **"Jeht nich…"** | bell G#4 |
| 44.4 s (bar 18.5, beat 3 of bar 18: between bar lines on purpose, 1.5 bars after word 1) | wave 2 flies into **"jibs nich…"** | bell C#5 |
| 48 s (bar 20) | wave 3, everything left, flies into **"dreambau.com"**; the camera settles frontal | bell E5 and the E major chord |
| 52.8 s (bar 22) | final composition complete | last glass ping, ringing out |

## 64k, "Skyline" (construction site at blue hour becomes a skyline at sunrise)

See the section added by the production itself at the end of this file once it is finished.
