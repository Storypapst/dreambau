#!/usr/bin/env python3
"""Contact sheet of t_*.png frames: python3 tools/sheet.py <dir> [columns] [thumb_width]."""
import glob, os, re, sys
from PIL import Image, ImageDraw

d = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 4
tw = int(sys.argv[3]) if len(sys.argv) > 3 else 480
files = sorted(glob.glob(os.path.join(d, 't_*.png')), key=lambda f: float(re.search(r't_([\d.]+)\.png', f).group(1)))
if not files:
    sys.exit('no frames in ' + d)
ims = [Image.open(f).convert('RGB') for f in files]
th = int(tw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (0, 0, 0))
for i, (f, im) in enumerate(zip(files, ims)):
    t = re.search(r't_([\d.]+)\.png', f).group(1)
    im = im.resize((tw, th), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    dr.rectangle([0, 0, 64, 16], fill=(0, 0, 0))
    dr.text((4, 2), 't=%ss' % float(t), fill=(255, 255, 255))
    sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
out = os.path.join(d, 'sheet.png')
sheet.save(out)
print('contact sheet:', out, sheet.size)
