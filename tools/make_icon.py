# Generates the Memories TV app icons: a generic camera aperture on a Nextcloud-style blue.
# Usage: python3 tools/make_icon.py  (needs Pillow and numpy). Writes assets/icon-source.png,
# assets/icon-store.png and webos-meta/icon{,-large,-mini}.png.
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # draw at 2x, downscale for smooth edges

def diag_gradient(w, h, c1, c2):
    y, x = np.mgrid[0:h, 0:w]
    t = ((x / w) * 0.4 + (y / h) * 0.6)[..., None]
    c1 = np.array(c1, float); c2 = np.array(c2, float)
    return Image.fromarray((c1 + (c2 - c1) * t).astype(np.uint8), 'RGB')

# Background: the blue common to Nextcloud and its apps (around #0082c9), lighter top-left
bg = diag_gradient(S, S, (26, 158, 226), (0, 98, 160)).convert('RGBA')
# soft light behind the aperture
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([S*0.18, S*0.2, S*0.86, S*0.88], fill=(255, 255, 255, 46))
bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(S * 0.09)))

def aperture(layer, cx, cy, R, r, blades=6, rotation=-15):
    """Classic iris: blades bounded by the extended edges of a central polygon."""
    def pt(radius, deg):
        return (cx + radius * math.cos(math.radians(deg)), cy + radius * math.sin(math.radians(deg)))
    V = [pt(r, rotation + i * 360 / blades) for i in range(blades)]

    def hit_circle(p0, p1):
        # extend the ray p0 -> p1 beyond p1 until it meets the outer circle
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        fx, fy = p0[0] - cx, p0[1] - cy
        a = dx * dx + dy * dy; b = 2 * (fx * dx + fy * dy); c = fx * fx + fy * fy - R * R
        t = (-b + math.sqrt(b * b - 4 * a * c)) / (2 * a)
        return (p0[0] + t * dx, p0[1] + t * dy)

    P = [hit_circle(V[i], V[(i + 1) % blades]) for i in range(blades)]
    ang = lambda p: math.degrees(math.atan2(p[1] - cy, p[0] - cx))
    shades = [255, 228, 204, 244, 216, 194]

    # soft shadow under the whole disk
    sh = Image.new('L', (S, S), 0)
    ImageDraw.Draw(sh).ellipse([cx - R, cy - R + S * 0.02, cx + R, cy + R + S * 0.02], fill=110)
    shadow = Image.new('RGBA', (S, S), (0, 40, 80, 0))
    shadow.putalpha(sh.filter(ImageFilter.GaussianBlur(S * 0.025)))
    layer.alpha_composite(shadow)

    d = ImageDraw.Draw(layer)
    for i in range(blades):
        a0 = ang(P[(i - 1) % blades]); a1 = ang(P[i])
        while a1 < a0:
            a1 += 360
        arc = [pt(R, a0 + (a1 - a0) * k / 48) for k in range(49)]
        poly = [V[i], V[(i + 1) % blades]] + [P[i]] + arc[::-1] + [P[(i - 1) % blades]]
        shade = shades[i % len(shades)]
        d.polygon(poly, fill=(shade, shade, shade, 255))
    # thin gaps between blades, in a deep blue so they read at small sizes
    gap = (0, 84, 140, 255)
    for i in range(blades):
        d.line([V[i], P[(i - 1) % blades]], fill=gap, width=int(S * 0.012))
    # central opening, outlined in the gap colour so the gaps join it cleanly
    d.polygon(V, fill=(0, 70, 122, 255), outline=gap)
    d.line(V + [V[0]], fill=gap, width=int(S * 0.012), joint='curve')
    # crisp outer ring
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(255, 255, 255, 255), width=int(S * 0.012))

aperture(bg, S * 0.5, S * 0.5, S * 0.33, S * 0.12)

import os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
icon = bg.convert('RGB').resize((1024, 1024), Image.LANCZOS)
icon.save(os.path.join(root, 'assets', 'icon-source.png'), optimize=True)
for path, size in [('assets/icon-store.png', 160), ('webos-meta/icon-large.png', 130),
                   ('webos-meta/icon.png', 80), ('webos-meta/icon-mini.png', 60)]:
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(root, path), optimize=True)
print('icons written')
