# Generates the Memories TV app icons (an original design: two photo cards on a dusk gradient).
# Usage: python3 tools/make_icon.py  (needs Pillow and numpy). Writes assets/icon-source.png,
# assets/icon-store.png and webos-meta/icon{,-large,-mini}.png.
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # draw at 2x, downscale for smooth edges

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vgradient(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None]
    top = np.array(top, float); bottom = np.array(bottom, float)
    rows = top + (bottom - top) * t
    arr = np.repeat(rows[:, None, :], w, axis=1).astype(np.uint8)
    return Image.fromarray(arr, 'RGB')

def diag_gradient(w, h, c1, c2):
    y, x = np.mgrid[0:h, 0:w]
    t = ((x / w) * 0.4 + (y / h) * 0.6)[..., None]
    c1 = np.array(c1, float); c2 = np.array(c2, float)
    return Image.fromarray((c1 + (c2 - c1) * t).astype(np.uint8), 'RGB')

def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    return m

# Background: deep night-blue to violet
bg = diag_gradient(S, S, (16, 24, 58), (74, 32, 110)).convert('RGBA')
# soft warm glow behind the cards
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([S*0.18, S*0.2, S*0.86, S*0.88], fill=(255, 140, 90, 90))
bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(S * 0.09)))

def photo_card(w, h, scene):
    """White-bordered photo with rounded corners; scene(w, h) -> RGB image."""
    border = int(w * 0.07)
    card = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    card.paste((250, 248, 244, 255), (0, 0), rounded_mask(w, h, int(w * 0.07)))
    iw, ih = w - 2 * border, h - 2 * border
    card.paste(scene(iw, ih), (border, border), rounded_mask(iw, ih, int(w * 0.035)))
    return card

def sunset_scene(w, h):
    img = vgradient(w, h, (255, 196, 112), (255, 104, 120)).convert('RGBA')
    d = ImageDraw.Draw(img)
    r = w * 0.13
    cx, cy = w * 0.68, h * 0.36
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 241, 196, 255))
    # back mountain range
    d.polygon([(0, h * 0.78), (w * 0.30, h * 0.46), (w * 0.52, h * 0.70), (w * 0.72, h * 0.52),
               (w, h * 0.80), (w, h), (0, h)], fill=(126, 58, 132, 255))
    # front hill
    d.polygon([(0, h * 0.86), (w * 0.24, h * 0.70), (w * 0.55, h * 0.88), (w, h * 0.74),
               (w, h), (0, h)], fill=(58, 34, 96, 255))
    return img.convert('RGB')

def sea_scene(w, h):
    img = vgradient(w, h, (120, 214, 236), (40, 132, 196)).convert('RGBA')
    d = ImageDraw.Draw(img)
    d.rectangle([0, h * 0.62, w, h], fill=(28, 92, 160, 255))
    return img.convert('RGB')

def place(layer, card, angle, center):
    rot = card.rotate(angle, resample=Image.BICUBIC, expand=True)
    # drop shadow, on a padded canvas so the blur isn't clipped at the card's edges
    pad = int(S * 0.08)
    shadow = Image.new('RGBA', (rot.width + 2 * pad, rot.height + 2 * pad), (0, 0, 0, 0))
    alpha = Image.new('L', shadow.size, 0)
    alpha.paste(rot.split()[3].point(lambda a: int(a * 0.5)), (pad, pad))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(S * 0.02)))
    x = int(center[0] - rot.width / 2); y = int(center[1] - rot.height / 2)
    layer.alpha_composite(shadow, (x - pad + int(S * 0.012), y - pad + int(S * 0.03)))
    layer.alpha_composite(rot, (x, y))

cw, ch = int(S * 0.54), int(S * 0.44)
place(bg, photo_card(cw, ch, sea_scene), 11, (S * 0.57, S * 0.43))
place(bg, photo_card(cw, ch, sunset_scene), -6, (S * 0.48, S * 0.58))

import os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
icon = bg.convert('RGB').resize((1024, 1024), Image.LANCZOS)
icon.save(os.path.join(root, 'assets', 'icon-source.png'), optimize=True)
for path, size in [('assets/icon-store.png', 160), ('webos-meta/icon-large.png', 130),
                   ('webos-meta/icon.png', 80), ('webos-meta/icon-mini.png', 60)]:
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(root, path), optimize=True)
print('icons written')
