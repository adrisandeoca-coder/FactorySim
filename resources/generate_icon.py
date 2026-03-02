"""Generate FactorySim app icon — modern abstract flow diagram.

Renders at 4x supersampled resolution for crisp anti-aliasing,
then downscales with LANCZOS.
"""
from PIL import Image, ImageDraw, ImageFilter
import math
import os

RENDER_SIZE = 2048  # 4x supersample
FINAL_SIZE = 512
OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def lerp_color(c1, c2, t):
    """Linear interpolate between two RGBA colors."""
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def draw_gradient_bg(img, margin, radius):
    """Draw a rounded-rect background with a diagonal gradient."""
    w, h = img.size
    # Top-left color, bottom-right color
    c_tl = (79, 70, 229)    # indigo-600
    c_br = (37, 99, 235)    # blue-600
    c_highlight = (99, 102, 241)  # indigo-500 for top highlight

    # Create gradient on a temp image
    grad = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gpx = grad.load()

    for y in range(h):
        for x in range(w):
            # Diagonal gradient
            t = (x / w * 0.5 + y / h * 0.5)
            c = lerp_color(c_tl, c_br, t)
            gpx[x, y] = (*c, 255)

    # Create rounded-rect mask
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([margin, margin, w - margin, h - margin], radius=radius, fill=255)

    # Apply mask
    grad.putalpha(mask)

    # Composite onto img
    img.paste(grad, (0, 0), grad)

    # Subtle top highlight bar
    highlight = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    for y in range(margin, margin + int(h * 0.25)):
        alpha = int(40 * (1.0 - (y - margin) / (h * 0.25)))
        hd.line([(margin + radius, y), (w - margin - radius, y)], fill=(255, 255, 255, alpha))
    img.paste(Image.alpha_composite(img, highlight))


def draw_glow_line(img, start, end, color, width, glow_width, glow_alpha=60):
    """Draw a line with a soft glow underneath."""
    # Glow layer
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.line([start, end], fill=(*color[:3], glow_alpha), width=glow_width)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=glow_width // 2))
    img.paste(Image.alpha_composite(img, glow))

    # Sharp line on top
    draw = ImageDraw.Draw(img)
    draw.line([start, end], fill=color, width=width)


