"""
The shared studio scene every bottle photo is placed in: a near-black wall
with a soft spotlight, standing on a dark veined marble tabletop. Generated
procedurally (seeded), so it's identical on every run and needs no asset.
"""
import numpy as np
from PIL import Image, ImageFilter

WIDTH, HEIGHT = 800, 740          # matches the 4:3.7 card image ratio
TABLE_TOP = int(HEIGHT * 0.74)    # y where the bottle's base sits


def _value_noise(h, w, cell, rng):
    gh, gw = h // cell + 2, w // cell + 2
    grid = rng.random((gh, gw))
    ys, xs = np.linspace(0, gh - 2, h), np.linspace(0, gw - 2, w)
    y0, x0 = ys.astype(int), xs.astype(int)
    ty, tx = ys - y0, xs - x0
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)  # smoothstep
    a = grid[y0][:, x0]; b = grid[y0][:, x0 + 1]
    c = grid[y0 + 1][:, x0]; d = grid[y0 + 1][:, x0 + 1]
    top = a + (b - a) * tx; bottom = c + (d - c) * tx
    return top + (bottom - top) * ty[:, None]


def _fractal(h, w, rng, base_cell=180, octaves=5):
    total, amp, norm = np.zeros((h, w)), 1.0, 0.0
    cell = base_cell
    for _ in range(octaves):
        total += amp * _value_noise(h, w, max(cell, 2), rng)
        norm += amp; amp *= 0.5; cell //= 2
    return total / norm


def _marble(h, w, rng):
    """Dark marble: charcoal stone with a few soft, wandering light veins."""
    y, x = np.mgrid[0:h, 0:w].astype(float)
    warp = _fractal(h, w, rng, 260, 5)
    main = np.abs(np.sin((x * 0.55 + y * 1.1) / 140 + warp * 7.5))
    main_veins = np.clip(1 - main, 0, 1) ** 40
    warp2 = _fractal(h, w, rng, 150, 5)
    thin = np.abs(np.sin((x * 1.3 - y * 0.5) / 70 + warp2 * 10))
    thin_veins = np.clip(1 - thin, 0, 1) ** 70
    # Veins fade in and out along their length, like real stone
    fade = np.clip((_fractal(h, w, rng, 220, 4) - 0.35) * 2.2, 0.15, 1)
    vein = (main_veins * 0.6 + thin_veins * 0.2) * fade
    as_img = Image.fromarray((np.clip(vein, 0, 1) * 255).astype(np.uint8))
    sharp = np.array(as_img.filter(ImageFilter.GaussianBlur(1.1))) / 255
    halo = np.array(as_img.filter(ImageFilter.GaussianBlur(9))) / 255
    vein = np.clip(sharp + halo * 1.4, 0, 1)
    cloud = _fractal(h, w, rng, 200, 6)
    base = np.array([21, 20, 19]) / 255
    rgb = base * (0.75 + cloud[..., None] * 0.55)
    vein_col = np.array([168, 160, 150]) / 255
    rgb = rgb + vein[..., None] * (vein_col - rgb)
    return np.clip(rgb, 0, 1)


def make_backdrop(seed=7):
    rng = np.random.default_rng(seed)
    h, w = HEIGHT, WIDTH
    y, x = np.mgrid[0:h, 0:w].astype(float)

    # Wall: warm near-black with a soft spotlight behind where the bottle stands
    cx, cy = w * 0.5, TABLE_TOP * 0.62
    d = np.sqrt(((x - cx) / (w * 0.75)) ** 2 + ((y - cy) / (h * 0.75)) ** 2)
    glow = np.clip(1 - d, 0, 1) ** 1.6
    wall = np.array([9, 9, 9]) / 255 + glow[..., None] * (np.array([66, 60, 53]) / 255)
    wall += (_fractal(h, w, rng, 60, 3)[..., None] - 0.5) * 0.012  # faint texture, avoids banding

    # Table: marble squashed vertically for a receding surface, darkening toward the front edge
    table_h = h - TABLE_TOP
    marble = _marble(table_h * 3, w, rng)
    marble = np.array(Image.fromarray((marble * 255).astype(np.uint8)).resize((w, table_h), Image.LANCZOS)) / 255
    ty = np.linspace(0, 1, table_h)[:, None, None]
    tx = np.abs(np.linspace(-1, 1, w))[None, :, None]
    light = 1.1 - 0.5 * ty - 0.4 * tx ** 2             # spotlight falls off toward the edges
    marble = marble * light
    # Soft glossy sheen: the wall's glow reflected in the polished surface near the back edge
    sheen = np.exp(-ty * 7) * np.clip(1 - tx * 1.1, 0, 1) ** 2
    marble = marble + sheen * (np.array([60, 55, 49]) / 255) * 0.9

    img = wall.copy()
    img[TABLE_TOP:] = marble
    # Crisp highlight along the back edge of the table
    img[TABLE_TOP:TABLE_TOP + 1] = np.clip(img[TABLE_TOP:TABLE_TOP + 1] + 0.05, 0, 1)
    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGB')
    return out.filter(ImageFilter.GaussianBlur(0.4))


if __name__ == '__main__':
    import sys
    make_backdrop().save(sys.argv[1] if len(sys.argv) > 1 else 'backdrop.png')
