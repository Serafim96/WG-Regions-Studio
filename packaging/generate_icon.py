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
    """Angular geometric italic for WGS."""
    windir = Path(r"C:\Windows\Fonts")
    for name in (
        "GOTHICI.TTF",  # Century Gothic Italic — geometric / angular
        "framdit.ttf",  # Franklin Gothic Italic
        "ARIALNI.TTF",  # Arial Narrow Italic
        "calibrili.ttf",
        "segoeuii.ttf",
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
    # Flower sized so letters can be ~1.4× daisy width and still fit the canvas
    fs = 0.78
    r_outer = 238 * fs
    r_inner = 55 * fs
    petal_w = 52 * fs
    disk_r = 70 * fs
    disk_r2 = 50 * fs
    seed_r = 26 * fs

    step = 2 * math.pi / PETAL_COUNT
    leaf_angle = -math.pi / 2 + step * 3
    draw_leaf(
        draw,
        cx,
        cy,
        leaf_angle,
        r_base=70 * fs,
        length=175 * fs,
        half_width=32 * fs,
    )

    for i in range(PETAL_COUNT):
        angle = -math.pi / 2 + step * (i + 0.5)
        draw_petal(
            draw,
            cx,
            cy,
            angle,
            r_inner=r_inner,
            r_outer=r_outer,
            max_half_width=petal_w,
        )

    draw.ellipse((cx - disk_r, cy - disk_r, cx + disk_r, cy + disk_r), fill=(255, 210, 55, 255))
    draw.ellipse((cx - disk_r2, cy - disk_r2, cx + disk_r2, cy + disk_r2), fill=(250, 175, 25, 255))
    for i in range(14):
        a = 2 * math.pi * i / 14
        dx = math.cos(a) * seed_r
        dy = math.sin(a) * seed_r
        draw.ellipse((cx + dx - 3 * fs, cy + dy - 3 * fs, cx + dx + 3 * fs, cy + dy + 3 * fs), fill=(230, 150, 20, 255))

    daisy_h = 2 * r_outer
    daisy_w = daisy_h
    font = _font(220)
    cream = (255, 248, 220, 255)
    dark = (20, 28, 12, 245)
    fatten = 6  # was 5; +10% stroke weight (nearest int)
    outline = 4
    # Render each letter; widen S — Century Gothic S is optically narrow
    letter_widen = {"W": 1.0, "G": 1.0, "S": 1.38}
    rendered: list[Image.Image] = []
    for ch in "WGS":
        bb = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), ch, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        pad = fatten + outline + 8
        tile = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        tx, ty = pad - bb[0], pad - bb[1]
        td.text((tx, ty), ch, font=font, fill=dark, stroke_width=fatten + outline, stroke_fill=dark)
        td.text((tx, ty), ch, font=font, fill=cream, stroke_width=fatten, stroke_fill=cream)
        wmul = letter_widen[ch]
        if wmul != 1.0:
            tile = tile.resize(
                (max(1, int(round(tile.width * wmul))), tile.height),
                Image.Resampling.LANCZOS,
            )
        rendered.append(tile)

    # Equal center-to-center spacing; G on axis; no overlap
    # Height is independent of width fit (otherwise +% height gets cancelled).
    target_h = min(daisy_h * 0.6712, SIZE - 8)  # −5% vs 0.7065
    target_w = min(daisy_w * 1.54, SIZE - 4)
    max_tile_h = max(t.height for t in rendered)
    scale_y = target_h / max_tile_h
    scaled: list[Image.Image] = []
    for tile in rendered:
        sh = max(1, int(round(tile.height * scale_y)))
        sw = max(1, int(round(tile.width * scale_y)))
        scaled.append(tile.resize((sw, sh), Image.Resampling.LANCZOS))

    gap_px = max(6, int(round(scaled[1].width * 0.08)))
    pitch_needed = max(
        (scaled[0].width + scaled[1].width) // 2 + gap_px,
        (scaled[1].width + scaled[2].width) // 2 + gap_px,
    )
    edge = max(scaled[0].width, scaled[2].width)
    pitch_from_target = max(1, int(round(target_w / 2 - edge / 2)))
    pitch = max(pitch_needed, pitch_from_target)

    half_span = pitch + edge / 2
    limit = min(SIZE - 4, target_w)
    if half_span * 2 > limit:
        # Shrink only horizontally — keep letter height
        fit_x = limit / (half_span * 2)
        scaled = [
            t.resize(
                (max(1, int(round(t.width * fit_x))), t.height),
                Image.Resampling.LANCZOS,
            )
            for t in scaled
        ]
        pitch = max(1, int(round(pitch * fit_x)))
        gap_px = max(4, int(round(gap_px * fit_x)))
        pitch = max(
            pitch,
            (scaled[0].width + scaled[1].width) // 2 + gap_px,
            (scaled[1].width + scaled[2].width) // 2 + gap_px,
        )

    for tile, x_center in zip(scaled, (cx - pitch, cx, cx + pitch)):
        img.alpha_composite(
            tile,
            (int(x_center - tile.width / 2), int(cy - tile.height / 2)),
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
