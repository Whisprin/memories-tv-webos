# Generates the Memories TV app icons: a generic camera aperture on a flat Nextcloud-style blue.
# Usage: python3 tools/make_icon.py  (needs Pillow). Writes assets/icon-source.png,
# assets/icon-store.png, assets/icon-rounded.png, webos-meta/icon{,-large,-mini}.png and
# docs/{icon,favicon}.png.
import math

from PIL import Image, ImageDraw, ImageFilter

S = 2048  # draw at 2x, downscale for smooth edges

# Background: one flat blue. Keep it the same as "iconColor" in webos-meta/appinfo.json, the
# colour of the launcher tile around the icon, so the tile's edge blends into the icon.
BG = (0x0c, 0x7f, 0xc0)
bg = Image.new('RGBA', (S, S), BG + (255,))

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
                   ('webos-meta/icon.png', 80), ('webos-meta/icon-mini.png', 60),
                   ('docs/icon.png', 304), ('docs/favicon.png', 64)]:
    icon.resize((size, size), Image.LANCZOS).save(os.path.join(root, path), optimize=True)

# The README can't round images with CSS (GitHub strips it), so it gets a copy with
# transparent corners, at about the corner radius of the launcher tile on the TV (12%).
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.12, fill=255)
rounded = bg.convert('RGB').convert('RGBA')
rounded.putalpha(mask)
rounded.resize((256, 256), Image.LANCZOS).save(os.path.join(root, 'assets', 'icon-rounded.png'), optimize=True)
print('icons written')
