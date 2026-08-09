"""Generate app icon: daisy + WGS on a green square."""

from __future__ import annotations

import math
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent
SIZE = 512
PETAL_COUNT = 8
ICO_SIZES = (16, 32, 48, 64, 128, 256)
FLOWER_AA = 4

# Keep layout; swap tones: meadow ≈ leaf (not as dark as old letter fill)
BG_COLOR = (72, 132, 58, 255)
LEAF_COLOR = (58, 118, 48, 255)
LEAF_VEIN = (40, 90, 35, 220)
# Letters ≈ former light meadow; dark outline for contrast on white petals
LETTER_FILL = (210, 232, 185, 255)
# Dark outline, +10% lighter toward white vs (32, 52, 26)
LETTER_OUTLINE = (54, 72, 49, 255)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    windir = Path(r"C:\Windows\Fonts")
    for name in (
        "GOTHICI.TTF",
        "framdit.ttf",
        "ARIALNI.TTF",
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


def _thicken_glyph(tile: Image.Image, radius: int) -> Image.Image:
    """Expand glyph silhouette by radius px (keeps colors; center stamp on top)."""
    if radius <= 0:
        return tile
    pad = radius * 2
    canvas = Image.new("RGBA", (tile.width + pad, tile.height + pad), (0, 0, 0, 0))
    ox = oy = radius
    r2 = radius * radius
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy <= r2:
                canvas.alpha_composite(tile, (ox + dx, oy + dy))
    canvas.alpha_composite(tile, (ox, oy))
    return canvas


def _apply_rounded_corners(im: Image.Image, radius: int) -> Image.Image:
    """Clip to a rounded square with supersampled edge AA."""
    if radius <= 0:
        return im
    aa = 4
    w, h = im.size
    mask_big = Image.new("L", (w * aa, h * aa), 0)
    ImageDraw.Draw(mask_big).rounded_rectangle(
        (0, 0, w * aa - 1, h * aa - 1),
        radius=max(1, radius * aa),
        fill=255,
    )
    mask = mask_big.resize((w, h), Image.Resampling.LANCZOS)
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r, g, b, ImageChops.multiply(a, mask)))


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
    ux, uy = -math.sin(angle), math.cos(angle)
    vx, vy = math.cos(angle), math.sin(angle)
    steps = 36
    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        r = r_inner + (r_outer - r_inner) * t
        if t >= 0.82:
            u = (t - 0.82) / 0.18
            envelope = math.sqrt(max(0.0, 1.0 - u * u))
        else:
            # Wide at the disk so neighboring roots meet (no hairline slits inside G)
            u = t / 0.82
            envelope = 0.55 + 0.45 * (math.sin(math.pi * u * 0.5) ** 0.7)
        w = max_half_width * envelope
        px = cx + vx * r
        py = cy + vy * r
        left.append((px + ux * w, py + uy * w))
        right.append((px - ux * w, py - uy * w))
    draw.polygon(left + list(reversed(right)), fill=(255, 255, 255, 255))


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
    draw.polygon(left + list(reversed(right)), fill=LEAF_COLOR)
    mid_end = (cx + vx * (r_base + length * 0.92), cy + vy * (r_base + length * 0.92))
    mid_start = (cx + vx * (r_base + length * 0.08), cy + vy * (r_base + length * 0.08))
    draw.line([mid_start, mid_end], fill=LEAF_VEIN, width=2)


def _content_width(im: Image.Image) -> int:
    bb = im.split()[-1].getbbox()
    return (bb[2] - bb[0]) if bb else 0


def _scale_to_content_width(tile: Image.Image, target_content_w: int) -> Image.Image:
    """Horizontally scale tile so opaque content width matches target (height unchanged)."""
    bb = tile.split()[-1].getbbox()
    if not bb or target_content_w <= 0:
        return tile
    cw = bb[2] - bb[0]
    if cw <= 0:
        return tile
    scale = target_content_w / cw
    new_w = max(1, int(round(tile.width * scale)))
    return tile.resize((new_w, tile.height), Image.Resampling.LANCZOS)