def draw_glow_circle(img, cx, cy, r, fill, border_color, border_w=6, shadow=True):
    """Draw a circle with optional drop shadow and border."""
    if shadow:
        shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow_layer)
        offset = r // 6
        sd.ellipse([cx - r + offset, cy - r + offset * 2, cx + r + offset, cy + r + offset * 2],
                    fill=(0, 0, 0, 80))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=r // 3))
        img.paste(Image.alpha_composite(img, shadow_layer))

    draw = ImageDraw.Draw(img)
    # Border circle (slightly larger)
    draw.ellipse([cx - r - border_w // 2, cy - r - border_w // 2,
                  cx + r + border_w // 2, cy + r + border_w // 2],
                 fill=border_color)
    # Fill circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)

    # Inner highlight (top-left crescent)
    highlight = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(highlight)
    hr = int(r * 0.75)
    hd.ellipse([cx - hr - int(r * 0.15), cy - hr - int(r * 0.15),
                cx + hr - int(r * 0.15), cy + hr - int(r * 0.15)],
               fill=(255, 255, 255, 35))
    # Clip to the circle
    clip_mask = Image.new("L", img.size, 0)
    cd = ImageDraw.Draw(clip_mask)
    cd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    temp = Image.new("RGBA", img.size, (0, 0, 0, 0))
    temp.paste(highlight, mask=clip_mask)
    img.paste(Image.alpha_composite(img, temp))


def draw_arrow_tip(draw, end, direction, color, size=28):
    """Draw a small arrowhead at the end of a line."""
    dx, dy = direction
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    left = (end[0] - ux * size + px * size * 0.45,
            end[1] - uy * size + py * size * 0.45)
    right = (end[0] - ux * size - px * size * 0.45,
             end[1] - uy * size - py * size * 0.45)
    draw.polygon([end, left, right], fill=color)


def create_icon():
    img = Image.new("RGBA", (RENDER_SIZE, RENDER_SIZE), (0, 0, 0, 0))
    S = RENDER_SIZE
    margin = int(S * 0.06)
    radius = int(S * 0.19)

    # === Background ===
    draw_gradient_bg(img, margin, radius)

    # === Node positions (proportional to RENDER_SIZE) ===
    # Clean 5-node flow: Source → A → B → C → Sink
    # with a branch: Source → D → C (merge)
    nodes = {
        "src":  (int(S * 0.18), int(S * 0.30)),  # Source - top left
        "a":    (int(S * 0.40), int(S * 0.22)),   # Station A - top center
        "b":    (int(S * 0.62), int(S * 0.40)),   # Station B - middle right
        "c":    (int(S * 0.48), int(S * 0.62)),   # Station C - lower center
        "d":    (int(S * 0.22), int(S * 0.58)),   # Station D - lower left (branch)
        "sink": (int(S * 0.78), int(S * 0.72)),   # Sink - bottom right
    }

    # Node sizes
    r_src = int(S * 0.055)
    r_station = int(S * 0.045)
    r_sink = int(S * 0.050)

    # Colors
    LINE_COLOR = (196, 210, 255, 220)  # soft blue-white
    LINE_GLOW = (165, 180, 252)        # indigo-300
    NODE_FILL = (255, 255, 255, 255)
    NODE_ACCENT = (199, 210, 254)       # indigo-200
    BRIGHT_NODE = (224, 231, 255)       # indigo-100

    # === Draw connections (glow lines + arrows) ===
    connections = [
        ("src", "a"),
        ("a", "b"),
        ("b", "c"),
        ("c", "sink"),
        ("src", "d"),
        ("d", "c"),
    ]

    line_w = int(S * 0.012)
    glow_w = int(S * 0.035)

    for src_key, dst_key in connections:
        sx, sy = nodes[src_key]
        ex, ey = nodes[dst_key]

        # Shorten line so it doesn't overlap nodes
        dx, dy = ex - sx, ey - sy
        length = math.sqrt(dx * dx + dy * dy)
        ux, uy = dx / length, dy / length

        # Get radii
        if src_key == "src":
            r1 = r_src
        elif src_key == "sink":
            r1 = r_sink
        else:
            r1 = r_station
        if dst_key == "src":
            r2 = r_src
        elif dst_key == "sink":
            r2 = r_sink
        else:
            r2 = r_station

        # Offset start/end to node edges
        sx2 = sx + ux * (r1 + int(S * 0.015))
        sy2 = sy + uy * (r1 + int(S * 0.015))
        ex2 = ex - ux * (r2 + int(S * 0.020))
        ey2 = ey - uy * (r2 + int(S * 0.020))

        draw_glow_line(img, (sx2, sy2), (ex2, ey2), LINE_COLOR, line_w, glow_w, glow_alpha=45)

        # Arrowhead
        draw = ImageDraw.Draw(img)
        draw_arrow_tip(draw, (ex2, ey2), (dx, dy), LINE_COLOR, size=int(S * 0.028))

    # === Draw nodes (back to front for proper layering) ===
    # Draw order: d, a, b, c, src, sink (larger nodes on top)

    # Station D (branch node) - slightly smaller
    draw_glow_circle(img, *nodes["d"], int(r_station * 0.9), BRIGHT_NODE, NODE_ACCENT, border_w=int(S * 0.005))

    # Station A
    draw_glow_circle(img, *nodes["a"], r_station, NODE_FILL, NODE_ACCENT, border_w=int(S * 0.006))

    # Station B
    draw_glow_circle(img, *nodes["b"], r_station, NODE_FILL, NODE_ACCENT, border_w=int(S * 0.006))

    # Station C (merge point) - slightly larger
    draw_glow_circle(img, *nodes["c"], int(r_station * 1.1), NODE_FILL, NODE_ACCENT, border_w=int(S * 0.006))

    # Source - prominent with accent
    draw_glow_circle(img, *nodes["src"], r_src, NODE_FILL, (165, 180, 252), border_w=int(S * 0.007))

    # Sink - prominent
    draw_glow_circle(img, *nodes["sink"], r_sink, NODE_FILL, (165, 180, 252), border_w=int(S * 0.007))

    # === Add subtle inner dots to source/sink for visual distinction ===
    draw = ImageDraw.Draw(img)
    # Source: small filled dot (input indicator)
    dot_r = int(r_src * 0.35)
    sx, sy = nodes["src"]
    draw.ellipse([sx - dot_r, sy - dot_r, sx + dot_r, sy + dot_r], fill=(99, 102, 241, 200))

    # Sink: small ring (output indicator)
    skx, sky = nodes["sink"]
    dot_r2 = int(r_sink * 0.35)
    draw.ellipse([skx - dot_r2, sky - dot_r2, skx + dot_r2, sky + dot_r2], fill=(99, 102, 241, 200))
    draw.ellipse([skx - dot_r2 + 6, sky - dot_r2 + 6, skx + dot_r2 - 6, sky + dot_r2 - 6], fill=NODE_FILL)

    return img


def main():
    img = create_icon()

    # Downscale to final size with high-quality LANCZOS
    final = img.resize((FINAL_SIZE, FINAL_SIZE), Image.LANCZOS)

    # Save PNG (512x512)
    png_path = os.path.join(OUT_DIR, "icon.png")
    final.save(png_path, "PNG")
    print(f"Saved {png_path}")

    # Save ICO (multi-resolution: 16, 32, 48, 64, 128, 256)
    ico_path = os.path.join(OUT_DIR, "icon.ico")
    sizes = [16, 32, 48, 64, 128, 256]
    ico_images = []
    for s in sizes:
        resized = img.resize((s, s), Image.LANCZOS)
        ico_images.append(resized)
    ico_images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes],
                        append_images=ico_images[1:])
    print(f"Saved {ico_path}")

    # Save a 32x32 favicon.png for web
    favicon_path = os.path.join(OUT_DIR, "favicon.png")
    img.resize((32, 32), Image.LANCZOS).save(favicon_path, "PNG")
    print(f"Saved {favicon_path}")

    # Preview at 128px
    preview = img.resize((128, 128), Image.LANCZOS)
    preview_path = os.path.join(OUT_DIR, "icon_preview.png")
    preview.save(preview_path, "PNG")
    print(f"Preview saved to {preview_path}")


if __name__ == "__main__":
    main()
