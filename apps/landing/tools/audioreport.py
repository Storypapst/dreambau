#!/usr/bin/env python3
"""Analyse a production's rendered music.

usage: audioreport.py <audio.wav> <out_dir> <dur_s> <fin_s>

Writes <out_dir>/spectrogram.png and <out_dir>/report.json and prints a short report. Exit code 1 when a hard
requirement fails (silent, clipping, non-finite, no audible start/end fade, no progression).
"""
import json, os, sys, wave
import numpy as np
from PIL import Image

wav, out, dur, fin = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
w = wave.open(wav)
sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, ch).astype(np.float64) / 32768.0
mono = x.mean(axis=1)
total = len(mono) / sr

def db(v):
    return 20 * np.log10(max(v, 1e-9))

# loudness per second
secs = int(np.ceil(total))
rms = [db(np.sqrt(np.mean(mono[int(i * sr):int(min((i + 1) * sr, len(mono)))] ** 2) + 1e-18)) for i in range(secs)]
peak = db(np.abs(x).max())
overall = db(np.sqrt(np.mean(mono ** 2)))
clipped = int((np.abs(x) >= 0.999).sum())
dc = float(mono.mean())
corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]) if ch == 2 and x[:, 0].std() > 0 and x[:, 1].std() > 0 else 1.0

# spectrogram (log frequency, dB)
N, hop = 2048, 1024
win = np.hanning(N)
frames = (len(mono) - N) // hop
S = np.empty((N // 2 + 1, frames), dtype=np.float32)
for i in range(frames):
    S[:, i] = np.abs(np.fft.rfft(mono[i * hop:i * hop + N] * win))
S = 20 * np.log10(S + 1e-6)
freqs = np.fft.rfftfreq(N, 1 / sr)
H = 360
fmin, fmax = 30.0, min(16000.0, sr / 2)
rows = np.geomspace(fmin, fmax, H)
idx = np.clip(np.searchsorted(freqs, rows), 0, len(freqs) - 1)
img = S[idx][::-1]
lo, hi = np.percentile(img, 5), np.percentile(img, 99.7)
v = np.clip((img - lo) / (hi - lo), 0, 1)
# inferno-like palette
stops = np.array([[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]], dtype=np.float64)
pos = np.linspace(0, 1, len(stops))
rgb = np.stack([np.interp(v, pos, stops[:, c]) for c in range(3)], axis=-1).astype(np.uint8)
Wpx = 1600
im = Image.fromarray(rgb).resize((Wpx, H), Image.BILINEAR)
# time ticks every 10 s
px = np.array(im)
for t in range(0, int(total) + 1, 10):
    xx = min(Wpx - 1, int(t / total * Wpx))
    px[:12, xx] = (255, 255, 255)
for t in (dur, fin):
    xx = min(Wpx - 1, int(t / total * Wpx))
    px[:, xx] = (0, 200, 255) if t == fin else (255, 80, 80)
Image.fromarray(px).save(os.path.join(out, 'spectrogram.png'))

# tempo estimate from the low band onset envelope
lowmask = freqs < 200
flux = np.maximum(0, np.diff(S[lowmask].mean(axis=0)))
flux = flux - flux.mean()
ac = np.correlate(flux, flux, mode='full')[len(flux) - 1:]
fps = sr / hop
lo_l, hi_l = int(fps * 60 / 200), int(fps * 60 / 70)
lag = lo_l + int(np.argmax(ac[lo_l:hi_l])) if hi_l < len(ac) else 0
bpm = 60 * fps / lag if lag else 0

# progression: loudness and brightness (spectral centroid) per quarter
q = [slice(int(sr * dur * a), int(sr * dur * b)) for a, b in ((0, .25), (.25, .5), (.5, .75), (.75, 1.0))]
quarters = [float(db(np.sqrt(np.mean(mono[s] ** 2) + 1e-18))) for s in q]
def centroid(seg):
    sp = np.abs(np.fft.rfft(seg[:len(seg) // 2 * 2]))
    f = np.fft.rfftfreq(len(seg) // 2 * 2, 1 / sr)
    return float((sp * f).sum() / (sp.sum() + 1e-9))
cent = [centroid(mono[s]) for s in q]

head = rms[:3]
tail = rms[int(dur) - 1:int(dur) + 1] if int(dur) < len(rms) else rms[-2:]
problems = []
if not np.isfinite(x).all(): problems.append('non-finite samples')
if peak > -0.5: problems.append('peak %.1f dBFS is too hot' % peak)
if clipped > 8: problems.append('%d clipped samples' % clipped)
if overall < -32: problems.append('programme is very quiet (%.1f dBFS)' % overall)
if max(head) > -30: problems.append('the first 3 s are not near-silent (%.1f dBFS): late joins would be audible' % max(head))
if abs(dc) > 0.01: problems.append('DC offset %.3f' % dc)
if not (quarters[-1] > quarters[0] + 3 or quarters[2] > quarters[0] + 3): problems.append('no loudness progression from first to last quarter')
if any(r < -55 for r in rms[3:int(dur) - 3]): problems.append('digital silence inside the production: ' + ','.join(str(i) for i, r in enumerate(rms) if 3 <= i < int(dur) - 3 and r < -55))
if max(tail) > -25: problems.append('production does not fade out (last seconds %.1f dBFS)' % max(tail))

rep = dict(duration=total, sample_rate=sr, peak_dbfs=round(peak, 2), rms_dbfs=round(overall, 2), clipped=clipped, dc=round(dc, 5),
           stereo_corr=round(corr, 3), est_bpm=round(bpm, 1), quarter_rms_dbfs=[round(v, 1) for v in quarters],
           quarter_centroid_hz=[round(c) for c in cent], rms_per_second=[round(r, 1) for r in rms], problems=problems)
json.dump(rep, open(os.path.join(out, 'report.json'), 'w'), indent=1)
bars = ''.join(' ▁▂▃▄▅▆▇█'[int(np.clip((r + 60) / 40 * 8, 0, 8))] for r in rms)
print('loudness/s  ' + bars)
print('peak %.1f dBFS  rms %.1f dBFS  stereo corr %.2f  est. tempo %.0f BPM  clipped %d' % (peak, overall, corr, bpm, clipped))
print('quarters rms dBFS', [round(v, 1) for v in quarters], ' centroid Hz', [round(c) for c in cent])
print('spectrogram:', os.path.join(out, 'spectrogram.png'))
if problems:
    print('PROBLEMS:'); [print('  -', p) for p in problems]; sys.exit(1)
print('audio checks OK')