def render_master(*, match_s_width_to_w: bool = False) -> Image.Image:
    big = SIZE * FLOWER_AA
    flower = Image.new("RGBA", (big, big), BG_COLOR)
    draw = ImageDraw.Draw(flower)
    s = float(FLOWER_AA)

    cx = cy = big / 2.0
    fs = 0.78 * s
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
        draw.ellipse(
            (cx + dx - 3 * fs, cy + dy - 3 * fs, cx + dx + 3 * fs, cy + dy + 3 * fs),
            fill=(230, 150, 20, 255),
        )

    img = flower.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    fs1 = 0.78
    r_outer1 = 238 * fs1
    daisy_h = 2 * r_outer1
    daisy_w = daisy_h
    cx = cy = SIZE / 2.0
    font = _font(220)
    # Source stroke; visible +10% applied after downscale via _thicken_glyph
    fatten = 6
    outline = 5  # was 4; +5% outline try (ceil of 4×1.05)
    letter_widen = {"W": 1.0, "G": 1.0, "S": 1.38}
    rendered: list[Image.Image] = []
    for ch in "WGS":
        bb = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), ch, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        pad = fatten + outline + 8
        tile = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
        td = ImageDraw.Draw(tile)
        tx, ty = pad - bb[0], pad - bb[1]
        td.text(
            (tx, ty),
            ch,
            font=font,
            fill=LETTER_OUTLINE,
            stroke_width=fatten + outline,
            stroke_fill=LETTER_OUTLINE,
        )
        td.text(
            (tx, ty),
            ch,
            font=font,
            fill=LETTER_FILL,
            stroke_width=fatten,
            stroke_fill=LETTER_FILL,
        )
        wmul = letter_widen[ch]
        if wmul != 1.0:
            tile = tile.resize(
                (max(1, int(round(tile.width * wmul))), tile.height),
                Image.Resampling.LANCZOS,
            )
        rendered.append(tile)

    target_h = min(daisy_h * 0.6712, SIZE - 8)
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

    letters: list[Image.Image] = []
    for tile in scaled:
        # +5% width after layout so glyph centers stay put
        wide = tile.resize(
            (max(1, int(round(tile.width * 1.05))), tile.height),
            Image.Resampling.LANCZOS,
        )
        # Outline weight after scale (+5% vs prior 0.018)
        thick_r = max(2, int(round(wide.height * 0.0189)))
        letters.append(_thicken_glyph(wide, thick_r))

    if match_s_width_to_w:
        # Only S: stretch content width to match W; W and G untouched
        letters[2] = _scale_to_content_width(letters[2], _content_width(letters[0]))

    for tile, x_center in zip(letters, (cx - pitch, cx, cx + pitch)):
        img.alpha_composite(
            tile,
            (int(x_center - tile.width / 2), int(cy - tile.height / 2)),
        )
    return _apply_rounded_corners(img, radius=int(SIZE * 0.14))


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


def sync_derived(master: Image.Image) -> None:
    """Write icon.ico + frontend sidebar PNG + favicon from the master image."""
    ico_path = OUT_DIR / "icon.ico"
    write_ico(ico_path, master)
    fe_icon = OUT_DIR.parent / "frontend" / "src" / "assets" / "app-icon.png"
    fe_icon.parent.mkdir(parents=True, exist_ok=True)
    master.save(fe_icon)
    favicon = OUT_DIR.parent / "frontend" / "public" / "favicon.ico"
    favicon.parent.mkdir(parents=True, exist_ok=True)
    favicon.write_bytes(ico_path.read_bytes())
    data = ico_path.read_bytes()
    _r, _t, count = struct.unpack_from("<HHH", data, 0)
    print(f"Wrote {ico_path} ({count} sizes)")
    print(f"Wrote {fe_icon}")
    print(f"Wrote {favicon}")


def main(argv: list[str] | None = None) -> None:
    import sys

    args = list(sys.argv[1:] if argv is None else argv)
    png_path = OUT_DIR / "icon.png"
    if "--render" in args:
        master = render_master()
        master.save(png_path)
        print(f"Wrote {png_path}")
    else:
        if not png_path.is_file():
            raise SystemExit(f"ERROR: {png_path} missing (pass --render to generate).")
        master = Image.open(png_path).convert("RGBA")
        print(f"Using existing {png_path}")
    sync_derived(master)


if __name__ == "__main__":
    main()
