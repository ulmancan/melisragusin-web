#!/usr/bin/env python3
"""Make the light versions of the site's pictures (run from the site folder: python3 tools/imgv.py).

For every picture in the folders below it writes, next to the site, in assets/v/:
  assets/v/<path>.<width>.webp   480, 960 and 1600 px wide (only the ones smaller than the original)
  assets/v/<path>.amb.webp       a tiny, already-blurred copy used for the coloured light behind a work
The original is never touched. Pictures that already have their light versions are skipped,
so running it again only does the new ones. build.mjs lists what exists in data-img.js.
"""
import os, sys
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDERS = ['assets/wp', 'assets/bio', 'assets/press', 'assets/journal', 'assets/uploads']
FILES = ['assets/berkeley-certificate.jpg', 'assets/sedition.jpg']
WIDTHS = [480, 960, 1600]
EXT = ('.jpg', '.jpeg', '.png', '.webp')


def todo():
    for f in FILES:
        if os.path.exists(os.path.join(ROOT, f)):
            yield f
    for d in FOLDERS:
        for dp, _, fs in os.walk(os.path.join(ROOT, d)):
            for f in sorted(fs):
                if f.lower().endswith(EXT) and not f.startswith('._'):
                    yield os.path.relpath(os.path.join(dp, f), ROOT).replace(os.sep, '/')


def out(rel, tag):
    return os.path.join(ROOT, 'assets/v', rel[len('assets/'):] + '.' + tag + '.webp')


def make(rel, force=False):
    src = os.path.join(ROOT, rel)
    try:
        im = Image.open(src)
        im = ImageOps.exif_transpose(im)
    except Exception as e:
        print('skip', rel, e); return 0
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    im = im.convert('RGBA' if has_alpha else 'RGB')
    w, h = im.size
    n = 0
    widths = [tw for tw in WIDTHS if tw < w * 0.92]
    # a heavy original (a big PNG, a camera file) also gets a light copy at (nearly) full size
    if os.path.getsize(src) > 700_000 and min(w, 2400) > (widths[-1] if widths else 0) * 1.1:
        widths.append(min(w, 2400))
    for tw in widths:
        o = out(rel, str(tw))
        if os.path.exists(o) and not force:
            continue
        os.makedirs(os.path.dirname(o), exist_ok=True)
        im.resize((tw, round(h * tw / w)), Image.LANCZOS).save(o, 'WEBP', quality=80, method=5)
        n += 1
    o = out(rel, 'amb')
    if not os.path.exists(o) or force:
        os.makedirs(os.path.dirname(o), exist_ok=True)
        a = im.convert('RGB').resize((96, max(1, round(h * 96 / w))), Image.LANCZOS)
        a = a.filter(ImageFilter.GaussianBlur(4))
        a = ImageEnhance.Color(a).enhance(1.5)
        a = ImageEnhance.Brightness(a).enhance(0.74)
        a.save(o, 'WEBP', quality=70)
        n += 1
    return n


if __name__ == '__main__':
    force = '--force' in sys.argv
    total = 0
    for rel in todo():
        total += make(rel, force)
    print('light versions written:', total)
