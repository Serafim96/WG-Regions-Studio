"""Generate app icon: daisy + WGS letters, one leaf, transparent background."""

from __future__ import annotations

import math
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent
SIZE = 512
PETAL_COUNT = 8
ICO_SIZES = (16, 32, 48, 64, 128, 256)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Thin italic face for WGS."""
    windir = Path(r"C:\Windows\Fonts")
    for name in (
        "calibrili.ttf",  # Calibri Light Italic
        "segoeuii.ttf",  # Segoe UI Italic
        "ariali.ttf",
        "segoeuil.ttf",  # Light (no italic) fallback
        "calibri.ttf",
    ):
        path = windir / name
        if path.is_file():
            return ImageFont.truetype(str(path), size)
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_petal(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    angle: float,
    *,
    r_inner: float,
    r_outer: float,
    max_half_width: float,
) -> None:
    """Radial daisy petal (like the leaf): from disk outward, gaps between neighbors."""
    ux, uy = -math.sin(angle), math.cos(angle)
    vx, vy = math.cos(angle), math.sin(angle)

    steps = 36
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps  # 0 at disk → 1 at tip
        r = r_inner + (r_outer - r_inner) * t
        # Narrow at disk, full belly ~0.45, soft round tip → 0
        if t >= 0.82:
            u = (t - 0.82) / 0.18
            envelope = math.sqrt(max(0.0, 1.0 - u * u))
        else:
            # Stay wide for most of the length (narrow gaps between petals)
            u = t / 0.82
            envelope = 0.35 + 0.65 * (math.sin(math.pi * u * 0.5) ** 0.7)
        w = max_half_width * envelope
        px = cx + vx * r
        py = cy + vy * r
        left.append((px + ux * w, py + uy * w))
        right.append((px - ux * w, py - uy * w))

    pts = left + list(reversed(right))
    draw.polygon(pts, fill=(255, 255, 255, 255))


def draw_leaf(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    angle: float,
    *,
    r_base: float,
    length: float,
    half_width: float,
) -> None:
    """Single soft leaf peeking between petals."""
    ux, uy = -math.sin(angle), math.cos(angle)
    vx, vy = math.cos(angle), math.sin(angle)

    steps = 24
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        r = r_base + length * t
        envelope = math.sin(math.pi * t) ** 0.9
        w = half_width * envelope
        px = cx + vx * r
        py = cy + vy * r
        left.append((px + ux * w, py + uy * w))
        right.append((px - ux * w, py - uy * w))
    pts = left + list(reversed(right))
    draw.polygon(pts, fill=(70, 140, 55, 255))
    mid_end = (cx + vx * (r_base + length * 0.92), cy + vy * (r_base + length * 0.92))
    mid_start = (cx + vx * (r_base + length * 0.08), cy + vy * (r_base + length * 0.08))
    draw.line([mid_start, mid_end], fill=(45, 100, 40, 200), width=2)


def render_master() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx = cy = SIZE / 2.0

    # One leaf peeking from a side gap (gaps are at integer steps after rotation)
    step = 2 * math.pi / PETAL_COUNT
    leaf_angle = -math.pi / 2 + step * 3  # lower-right gap
    draw_leaf(draw, cx, cy, leaf_angle, r_base=70, length=175, half_width=32)

    for i in range(PETAL_COUNT):
        # Offset by half-step so a gap points straight up (not a petal)
        angle = -math.pi / 2 + step * (i + 0.5)
        # Wide petals, thin gaps between them
        draw_petal(draw, cx, cy, angle, r_inner=55, r_outer=238, max_half_width=52)

    r = 70
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 210, 55, 255))
    r2 = 50
    draw.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=(250, 175, 25, 255))
    for i in range(14):
        a = 2 * math.pi * i / 14
        dx = math.cos(a) * 26
        dy = math.sin(a) * 26
        draw.ellipse((cx + dx - 3, cy + dy - 3, cx + dx + 3, cy + dy + 3), fill=(230, 150, 20, 255))

    daisy_h = 2 * 238  # petal tip to tip
    max_w = SIZE - 16  # keep a small margin inside the canvas
    font = _font(220)
    text = "WGS"
    # Render glyphs on a temp canvas, then scale to fit daisy height AND canvas width
    probe = Image.new("RGBA", (SIZE * 2, SIZE * 2), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(probe)
    bbox = pdraw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 12
    glyph = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glyph)
    gx, gy = pad - bbox[0], pad - bbox[1]
    outline = 3  # thinner outline for light type
    for ox in range(-outline, outline + 1):
        for oy in range(-outline, outline + 1):
            if ox * ox + oy * oy <= outline * outline:
                gdraw.text((gx + ox, gy + oy), text, font=font, fill=(20, 28, 12, 245))
    gdraw.text((gx, gy), text, font=font, fill=(255, 248, 220, 255))  # warm off-white / cream

    # Fit by the tighter of height≈daisy and width≤canvas, then stretch height +40%
    scale_h = daisy_h / th
    scale_w = max_w / tw
    scale = min(scale_h, scale_w)
    new_w = max(1, int(round(glyph.width * scale)))
    new_h = max(1, int(round(glyph.height * scale * 2.016)))
    glyph = glyph.resize((new_w, new_h), Image.Resampling.LANCZOS)
    # If vertical stretch overflows canvas, shrink uniformly to fit
    if new_h > SIZE - 8:
        fit = (SIZE - 8) / new_h
        new_w = max(1, int(round(new_w * fit)))
        new_h = max(1, int(round(new_h * fit)))
        glyph = glyph.resize((new_w, new_h), Image.Resampling.LANCZOS)
    img.alpha_composite(
        glyph,
        (int(cx - new_w / 2), int(cy - new_h / 2)),
    )
    return img


def _png_bytes(im: Image.Image) -> bytes:
    buf = BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def write_ico(path: Path, master: Image.Image, sizes: tuple[int, ...] = ICO_SIZES) -> None:
    entries: list[tuple[int, bytes]] = []
    for s in sizes:
        layer = master.resize((s, s), Image.Resampling.LANCZOS)
        entries.append((s, _png_bytes(layer)))

    count = len(entries)
    offset = 6 + 16 * count
    chunks: list[bytes] = [struct.pack("<HHH", 0, 1, count)]
    blobs: list[bytes] = []
    for s, blob in entries:
        w = 0 if s >= 256 else s
        h = 0 if s >= 256 else s
        chunks.append(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(blob), offset))
        blobs.append(blob)
        offset += len(blob)
    path.write_bytes(b"".join(chunks) + b"".join(blobs))


def main() -> None:
    master = render_master()
    png_path = OUT_DIR / "icon.png"
    ico_path = OUT_DIR / "icon.ico"
    master.save(png_path)
    write_ico(ico_path, master)
    data = ico_path.read_bytes()
    _r, _t, count = struct.unpack_from("<HHH", data, 0)
    print(f"Wrote {png_path}")
    print(f"Wrote {ico_path} ({count} sizes)")


if __name__ == "__main__":
    main()
