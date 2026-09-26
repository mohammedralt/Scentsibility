"""
Builds a consistent product photo for each fragrance: finds the retailers'
product photos, cuts the bottle out of its background, rejects shots that are
really the box, and places the bottle on the shared marble backdrop.

Output (committed with the site, so a photo and the page that uses it always
deploy together):
  web/public/bottles/<fragrance id>-<hash>.webp
  web/lib/staged-bottles.json   {"<fragrance id>": "<file name>"}

Usage:
  python images/stage_bottles.py                # fragrances without a staged photo yet
  python images/stage_bottles.py --all          # redo every fragrance
  python images/stage_bottles.py --limit 20     # stop after 20 fragrances
  python images/stage_bottles.py --max-minutes 300
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np
import psycopg
import requests
from PIL import Image, ImageFilter
from rembg import new_session, remove

sys.path.insert(0, str(Path(__file__).parent))
from backdrop import HEIGHT, TABLE_TOP, WIDTH, make_backdrop  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / 'web' / 'public' / 'bottles'
MANIFEST = ROOT / 'web' / 'lib' / 'staged-bottles.json'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}
SAMPLE_WORDS = re.compile(r'\b(samples?|decants?|vials?|atomi[sz]er|travel|mini|miniature|splits?)\b', re.I)
MAX_LISTINGS = 4        # product pages to check per fragrance
MAX_CANDIDATES = 8      # photos to try per fragrance
BOTTLE_HEIGHT = 0.56    # bottle height as a share of the image
BOTTLE_MAX_WIDTH = 0.56


# ─── Finding candidate photos ─────────────────────────────────────────────────

def load_fragrances(conn, only_missing: set[str] | None, limit: int | None):
    rows = conn.execute(
        """
        SELECT f.id::text, f.brand, f.name, f.image_url,
               COALESCE(json_agg(json_build_object(
                 'url', tp.product_url, 'base', r.base_url, 'key', r.key,
                 'label', tp.variant_label, 'size', tp.size_ml, 'stock', tp.last_in_stock
               ) ORDER BY tp.last_in_stock DESC NULLS LAST, tp.last_price DESC)
               FILTER (WHERE tp.id IS NOT NULL), '[]') AS listings
        FROM fragrances f
        LEFT JOIN tracked_products tp ON tp.fragrance_id = f.id AND tp.last_price IS NOT NULL
        LEFT JOIN retailers r ON r.id = tp.retailer_id AND r.is_active
        GROUP BY f.id
        -- Most-listed (most popular) fragrances first, so a partial run covers what people see
        ORDER BY COUNT(tp.id) DESC, f.brand, f.name
        """
    ).fetchall()
    out = []
    for fid, brand, name, image_url, listings in rows:
        if only_missing is not None and fid in only_missing:
            continue
        out.append({'id': fid, 'brand': brand, 'name': name, 'image_url': image_url, 'listings': listings})
        if limit and len(out) >= limit:
            break
    return out


def is_full_bottle_listing(listing) -> bool:
    text = f"{listing.get('label') or ''} {re.sub(r'[-_/?=&.]', ' ', listing['url'])}"
    if SAMPLE_WORDS.search(text):
        return False
    size = listing.get('size')
    return size is None or size >= 30


def shopify_images(listing) -> list[str]:
    handle = re.search(r'/products/([^?#/]+)', listing['url'])
    if not handle or listing['key'] == 'jomashop':
        return []
    try:
        res = requests.get(f"{listing['base']}/products/{handle.group(1)}.js", headers=HEADERS, timeout=15)
        res.raise_for_status()
        images = res.json().get('images') or []
    except (requests.RequestException, ValueError):
        return []
    return [('https:' + u) if u.startswith('//') else u for u in images[:3]]


def candidate_urls(fragrance) -> list[str]:
    urls: list[str] = []
    bottles = [l for l in fragrance['listings'] if is_full_bottle_listing(l)]
    seen_retailers = set()
    for listing in bottles:
        if len(seen_retailers) >= MAX_LISTINGS:
            break
        if listing['key'] in seen_retailers:
            continue
        seen_retailers.add(listing['key'])
        urls.extend(shopify_images(listing))
    if fragrance['image_url'] and fragrance['image_url'].startswith('http'):
        urls.append(fragrance['image_url'])
    deduped = list(dict.fromkeys(urls))
    return deduped[:MAX_CANDIDATES]


# ─── Cutting out and judging a photo ─────────────────────────────────────────

def download(url: str) -> Image.Image | None:
    try:
        res = requests.get(url, headers=HEADERS, timeout=20)
        res.raise_for_status()
        img = Image.open(io.BytesIO(res.content))
        img.load()
    except Exception:
        return None
    if min(img.size) < 250:
        return None
    img = img.convert('RGB')
    img.thumbnail((1200, 1200))
    return img


def judge_cutout(cut: Image.Image) -> tuple[bool, str]:
    """Is this cutout a single bottle (not a box, not a lifestyle shot)?"""
    alpha = np.array(cut.getchannel('A'))
    mask = alpha > 128
    h, w = mask.shape
    area = mask.sum()
    if area < 0.03 * h * w:
        return False, 'nothing found'
    ys, xs = np.nonzero(mask)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    bh, bw = bottom - top + 1, right - left + 1

    edges_touched = sum([top <= 2, left <= 2, right >= w - 3, bottom >= h - 3])
    if edges_touched >= 2:
        return False, 'fills the frame (not a cut-out product shot)'
    if bw / bh > 1.15:
        return False, 'too wide (box, or bottle next to its box)'

    # Several separate objects side by side → bottle + box, or a set
    cols = mask[top:bottom + 1, left:right + 1].any(axis=0)
    gaps = np.diff(cols.astype(int))
    if (gaps == -1).sum() > 1 and bw > bh * 0.6:
        return False, 'several objects'

    fill = area / (bh * bw)
    if fill > 0.93:
        return False, f'rectangular block (fill {fill:.2f}) — probably the box'

    # A box's silhouette is the same width top to bottom; bottles have a narrower cap/neck
    rows = mask[top:bottom + 1, left:right + 1]
    widths = rows.sum(axis=1)
    upper = np.percentile(widths[: max(1, len(widths) // 5)], 50)
    middle = np.percentile(widths[len(widths) // 3: 2 * len(widths) // 3], 50)
    if middle > 0 and upper / middle > 0.97 and fill > 0.86:
        return False, 'no neck or cap — probably the box'
    return True, 'ok'


def composite(cut: Image.Image, backdrop: Image.Image) -> Image.Image:
    bottle = cut.crop(cut.getbbox())
    # Clean the matte edge a little so there's no halo from the original background
    a = bottle.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    bottle.putalpha(a)

    scale = min(HEIGHT * BOTTLE_HEIGHT / bottle.height, WIDTH * BOTTLE_MAX_WIDTH / bottle.width)
    bottle = bottle.resize((max(1, round(bottle.width * scale)), max(1, round(bottle.height * scale))), Image.LANCZOS)
    x = (WIDTH - bottle.width) // 2
    base_y = TABLE_TOP + int((HEIGHT - TABLE_TOP) * 0.30)   # stand slightly forward on the table
    y = base_y - bottle.height

    scene = backdrop.copy().convert('RGBA')

    # Faint reflection in the polished marble
    reflection = bottle.transpose(Image.FLIP_TOP_BOTTOM)
    fade = np.linspace(0.22, 0, reflection.height) ** 1.4
    r_alpha = (np.array(reflection.getchannel('A')) * fade[:, None]).astype(np.uint8)
    reflection.putalpha(Image.fromarray(r_alpha).filter(ImageFilter.GaussianBlur(2)))
    scene.alpha_composite(reflection, (x, base_y))

    # Soft contact shadow under the base
    shadow = Image.new('L', (WIDTH, HEIGHT), 0)
    sw, sh = int(bottle.width * 1.05), max(8, int(bottle.width * 0.12))
    ellipse = Image.new('L', (sw, sh), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(ellipse).ellipse((0, 0, sw - 1, sh - 1), fill=170)
    shadow.paste(ellipse, ((WIDTH - sw) // 2, base_y - sh // 2))
    shadow = shadow.filter(ImageFilter.GaussianBlur(sh * 0.45))
    black = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 255))
    black.putalpha(shadow)
    scene.alpha_composite(black)

    scene.alpha_composite(bottle, (x, y))
    return scene.convert('RGB')


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='redo fragrances that already have a photo')
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--max-minutes', type=float, default=None)
    args = parser.parse_args()
    deadline = time.time() + args.max_minutes * 60 if args.max_minutes else None

    manifest: dict[str, str] = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    backdrop = make_backdrop()
    session = new_session('u2net')

    with psycopg.connect(os.environ['DATABASE_URL'].strip(), prepare_threshold=None) as conn:
        fragrances = load_fragrances(conn, None if args.all else set(manifest), args.limit)
    print(f'{len(fragrances)} fragrances to process', flush=True)

    made = skipped = 0
    stale: list[str] = []

    def save_manifest():
        MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=0) + '\n')
        in_use = set(manifest.values())
        for old in stale:
            if old not in in_use:
                (OUT_DIR / old).unlink(missing_ok=True)
        stale.clear()

    for i, fragrance in enumerate(fragrances, 1):
        if deadline and time.time() > deadline:
            print('Time budget used up — stopping', flush=True)
            break
        label = f"[{i}/{len(fragrances)}] {fragrance['brand']} {fragrance['name']}"
        reasons = []
        for url in candidate_urls(fragrance):
            img = download(url)
            if img is None:
                reasons.append('download failed')
                continue
            cut = remove(img, session=session)
            ok, why = judge_cutout(cut)
            if not ok:
                reasons.append(why)
                continue
            scene = composite(cut, backdrop)
            buf = io.BytesIO()
            scene.save(buf, 'WEBP', quality=82, method=6)
            data = buf.getvalue()
            name = f"{fragrance['id']}-{hashlib.sha1(data).hexdigest()[:8]}.webp"
            old = manifest.get(fragrance['id'])
            if old and old != name:
                stale.append(old)  # deleted only once the manifest no longer points at it
            (OUT_DIR / name).write_bytes(data)
            manifest[fragrance['id']] = name
            made += 1
            print(f'{label}: ✓', flush=True)
            break
        else:
            skipped += 1
            print(f"{label}: skipped ({', '.join(reasons) or 'no photos found'})", flush=True)

        if i % 25 == 0:  # save progress so a crash or timeout keeps what's done
            save_manifest()

    save_manifest()
    print(f'\n✓ {made} bottle photos made, {skipped} fragrances skipped (they keep their current image)')


if __name__ == '__main__':
    main()
