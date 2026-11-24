#!/usr/bin/env python3
"""
Generates every Starfall Isle texture listed in components/games/starfall/engine/textures.ts
into public/games/starfall/textures/<name>.webp.

  * Deterministic: each texture seeds its own RNG from its name, so `--only` gives identical output.
  * Seamless: every noise source is periodic (FFT-shaped white noise, lattices wrapped to the tile)
    and every filter wraps around the edges, so all textures tile in both directions.
  * Albedo and normal map come from the same height field; normals are tangent space,
    OpenGL convention (+X = image right, +Y = image up), Sobel-derived.
  * Hard-edged textures are drawn at 2x and box-filtered down (cheap supersampling).

Usage:  python3 tools/starfall/gen_textures.py [--out DIR] [--only grass,leaves,...]
Needs only numpy and Pillow; a full run takes about a minute.
"""
import argparse
import time
import zlib
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / 'public' / 'games' / 'starfall' / 'textures'
SEED = 1337
TAU = 2 * np.pi

ALBEDO_Q = 85
NORMAL_Q = 90


# ─── periodic primitives ──────────────────────────────────────────────────────────────

def rng_for(name):
    return np.random.default_rng(SEED + zlib.crc32(name.encode()))


def grid(n):
    """Pixel-centre coordinates (y, x), each n×n."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    return y, x


def _freqs(n):
    """Integer frequencies (cycles per tile) matching an n×n rfft2 layout."""
    fy = np.fft.fftfreq(n, 1 / n)[:, None]
    fx = np.fft.rfftfreq(n, 1 / n)[None, :]
    return fx, fy


def fbm(n, rng, lo=1.0, hi=None, slope=1.0, stretch=(1.0, 1.0)):
    """Periodic fractal noise, zero mean / unit std.

    White noise shaped by an amplitude spectrum ∝ f^-slope and band-limited to roughly
    [lo, hi] cycles per tile. stretch=(sx, sy) > 1 elongates features along that axis.
    """
    fx, fy = _freqs(n)
    r = np.hypot(fx * stretch[0], fy * stretch[1])
    r[0, 0] = 1.0
    amp = r ** -slope / (1.0 + (lo / r) ** 6)
    if hi:
        amp = amp * np.exp(-(r / hi) ** 2)
    amp[0, 0] = 0.0
    out = np.fft.irfft2(np.fft.rfft2(rng.standard_normal((n, n))) * amp, s=(n, n))
    return (out - out.mean()) / (out.std() + 1e-12)


def blur(a, sx, sy=None):
    """Periodic Gaussian blur (sigma in pixels, optionally anisotropic). Works on (H, W[, C])."""
    sy = sx if sy is None else sy
    if a.ndim == 3:
        return np.stack([blur(a[..., c], sx, sy) for c in range(a.shape[2])], -1)
    h, w = a.shape
    fx = np.fft.rfftfreq(w)[None, :]
    fy = np.fft.fftfreq(h)[:, None]
    g = np.exp(-2 * np.pi ** 2 * ((fx * sx) ** 2 + (fy * sy) ** 2))
    return np.fft.irfft2(np.fft.rfft2(a) * g, s=a.shape)


def kernel_fft(kernel, n):
    """FFT of a small centred kernel embedded (wrapped) in an n×n tile."""
    k = np.zeros((n, n))
    kh, kw = kernel.shape
    k[:kh, :kw] = kernel
    k = np.roll(k, (-(kh // 2), -(kw // 2)), axis=(0, 1))
    return np.fft.rfft2(k)


def impulses(n, ys, xs, weights=None):
    """n×n image with (weighted) unit impulses at integer pixel positions."""
    idx = (ys % n) * n + (xs % n)
    return np.bincount(idx, weights=weights, minlength=n * n).reshape(n, n).astype(np.float64)


def sample(a, y, x):
    """Bilinear lookup with wrap-around; y/x are float pixel coordinates."""
    h, w = a.shape[:2]
    x0 = np.floor(x)
    y0 = np.floor(y)
    tx = x - x0
    ty = y - y0
    x0 = x0.astype(np.int64) % w
    y0 = y0.astype(np.int64) % h
    x1 = (x0 + 1) % w
    y1 = (y0 + 1) % h
    if a.ndim == 3:
        tx = tx[..., None]
        ty = ty[..., None]
    top = a[y0, x0] * (1 - tx) + a[y0, x1] * tx
    bot = a[y1, x0] * (1 - tx) + a[y1, x1] * tx
    return top * (1 - ty) + bot * ty


def worley(cx, cy, cells, rng, jitter=0.9):
    """Periodic cellular noise on a cells=(nx, ny) lattice, one jittered feature point per cell.

    cx, cy are sample coordinates in cell units (any range; the lattice wraps).
    Returns F1, F2 (distances in cell units), the nearest cell's id and the offset
    (dx, dy) from that cell's feature point.
    """
    nx, ny = cells
    pts = 0.5 + (rng.random((ny, nx, 2)) - 0.5) * jitter
    ix = np.floor(cx).astype(np.int64)
    iy = np.floor(cy).astype(np.int64)
    f1 = np.full(cx.shape, np.inf)
    f2 = np.full(cx.shape, np.inf)
    ids = np.zeros(cx.shape, np.int64)
    ox = np.zeros(cx.shape)
    oy = np.zeros(cx.shape)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            jx = ix + dx
            jy = iy + dy
            mx = jx % nx
            my = jy % ny
            p = pts[my, mx]
            ddx = cx - (jx + p[..., 0])
            ddy = cy - (jy + p[..., 1])
            d = np.hypot(ddx, ddy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            f1 = np.where(closer, d, f1)
            ids = np.where(closer, my * nx + mx, ids)
            ox = np.where(closer, ddx, ox)
            oy = np.where(closer, ddy, oy)
    return f1, f2, ids, ox, oy


def wrap_delta(d, n):
    """Shortest signed distance on a ring of length n."""
    return (d + n / 2) % n - n / 2


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    """Lerp colours a→b by a scalar field t (broadcasts t over the channel axis)."""
    t = np.asarray(t)
    if np.ndim(a) == 3 or np.ndim(b) == 3:
        t = t[..., None] if t.ndim == 2 else t
    return a + (np.asarray(b) - a) * t


def ramp(t, stops):
    """Map a scalar field to RGB through [(pos, (r, g, b)), ...] stops (sRGB 0..255)."""
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], np.float64) / 255.0
    return np.stack([np.interp(t, pos, cols[:, c]) for c in range(3)], -1)


def rgb(*c):
    return np.array(c, np.float64) / 255.0


def norm01(a, lo=0.5, hi=99.5):
    """Stretch to 0..1 using percentiles (robust to outliers)."""
    p0, p1 = np.percentile(a, [lo, hi])
    return np.clip((a - p0) / (p1 - p0 + 1e-12), 0.0, 1.0)


def down(a, f):
    """Box-filter downsample by an integer factor."""
    if f == 1:
        return a
    h, w = a.shape[:2]
    return a.reshape(h // f, f, w // f, f, *a.shape[2:]).mean(axis=(1, 3))


def cavity(h, sigma):
    """Height relative to its neighbourhood (positive on ridges, negative in crevices)."""
    return h - blur(h, sigma)


def flatten_macro(col, sigma, keep):
    """Scale down tile-sized colour variation to `keep` of its strength (per channel).

    Large blotches are what give a repeating terrain texture away; detail is untouched.
    """
    low = blur(col, sigma)
    mean = col.reshape(-1, 3).mean(0)
    return col * (mean + keep * (low - mean)) / np.maximum(low, 1e-4)


def normal_map(h, strength, size):
    """Tangent-space normal map (OpenGL: green = up) from a periodic height field.

    h is in arbitrary units; strength scales the slopes (height units → pixels).
    Computed at h's resolution then averaged down to `size` and renormalised.
    """
    def sh(a, dy, dx):
        return np.roll(a, (dy, dx), axis=(0, 1))

    right, left = sh(h, 0, -1), sh(h, 0, 1)
    below, above = sh(h, -1, 0), sh(h, 1, 0)
    gx = (sh(right, 1, 0) + 2 * right + sh(right, -1, 0) - sh(left, 1, 0) - 2 * left - sh(left, -1, 0)) / 8
    gy = (sh(below, 0, 1) + 2 * below + sh(below, 0, -1) - sh(above, 0, 1) - 2 * above - sh(above, 0, -1)) / 8
    # Image rows grow downwards while tangent +Y points up the image, hence +gy.
    n = np.stack([-gx * strength, gy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    n = down(n, h.shape[0] // size)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


# ─── output ───────────────────────────────────────────────────────────────────────────

def save(out_dir, name, img, quality=ALBEDO_Q, lossless=False):
    a = np.clip(np.round(np.asarray(img) * 255.0), 0, 255).astype(np.uint8)
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, -1)
    im = Image.fromarray(a)
    # Lossless: `quality` is compression effort. `exact` keeps colour under transparent texels
    # (we dilate it there for clean mipmaps).
    im.save(out_dir / f'{name}.webp', 'WEBP', quality=100 if lossless else quality, lossless=lossless, method=6,
            exact=a.shape[2] == 4, alpha_quality=100)


# ─── terrain ──────────────────────────────────────────────────────────────────────────

LUSH = [(0.00, (26, 42, 18)), (0.20, (40, 68, 25)), (0.40, (64, 104, 34)), (0.60, (95, 136, 45)),
        (0.78, (134, 164, 60)), (1.00, (190, 198, 104))]
DRY = [(0.00, (44, 46, 21)), (0.20, (68, 72, 30)), (0.40, (104, 108, 44)), (0.60, (142, 140, 62)),
       (0.78, (176, 166, 84)), (1.00, (214, 202, 128))]


def blade_stamp(length, width, theta, bend):
    """Anti-aliased tapered grass blade: returns (coverage, coverage × tip-ness)."""
    r = int(np.ceil(length)) + 2
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float64)
    c, s = np.cos(theta), np.sin(theta)
    t = (xx * c + yy * s) / length
    tc = np.clip(t, 0, 1)
    perp = -xx * s + yy * c - bend * length * tc ** 2
    half = 0.5 * width * (1 - tc) ** 0.8 + 0.2
    cov = np.clip(half - np.abs(perp) + 0.5, 0, 1)
    cov *= np.clip((t + 0.06) / 0.12, 0, 1) * np.clip((1.02 - t) / 0.04, 0, 1)
    return cov, cov * tc


def clover_stamp(radius, theta):
    """Trefoil of three round leaflets; returns (coverage, pale-mark weight)."""
    r = int(np.ceil(radius * 2.1)) + 2
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float64)
    cov = np.zeros_like(xx)
    mark = np.zeros_like(xx)
    for k in range(3):
        a = theta + k * TAU / 3
        cx, cy = np.cos(a) * radius * 0.95, np.sin(a) * radius * 0.95
        d = np.hypot(xx - cx, yy - cy) / radius
        leaf = np.clip((1 - d) * radius + 0.5, 0, 1)
        cov = np.maximum(cov, leaf)
        # Pale chevron on the inner half of each leaflet.
        inward = -((xx - cx) * np.cos(a) + (yy - cy) * np.sin(a)) / radius
        mark = np.maximum(mark, leaf * np.exp(-((d - 0.45) / 0.12) ** 2) * (inward > -0.1))
    return cov, mark


def grass(rng):
    n = 1024
    macro = fbm(n, rng, 1, 4)
    dry = smoothstep(0.0, 2.2, fbm(n, rng, 2, 8)) * 0.3 + 0.06 * smoothstep(-1, 1, macro)
    # Mid-scale clumping (25–75 cm at the game's 3 m repeat): readable texture without exposing the tile.
    patch = norm01(0.65 * fbm(n, rng, 4, 14) + 0.35 * fbm(n, rng, 14, 60))

    # Matted under-layer of old blades and soil.
    under = 0.17 + 0.05 * fbm(n, rng, 6, 120, 0.7) + 0.03 * macro
    col = mix(ramp(under, LUSH), ramp(under, DRY), np.clip(dry + 0.2, 0, 1))
    h = 0.08 * fbm(n, rng, 6, 120, 0.7)

    # Blade stamps: a combed-but-varied lawn (tips lean mostly one way).
    n_st = 24
    comb = 1.1
    thetas = np.arange(n_st) * TAU / n_st + rng.uniform(-0.1, 0.1, n_st)
    lean = np.exp(-(wrap_delta(thetas - comb, TAU) / 0.9) ** 2)
    probs = (0.45 + lean) / (0.45 + lean).sum()
    stamps = [blade_stamp(rng.uniform(11, 21), rng.uniform(2.2, 3.2), th, rng.uniform(-0.18, 0.18)) for th in thetas]
    k_cov = [kernel_fft(c, n) for c, _ in stamps]
    k_tip = [kernel_fft(t, n) for _, t in stamps]

    cl_stamps = [clover_stamp(rng.uniform(5.5, 8.0), rng.uniform(0, TAU)) for _ in range(6)]
    cl_mask = smoothstep(0.5, 1.4, fbm(n, rng, 5, 24))

    # (blade count, base tone, base height)
    layers = [(56000, 0.29, 0.20), (58000, 0.40, 0.40), (50000, 0.50, 0.62), (32000, 0.61, 0.84)]
    for li, (count, tone0, h0) in enumerate(layers):
        if li == 2:
            col, h = _clover(n, rng, col, h, cl_stamps, cl_mask, dry)
        ys = rng.integers(0, n, count)
        xs = rng.integers(0, n, count)
        sid = rng.choice(n_st, count, p=probs)
        val = 0.6 * rng.random(count) + 0.4 * patch[ys, xs]
        cov_f = 0
        tip_f = 0
        val_f = 0
        for s in range(n_st):
            sel = sid == s
            f_i = np.fft.rfft2(impulses(n, ys[sel], xs[sel]))
            f_v = np.fft.rfft2(impulses(n, ys[sel], xs[sel], val[sel]))
            cov_f = cov_f + f_i * k_cov[s]
            tip_f = tip_f + f_i * k_tip[s]
            val_f = val_f + f_v * k_cov[s]
        cov = np.fft.irfft2(cov_f, s=(n, n))
        inv = 1.0 / np.maximum(cov, 1e-3)
        tip = np.clip(np.fft.irfft2(tip_f, s=(n, n)) * inv, 0, 1)
        val = np.clip(np.fft.irfft2(val_f, s=(n, n)) * inv, 0, 1)
        a = np.clip(cov, 0, 1)

        tone = tone0 + 0.17 * (val - 0.5) + 0.16 * tip * (0.6 + 0.4 * li / 3) + 0.015 * macro
        layer_col = mix(ramp(tone, LUSH), ramp(tone, DRY), np.clip(dry * (0.6 + 0.6 * tip), 0, 1))
        # Soft contact shadow cast by this layer onto everything beneath it.
        col = col * (1 - 0.38 * np.clip(blur(cov, 2.2), 0, 1))[..., None]
        col = mix(col, layer_col, a)
        h = h + (h0 + 0.18 * tip - h) * a

    col *= (1 + 0.025 * macro)[..., None]
    return np.clip(col, 0, 1), h


def _clover(n, rng, col, h, stamps, mask, dry):
    count = 2200
    ys = rng.integers(0, n, count * 4)
    xs = rng.integers(0, n, count * 4)
    keep = rng.random(count * 4) < mask[ys, xs]
    ys, xs = ys[keep][:count], xs[keep][:count]
    sid = rng.integers(0, len(stamps), len(ys))
    cov_f = 0
    mark_f = 0
    for s, (c, m) in enumerate(stamps):
        f_i = np.fft.rfft2(impulses(n, ys[sid == s], xs[sid == s]))
        cov_f = cov_f + f_i * kernel_fft(c, n)
        mark_f = mark_f + f_i * kernel_fft(m, n)
    cov = np.fft.irfft2(cov_f, s=(n, n))
    a = np.clip(cov, 0, 1)
    mark = np.clip(np.fft.irfft2(mark_f, s=(n, n)) / np.maximum(cov, 1e-3), 0, 1)
    tone = 0.42 + 0.12 * norm01(fbm(n, rng, 20, 200)) + 0.16 * mark
    cl = ramp(tone, [(0.0, (30, 56, 26)), (0.4, (66, 110, 48)), (0.6, (100, 146, 68)), (1.0, (164, 192, 124))])
    cl = mix(cl, ramp(tone, DRY), dry * 0.4)
    col = col * (1 - 0.3 * np.clip(blur(cov, 2.0), 0, 1))[..., None]
    col = mix(col, cl, a)
    h = h + (0.5 + 0.1 * mark - h) * a
    return col, h


def sand(rng):
    n = 1024
    y, x = grid(n)
    macro = fbm(n, rng, 1, 4)
    mid = fbm(n, rng, 6, 60)
    grain = blur(rng.standard_normal((n, n)), 0.6)
    grain /= grain.std()

    # Wind ripples: an integer wave vector keeps them periodic; a mid-frequency warp makes them
    # meander and fork without one big tile-sized bend that would betray the repeat.
    warp = 0.25 * fbm(n, rng, 1, 3, 1.4) + 0.35 * fbm(n, rng, 3, 8, 1.2)
    phase = (4 * x + 28 * y) / n + warp + 0.05 * fbm(n, rng, 10, 40)
    p = phase % 1.0
    profile = np.where(p < 0.7, smoothstep(0, 0.7, p), 1 - smoothstep(0.7, 1.0, p))
    strength = 0.2 + 0.8 * smoothstep(-0.9, 1.0, fbm(n, rng, 2, 5))
    ripple = (profile - 0.5) * strength

    tone = 0.52 + 0.03 * macro + 0.04 * mid + 0.045 * grain + 0.06 * ripple
    col = ramp(tone, [(0.0, (168, 138, 96)), (0.5, (222, 196, 150)), (1.0, (246, 230, 198))])
    # Slightly warmer patches; heavier dark grains settle in the ripple troughs.
    col = mix(col, col * rgb(255, 238, 218), smoothstep(-0.5, 1.5, fbm(n, rng, 2, 8)) * 0.35)
    col *= (1 - 0.06 * (0.5 - profile) * strength)[..., None]

    h = 0.45 * ripple + 0.05 * grain + 0.05 * mid
    # Specks: dark mineral grains, a few shell fragments.
    for count, size, cols, lift in (
        (9000, 0.55, [(98, 82, 66), (126, 92, 66), (70, 64, 60), (150, 118, 90), (176, 140, 104)], 0.06),
        (900, 0.9, [(252, 246, 236), (240, 214, 200), (230, 226, 216)], 0.12),
    ):
        ys, xs = rng.integers(0, n, count), rng.integers(0, n, count)
        pal = np.array(cols, np.float64) / 255.0
        ci = rng.integers(0, len(pal), count)
        m = np.clip(blur(impulses(n, ys, xs), size) * (2 * np.pi * size * size), 0, 1)
        cc = np.stack([blur(impulses(n, ys, xs, pal[ci, c]), size) * (2 * np.pi * size * size) for c in range(3)], -1)
        cc = cc / np.maximum(m, 1e-4)[..., None]
        col = mix(col, np.clip(cc, 0, 1), m * 0.85)
        h = h + lift * m
    return np.clip(col, 0, 1), h


def pebbles(n, rng, cells, fill, rmin, rmax, warp=0.07):
    """Scattered rounded pebbles: returns (mask, dome height, per-pixel cell id, cell count)."""
    y, x = grid(n)
    wx = fbm(n, rng, cells, cells * 3) * warp
    wy = fbm(n, rng, cells, cells * 3) * warp
    cx = x / n * cells + wx
    cy = y / n * cells + wy
    _, _, ids, ox, oy = worley(cx, cy, (cells, cells), rng, 0.8)
    m = cells * cells
    rad = rng.uniform(rmin, rmax, m) * (rng.random(m) < fill)
    # Squash each pebble into a random ellipse.
    ang = rng.uniform(0, np.pi, m)
    squash = rng.uniform(0.6, 1.0, m)
    ca, sa = np.cos(ang[ids]), np.sin(ang[ids])
    u = ox * ca + oy * sa
    v = (-ox * sa + oy * ca) / squash[ids]
    d = np.hypot(u, v) / np.maximum(rad[ids], 1e-6)
    px_per_unit = n / cells
    edge = 1.2 / (np.maximum(rad[ids], 1e-6) * px_per_unit)
    mask = np.clip((1 - d) / edge, 0, 1) * (rad[ids] > 0)
    dome = np.sqrt(np.clip(1 - d * d, 0, 1)) * mask
    return mask, dome, ids, m


def dirt(rng):
    n = 1024
    macro = fbm(n, rng, 1, 4)
    mid = fbm(n, rng, 6, 48)
    fine = fbm(n, rng, 60, 400, 0.4)
    # Packed earth: soft mottling, finer crumbs, and slightly darker compacted hollows.
    crumbs = fbm(n, rng, 30, 160, 0.8)
    tone = 0.5 + 0.035 * macro + 0.08 * mid + 0.05 * fine + 0.05 * crumbs
    col = ramp(tone, [(0.0, (84, 64, 46)), (0.35, (116, 90, 66)), (0.6, (140, 110, 80)), (1.0, (178, 150, 116))])
    # Dusty, sun-bleached patches.
    col = mix(col, col * 1.07 + 0.025, smoothstep(0.3, 1.8, fbm(n, rng, 3, 14)) * 0.5)
    h = 0.5 * mid + 0.15 * fine + 0.3 * crumbs

    pal = np.array([(150, 142, 130), (124, 114, 104), (168, 154, 134), (132, 104, 82), (104, 94, 86), (178, 168, 150)],
                   np.float64) / 255.0
    for cells, fill, rmin, rmax, height in ((12, 0.28, 0.2, 0.36, 9.0), (30, 0.45, 0.2, 0.4, 4.0),
                                            (80, 0.5, 0.22, 0.45, 1.6)):
        mask, dome, ids, m = pebbles(n, rng, cells, fill, rmin, rmax)
        ao = np.clip(blur(mask, n / cells * 0.1), 0, 1)
        col *= (1 - 0.3 * ao)[..., None]
        tint = pal[rng.integers(0, len(pal), m)] * rng.uniform(0.88, 1.1, (m, 1))
        speck = 1 + 0.06 * fine + 0.04 * crumbs
        pc = tint[ids] * ((0.62 + 0.46 * dome) * speck)[..., None]
        # Half-buried: soil dusting creeps over the pebble rims.
        cover = mask * smoothstep(0.0, 0.3, dome + 0.06 * mid)
        col = mix(col, np.clip(pc, 0, 1), cover)
        h = h + height * (0.35 + 0.65 * dome) * cover - 0.25 * height * ao * (1 - mask)
    return np.clip(col, 0, 1), h


def rock(rng):
    n = 1024
    y, x = grid(n)
    w1 = fbm(n, rng, 1, 5, 1.3)
    w2 = fbm(n, rng, 1, 5, 1.3)
    detail = fbm(n, rng, 14, 320, 0.7)
    grit = blur(rng.standard_normal((n, n)), 0.7)
    grit /= grit.std()

    def chunks(cells, warp, tilt_sd, swell, jitter):
        """Lightly warped Voronoi cells (edges stay mostly straight), each a tilted plane that
        swells toward its centre. Returns (height in px, border distance, cell ids)."""
        f1, f2, ids, ox, oy = worley(x / n * cells + warp * w1, y / n * cells + warp * w2, (cells, cells), rng, jitter)
        tilt = rng.normal(0, tilt_sd, (cells * cells, 2))
        lift = rng.normal(0, 0.12, cells * cells)
        hgt = (tilt[ids, 0] * ox + tilt[ids, 1] * oy + lift[ids] - swell * f1) * (n / cells) * 0.5
        return blur(hgt, 1.2), f2 - f1, ids

    big, e_big, ids = chunks(4, 0.05, 0.45, 0.35, 0.9)
    mid, e_mid, _ = chunks(10, 0.08, 0.35, 0.3, 0.9)
    small, e_small, _ = chunks(24, 0.1, 0.3, 0.3, 0.9)
    # Medium/small fracturing only in some regions, so chunk sizes vary across the tile.
    mid_on = smoothstep(-0.4, 0.6, fbm(n, rng, 1, 5))
    small_on = smoothstep(-0.2, 0.9, fbm(n, rng, 2, 8))
    crack = (1 - smoothstep(0.0, 0.02, e_big)) * smoothstep(-0.1, 0.7, fbm(n, rng, 2, 8))
    crack_mid = (1 - smoothstep(0.0, 0.03, e_mid)) * mid_on * smoothstep(-0.2, 0.7, fbm(n, rng, 3, 12))
    crack_small = (1 - smoothstep(0.0, 0.04, e_small)) * small_on * 0.6

    # Sedimentary layering: a sharp step then a slow slope = little ledges, wavy and fading in/out.
    phase = 7 * y / n + 0.3 * w1 + 0.03 * detail
    band = np.floor(phase).astype(np.int64) % 7
    pp = phase % 1.0
    strata_on = smoothstep(-0.9, 0.5, fbm(n, rng, 1, 4))
    ledges = (smoothstep(0.0, 0.16, pp) - pp) * strata_on * 9.0

    # The big blocks are softened into broad facets so the tile doesn't read as crazy paving;
    # crisp edges come from the (patchy) medium/small fractures and the cracks.
    ridged = (1 - np.abs(fbm(n, rng, 3, 30, 1.1))) ** 2
    h = (0.8 * blur(big, 10) + 0.8 * mid * mid_on + 0.4 * small * small_on + ledges
         + 4.0 * fbm(n, rng, 3, 24, 1.2) + 3.5 * ridged + 1.2 * detail + 0.35 * grit
         - 9.0 * crack - 5.0 * crack_mid - 2.0 * crack_small)

    cav = cavity(h, 5) / 6.0
    band_tone = rng.uniform(-0.07, 0.07, 7)
    band_warm = rng.uniform(0, 1, 7)
    chunk_tone = rng.uniform(-0.04, 0.04, 16)
    tone = (0.56 + 0.04 * fbm(n, rng, 1, 6) + 0.045 * detail + 0.03 * grit + band_tone[band] * strata_on
            + chunk_tone[ids] + 0.22 * np.tanh(cav) - 0.24 * crack - 0.16 * crack_mid - 0.06 * crack_small)
    col = ramp(tone, [(0.0, (44, 40, 36)), (0.3, (86, 79, 71)), (0.5, (120, 110, 98)), (0.7, (152, 142, 126)),
                      (1.0, (198, 190, 172))])
    warm = np.clip(smoothstep(0.0, 1.6, fbm(n, rng, 1, 6)) + 0.35 * band_warm[band] * strata_on - 0.1, 0, 1)
    col = mix(col, col * rgb(255, 224, 186), warm * 0.5)
    cool = smoothstep(0.2, 1.6, fbm(n, rng, 2, 6))
    col = mix(col, col * rgb(214, 222, 230), cool * 0.4)
    # Lichen blotches on exposed, convex faces.
    lichen = (smoothstep(0.9, 1.3, fbm(n, rng, 12, 70)) * smoothstep(0.3, 1.1, fbm(n, rng, 2, 6))
              * smoothstep(-0.5, 0.5, cav) * (1 - crack))
    col = mix(col, rgb(170, 166, 114) * (0.92 + 0.1 * detail[..., None]), lichen * 0.5)
    return np.clip(col, 0, 1), h


# ─── props ────────────────────────────────────────────────────────────────────────────

def planks(rng):
    n = 1024
    y, x = grid(n)
    rows = 4
    bh = n // rows
    joists = (np.arange(4) + 0.5) * n / 4
    row = (y // bh).astype(np.int64)
    vl = (y - row * bh) / bh

    # Board segments: each row is butt-jointed over 1–2 of the joists.
    seg = np.zeros((n, n), np.int64)
    d_joint = np.full((n, n), np.inf)
    cuts = []
    used = []
    for r in range(rows):
        # Stagger the joints: never reuse a joist that a neighbouring row is cut on.
        while True:
            k = set(rng.choice(4, rng.integers(1, 3), replace=False).tolist())
            if not (used and k & used[-1]) and not (r == rows - 1 and k & used[0]):
                break
        used.append(k)
        cut = np.sort(joists[sorted(k)])
        cuts.append(cut)
        sel = row == r
        xs = x[sel]
        seg[sel] = r * 4 + np.searchsorted(cut, xs) % len(cut)
        d_joint[sel] = np.min(np.abs(wrap_delta(xs[:, None] - cut[None, :], n)), axis=1)
    nseg = rows * 4

    d_side = np.minimum(vl, 1 - vl) * bh
    d_edge = np.minimum(d_side, d_joint)
    gap = 3.0
    board = smoothstep(gap - 0.8, gap + 0.8, d_edge)

    # Grain: fine wavy growth lines + long fibre streaks, bent around the occasional knot.
    streak = fbm(n, rng, 2, 220, 0.75, stretch=(16, 1))
    fibre = fbm(n, rng, 20, 400, 0.5, stretch=(10, 1))
    wav = fbm(n, rng, 1, 40, 1.0, stretch=(6, 1))
    seg_phase = rng.random(nseg)
    seg_freq = rng.uniform(7, 12, nseg)
    knot_bend = np.zeros((n, n))
    knot_core = np.zeros((n, n))
    for s in range(nseg):
        r = s // 4
        if s % 4 >= len(cuts[r]) or rng.random() > 0.6:
            continue
        kx = rng.uniform(0, n)
        ky = r * bh + rng.uniform(0.3, 0.7) * bh
        dx = wrap_delta(x - kx, n)
        dy = y - ky
        rx, ry = rng.uniform(11, 18), rng.uniform(7, 11)
        e = np.hypot(dx / (rx * 3.4), dy / (ry * 3.0))
        on = seg == s
        knot_bend += on * np.exp(-e * e) * np.sign(dy + 1e-3) * 1.1
        knot_core = np.maximum(knot_core, on * smoothstep(1.1, 0.6, np.hypot(dx / rx, dy / ry)))
    lines_ph = vl * seg_freq[seg] + seg_phase[seg] + 0.5 * wav + knot_bend
    lines = 0.5 + 0.5 * np.cos(TAU * lines_ph)
    grain = smoothstep(0.62, 1.0, lines) * (0.55 + 0.45 * smoothstep(-1, 1, streak))

    pal = np.array([(160, 114, 72), (146, 104, 66), (170, 128, 84), (136, 98, 64), (154, 118, 80), (174, 130, 86)],
                   np.float64) / 255.0
    base = pal[rng.integers(0, len(pal), nseg)] * rng.uniform(0.92, 1.07, (nseg, 1))
    col = base[seg] * (1 + 0.06 * streak + 0.035 * fibre - 0.2 * grain)[..., None]
    col = mix(col, rgb(76, 48, 30), knot_core * 0.85)
    # Sun-silvered weathering that follows the grain, grime toward the gaps.
    weather = smoothstep(-0.3, 1.6, fbm(n, rng, 1, 8, 1.0, stretch=(5, 1))) * 0.32 + 0.08 * smoothstep(-1, 1, streak)
    col = mix(col, rgb(152, 140, 122), weather)
    col *= (1 - 0.3 * np.exp(-np.maximum(d_edge - gap, 0) / 7))[..., None]
    col = mix(rgb(32, 24, 18), col, board)

    h = (board * (smoothstep(gap, gap + 12, d_edge) * 7.0 + 3.0) - 0.9 * grain + 0.5 * streak + 0.25 * fibre
         - 1.0 * knot_core)

    # Nails: two per board at every joist (four at a joint), rusty halo and a slightly dished ring.
    for r in range(rows):
        for jx in joists:
            offs = [-12.0, 12.0] if np.any(np.abs(cuts[r] - jx) < 1) else [0.0]
            for ox in offs:
                for fy in (0.28, 0.72):
                    cxn = jx + ox + rng.uniform(-2, 2)
                    cyn = r * bh + fy * bh + rng.uniform(-4, 4)
                    d = np.hypot(wrap_delta(x - cxn, n), wrap_delta(y - cyn, n))
                    head = smoothstep(5.5, 4.0, d)
                    rust = np.exp(-(d / 11) ** 2) * (1 - head)
                    col = mix(col, rgb(104, 64, 38), rust * 0.4)
                    shade = 0.75 + 0.45 * smoothstep(4.5, 0, np.hypot(wrap_delta(x - cxn + 1.5, n),
                                                                    wrap_delta(y - cyn + 1.5, n)))
                    col = mix(col, rgb(62, 58, 56) * shade[..., None], head)
                    h = h + 1.5 * head - 0.6 * rust
    return np.clip(col, 0, 1), h


def stone(rng):
    n = 1024
    y, x = grid(n)
    heights = rng.uniform(0.85, 1.15, 5)
    edges = np.round(np.concatenate([[0], np.cumsum(heights / heights.sum() * n)])).astype(np.int64)
    row = np.clip(np.searchsorted(edges, y, side='right') - 1, 0, 4)

    blk = np.zeros((n, n), np.int64)
    sdf = np.zeros((n, n))
    lx = np.zeros((n, n))      # position relative to the block centre (for per-block tilt)
    ly = np.zeros((n, n))
    nblk = 0
    for r in range(5):
        y0, y1 = edges[r], edges[r + 1]
        widths = []
        while sum(widths) < n - 240:
            widths.append(rng.uniform(200, 380))
        widths.append(n - sum(widths))
        if widths[-1] < 170:
            widths[-2] += widths[-1]
            widths.pop()
        bounds = np.concatenate([[0], np.cumsum(widths)])
        shift = rng.uniform(0, n)
        sel = row == r
        xs = (x[sel] - shift) % n
        bi = np.clip(np.searchsorted(bounds, xs, side='right') - 1, 0, len(widths) - 1)
        cxl = (bounds[bi] + bounds[bi + 1]) / 2
        hw = (bounds[bi + 1] - bounds[bi]) / 2
        hh = (y1 - y0) / 2
        rc = 16.0
        qx = np.abs(xs - cxl) - (hw - rc)
        qy = np.abs(y[sel] - (y0 + y1) / 2) - (hh - rc)
        sdf[sel] = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - rc
        blk[sel] = nblk + bi
        lx[sel] = xs - cxl
        ly[sel] = y[sel] - (y0 + y1) / 2
        nblk += len(widths)

    # Irregular, hand-cut edges: smooth wobble plus a few chips.
    chip = 4.5 * fbm(n, rng, 6, 40, 1.0) + 2.5 * smoothstep(0.8, 1.8, fbm(n, rng, 20, 90, 0.8))
    mortar = 7.0
    d_in = -(sdf + chip) - mortar
    face = smoothstep(-0.8, 0.8, d_in)
    bevel = smoothstep(0, 26, d_in)
    grain = fbm(n, rng, 30, 400, 0.5)
    surf = fbm(n, rng, 4, 40, 1.1)
    tilt = rng.normal(0, 0.012, (nblk, 2))
    h_face = 12.0 * bevel + 1.8 * surf + 0.6 * grain + tilt[blk, 0] * lx + tilt[blk, 1] * ly
    h_mortar = -2.0 + 0.6 * fbm(n, rng, 40, 300, 0.5)
    h = h_mortar + (h_face - h_mortar) * face

    pal = np.array([(176, 164, 142), (162, 150, 130), (184, 172, 150), (156, 150, 140), (172, 156, 130),
                    (166, 160, 148)], np.float64) / 255.0
    base = pal[rng.integers(0, len(pal), nblk)] * rng.uniform(0.93, 1.05, (nblk, 1))
    tone = 1 + 0.035 * surf + 0.05 * grain + 0.07 * (bevel - 1) + 0.025 * fbm(n, rng, 1, 5)
    col = base[blk] * tone[..., None]
    stain = smoothstep(0.5, 1.8, fbm(n, rng, 3, 14))
    col = mix(col, col * rgb(228, 212, 184), stain * 0.4)
    mcol = rgb(150, 140, 124) * (1 + 0.08 * fbm(n, rng, 60, 400, 0.4))[..., None]
    mcol *= (0.6 + 0.4 * smoothstep(0, 9, -(sdf + chip) + mortar * 0.3))[..., None]
    col = mix(mcol, col, face)
    return np.clip(col, 0, 1), h


def bark(rng):
    n = 1024
    y, x = grid(n)
    # Furrows follow the zero-crossings of a vertically stretched noise: long, meandering lines
    # that split and merge — the interlaced ridge pattern of oak / pine bark.
    sway = fbm(n, rng, 1, 6, 1.2, stretch=(1, 4))
    f = sample(fbm(n, rng, 4, 16, 1.0, stretch=(1, 7)), y, x + 12 * sway)
    a = np.abs(f)
    ridge = smoothstep(0.22, 0.8, a) ** 0.6 * (0.85 + 0.15 * smoothstep(0.8, 1.8, a))  # wide furrows, crisp sides
    # Ridges break into plates along the short, mostly horizontal edges of tall Voronoi cells.
    g1, g2, ids, _, _ = worley(x / n * 9 + 0.4 * sway, y / n * 4, (9, 4), rng, 0.95)
    plates = ((1 - smoothstep(0.0, 0.09, g2 - g1)) * smoothstep(0.3, 0.8, a)
              * smoothstep(-0.3, 0.6, fbm(n, rng, 2, 10)))
    fibre = fbm(n, rng, 6, 320, 0.7, stretch=(1, 10))
    lumps = fbm(n, rng, 2, 16, 1.1, stretch=(1, 2))
    rough = fbm(n, rng, 20, 200, 0.8)
    h = 22.0 * ridge + 1.6 * fibre + 2.5 * lumps + 0.8 * rough - 4.5 * plates

    cav = np.tanh(cavity(h, 8) / 5.0)
    plate_tone = rng.uniform(-0.05, 0.05, 36)
    tone = (0.14 + 0.58 * ridge + 0.05 * fibre + 0.03 * lumps + 0.03 * rough + 0.1 * cav - 0.12 * plates
            + plate_tone[ids] * ridge)
    col = ramp(tone, [(0.0, (34, 26, 21)), (0.3, (64, 50, 39)), (0.5, (96, 76, 60)), (0.7, (124, 106, 88)),
                      (1.0, (160, 148, 132))])
    col = mix(col, col * rgb(236, 240, 246), smoothstep(0.2, 1.6, fbm(n, rng, 1, 6)) * 0.35)
    moss = smoothstep(0.4, 1.6, fbm(n, rng, 2, 12, 1.0, stretch=(1, 2))) * (1 - ridge) * 0.35
    col = mix(col, rgb(72, 86, 48), moss)
    return np.clip(col, 0, 1), h


def roof(rng):
    n = 1024
    rows, cols = 8, 8
    rh, cw = n // rows, n // cols
    bulge = 0.28 * rh
    y, x = grid(n)

    def tile_u(r, xs):
        """Position across the tile (0..1) and the tile's column, for row r (odd rows staggered)."""
        xx = (xs - (r % 2) * cw / 2) % n
        return xx / cw - np.floor(xx / cw), np.floor(xx / cw).astype(np.int64)

    def bottom(r, xs):
        u, _ = tile_u(r, xs)
        return (r + 1) * rh + bulge * np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1))

    # Each tile's rounded lower edge overlaps the top of the row below it.
    r0 = (y // rh).astype(np.int64)
    r = np.where(y < bottom(r0 - 1, x), r0 - 1, r0)
    u, c = tile_u(r, x)
    vb = bottom(r, x) - y                # distance up from this tile's own lower edge
    ds = y - bottom(r - 1, x)            # distance below the overlapping tile's edge
    tid = (r % rows) * cols + c

    across = np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1))
    gap = smoothstep(0.0, 0.025, u) * smoothstep(1.0, 0.975, u)
    rim = smoothstep(0.0, 1.5, vb)
    noise = fbm(n, rng, 6, 120, 0.8)
    h = (14.0 * (1 - np.clip(vb / (rh * 1.35), 0, 1)) + 9.0 * across + 1.0 * noise) * gap * rim
    h -= 5.0 * np.exp(-ds / 6)

    pal = np.array([(192, 94, 56), (178, 84, 52), (200, 108, 66), (166, 76, 48), (204, 120, 80), (186, 100, 60),
                    (174, 90, 58)], np.float64) / 255.0
    m = rows * cols
    base = pal[rng.integers(0, len(pal), m)] * rng.uniform(0.92, 1.06, (m, 1))
    tone = 1 + 0.06 * noise + 0.1 * (across - 0.6) + 0.04 * fbm(n, rng, 1, 5)
    col = base[tid] * tone[..., None]
    grime = smoothstep(0.2, 1.4, fbm(n, rng, 2, 10)) * (1 - np.clip(vb / rh, 0, 1)) ** 0.5
    col = mix(col, col * rgb(150, 120, 104), grime * 0.4)
    lichen = smoothstep(1.2, 1.7, fbm(n, rng, 20, 110, 0.9)) * smoothstep(0.0, 1.2, fbm(n, rng, 2, 6))
    col = mix(col, rgb(190, 184, 146), lichen * 0.45)
    col = mix(col, col * 1.1, smoothstep(10, 2, vb) * 0.6)           # worn, sunlit lip
    col *= (1 - 0.5 * np.exp(-ds / 9))[..., None]                     # shadow under the tile above
    col = mix(rgb(56, 28, 20), col, gap * rim)
    return np.clip(col, 0, 1), h


def plaster(rng):
    n = 512
    macro = fbm(n, rng, 1, 5)
    mid = fbm(n, rng, 4, 40, 1.0)
    fine = blur(rng.standard_normal((n, n)), 0.7)
    fine /= fine.std()
    # Trowel marks: faint contour lines of a smooth warped field.
    t = fbm(n, rng, 1, 8, 1.4)
    trowel = np.exp(-((((t * 3.0) % 1.0) - 0.5) / 0.035) ** 2) * smoothstep(-0.5, 1.0, fbm(n, rng, 2, 10))
    tone = 0.62 + 0.025 * macro + 0.03 * mid + 0.022 * fine - 0.035 * trowel
    col = ramp(tone, [(0.0, (150, 136, 112)), (0.5, (214, 200, 176)), (0.62, (228, 216, 194)), (1.0, (248, 242, 228))])
    stain = smoothstep(0.5, 2.2, fbm(n, rng, 2, 10))
    col = mix(col, col * rgb(240, 226, 198), stain * 0.3)
    ys, xs = rng.integers(0, n, 700), rng.integers(0, n, 700)
    pits = np.clip(blur(impulses(n, ys, xs, rng.uniform(0.4, 1.0, 700)), 0.7) * 2.5, 0, 1)
    col *= (1 - 0.16 * pits)[..., None]
    return np.clip(col, 0, 1)


def cloth(rng):
    n = 1024
    threads = 64
    p = n / threads
    y, x = grid(n)
    # Slight waviness so the weave isn't machine-perfect.
    wx = x + 1.6 * fbm(n, rng, 2, 16, 1.0, stretch=(1, 4))
    wy = y + 1.6 * fbm(n, rng, 2, 16, 1.0, stretch=(4, 1))
    ci = np.floor(wx / p).astype(np.int64) % threads
    ri = np.floor(wy / p).astype(np.int64) % threads
    fu = (wx / p) % 1.0
    fv = (wy / p) % 1.0
    over = (ci + ri) % 2 == 0                      # warp (vertical thread) on top here
    slub_w = 1 + 0.25 * smoothstep(1.2, 2.2, fbm(n, rng, 2, 24, 1.0, stretch=(1, 12)))
    slub_h = 1 + 0.25 * smoothstep(1.2, 2.2, fbm(n, rng, 2, 24, 1.0, stretch=(12, 1)))
    prof_w = np.clip(1 - ((fu - 0.5) / (0.46 * slub_w)) ** 2, 0, 1) ** 0.5
    prof_h = np.clip(1 - ((fv - 0.5) / (0.46 * slub_h)) ** 2, 0, 1) ** 0.5
    arch_v = np.sin(np.pi * fv)
    arch_u = np.sin(np.pi * fu)
    hw = prof_w * np.where(over, 0.6 + 0.4 * arch_v, 0.35 * (1 - arch_v))
    hh = prof_h * np.where(over, 0.35 * (1 - arch_u), 0.6 + 0.4 * arch_u)
    h = np.maximum(hw, hh)
    warp_on_top = hw >= hh

    tw = rng.uniform(-0.04, 0.04, threads)
    th = rng.uniform(-0.04, 0.04, threads)
    thread_tone = np.where(warp_on_top, tw[ci], th[ri])
    fibre = fbm(n, rng, 30, 300, 0.6)
    tone = 0.62 + 0.16 * (h - 0.5) + thread_tone + 0.02 * fibre + 0.02 * fbm(n, rng, 1, 6)
    col = ramp(tone, [(0.0, (110, 98, 78)), (0.4, (184, 170, 144)), (0.62, (220, 208, 182)), (1.0, (244, 236, 216))])
    stain = smoothstep(-0.5, 2.0, fbm(n, rng, 1, 4, 1.2))
    col = mix(col, col * rgb(236, 224, 198), stain * 0.3)
    return np.clip(down(col, 2), 0, 1)


# ─── foliage ──────────────────────────────────────────────────────────────────────────

def _leaf_halfwidth(t, kind):
    t = np.clip(t, 0, 1)
    if kind == 'oval':
        return np.sin(np.pi * t ** 0.9) ** 0.8
    if kind == 'lance':
        return np.sin(np.pi * t ** 0.75) ** 1.3 * 0.55
    if kind == 'round':
        return np.sqrt(np.clip(1 - (2 * t - 1) ** 2, 0, 1)) * (1 - 0.15 * t)
    # 'heart': broad lobed base, pointed tip.
    return (np.sin(np.pi * t ** 0.55) ** 0.9) * (1 - 0.45 * np.exp(-((t - 0.02) / 0.08) ** 2))


def _leaf_cluster(rng, s, kind, leaf_len, aspect, spacing, n_branch, tone_bias):
    """One leaf-cluster card at s² px: a forked twig with leaves along every branch.

    Returns (rgb, alpha). Leaves are drawn back-to-front; depth and the position relative
    to the sun (upper left) drive the tone, so the cluster reads as a lit volume.
    """
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float64) + 0.5
    rgb_ = np.zeros((s, s, 3))
    a_ = np.zeros((s, s))
    margin = s * 0.03
    centre = np.array([s * 0.5, s * 0.46])
    light = np.array([-0.6, -0.8])

    def bez(p0, p1, p2, k=40):
        t = np.linspace(0, 1, k)[:, None]
        return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2

    main = bez(np.array([0.5, 0.955]) * s, np.array([0.5 + rng.uniform(-0.05, 0.05), 0.6]) * s,
               np.array([0.5 + rng.uniform(-0.06, 0.06), 0.2]) * s)
    stems = [(main, 0.011 * s, 0.004 * s)]
    for i in range(n_branch):
        t = 0.32 + 0.6 * i / max(n_branch - 1, 1) + rng.uniform(-0.03, 0.03)
        p0 = main[min(int(t * (len(main) - 1)), len(main) - 1)]
        side = 1 if i % 2 else -1
        # Lower branches spread wide (almost horizontal), upper ones climb.
        ang = -np.pi / 2 + side * (1.35 - 0.8 * t + rng.uniform(-0.15, 0.15))
        ln = s * rng.uniform(0.3, 0.42) * (1.15 - 0.45 * t)
        d = np.array([np.cos(ang), np.sin(ang)])
        p2 = np.clip(p0 + d * ln, margin * 2, s - margin * 2)
        p1 = (p0 + p2) * 0.5 + np.array([0, ln * 0.1])            # slight droop
        stems.append((bez(p0, p1, p2), 0.0065 * s, 0.0025 * s))

    def segment_cov(p0, p1, width):
        d = p1 - p0
        x0, x1 = int(max(min(p0[0], p1[0]) - width - 2, 0)), int(min(max(p0[0], p1[0]) + width + 3, s))
        y0, y1 = int(max(min(p0[1], p1[1]) - width - 2, 0)), int(min(max(p0[1], p1[1]) + width + 3, s))
        px, py = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
        t = np.clip(((px - p0[0]) * d[0] + (py - p0[1]) * d[1]) / max(d @ d, 1e-6), 0, 1)
        dist = np.hypot(px - (p0[0] + d[0] * t), py - (p0[1] + d[1] * t))
        return (y0, y1, x0, x1), np.clip(width - dist + 0.5, 0, 1)

    twig = rgb(96, 70, 48)
    for pts, w0, w1 in stems:
        for i in range(len(pts) - 1):
            w = w0 + (w1 - w0) * i / (len(pts) - 1)
            (y0, y1, x0, x1), cv = segment_cov(pts[i], pts[i + 1], w)
            rgb_[y0:y1, x0:x1] = mix(rgb_[y0:y1, x0:x1], twig * (0.85 + 0.3 * i / len(pts)), cv)
            a_[y0:y1, x0:x1] = np.maximum(a_[y0:y1, x0:x1], cv)

    # Leaves: alternate along each stem (main stem only above its lower third) + one at each tip.
    leaves = []
    for si, (pts, _, _) in enumerate(stems):
        seglen = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
        start = seglen[-1] * (0.38 if si == 0 else 0.12)
        k = 0
        for dist in np.arange(start, seglen[-1], spacing * s * rng.uniform(0.85, 1.15)):
            i = min(int(np.searchsorted(seglen, dist)), len(pts) - 2)
            tang = pts[i + 1] - pts[i]
            side = 1 if k % 2 else -1
            k += 1
            leaves.append((pts[i], np.arctan2(tang[1], tang[0]) + side * rng.uniform(0.45, 1.0), dist / seglen[-1]))
        tang = pts[-1] - pts[-2]
        leaves.append((pts[-1], np.arctan2(tang[1], tang[0]) + rng.normal(0, 0.15), 1.0))

    drawn = []
    for pos, theta, along in leaves:
        L = leaf_len * s * rng.uniform(0.8, 1.15) * (1.1 - 0.25 * along)
        W = L * aspect * rng.uniform(0.85, 1.15)
        bend = rng.uniform(-0.12, 0.12)
        d = np.array([np.cos(theta), np.sin(theta)])
        # Shrink leaves that would poke out of the card (keeps the atlas cells separate).
        for _ in range(6):
            tip = pos + d * L
            pad = W * 0.55 + abs(bend) * L
            lo_b, hi_b = np.minimum(pos, tip) - pad, np.maximum(pos, tip) + pad
            if lo_b.min() >= margin and hi_b.max() <= s - margin:
                break
            L *= 0.8
            W *= 0.8
        else:
            continue
        drawn.append((pos, theta, L, W, bend, rng.random()))
    drawn.sort(key=lambda lf: lf[5])

    for pos, theta, L, W, bend, depth in drawn:
        c, sn = np.cos(theta), np.sin(theta)
        pad = W + abs(bend) * L
        x0 = int(max(min(pos[0], pos[0] + c * L) - pad, 0))
        x1 = int(min(max(pos[0], pos[0] + c * L) + pad + 6, s))
        y0 = int(max(min(pos[1], pos[1] + sn * L) - pad, 0))
        y1 = int(min(max(pos[1], pos[1] + sn * L) + pad + 6, s))
        px = xx[y0:y1, x0:x1] - pos[0]
        py = yy[y0:y1, x0:x1] - pos[1]
        along = px * c + py * sn
        perp = -px * sn + py * c
        t = along / L
        perp_b = perp - bend * L * np.clip(t, 0, 1) ** 2
        hw = _leaf_halfwidth(t, kind) * W * 0.5
        cov = np.clip(hw - np.abs(perp_b) + 0.5, 0, 1) * ((t >= 0) & (t <= 1))
        if not cov.any():
            continue
        # Soft drop shadow (down-right) onto whatever is already drawn underneath.
        qx, qy = px - 3.0, py - 4.0
        sh_t = (qx * c + qy * sn) / L
        sh_p = (-qx * sn + qy * c) - bend * L * np.clip(sh_t, 0, 1) ** 2
        shadow = np.clip((_leaf_halfwidth(sh_t, kind) * W * 0.5 - np.abs(sh_p) + 2.0) / 4.0, 0, 1)
        shadow *= (sh_t >= -0.05) & (sh_t <= 1.05)
        sub = rgb_[y0:y1, x0:x1]
        sa = a_[y0:y1, x0:x1]
        sub *= (1 - 0.38 * shadow * sa)[..., None]

        rel = (pos + d * L * 0.5 - centre) / (s * 0.42)
        sun = float(np.clip(np.dot(rel, light), -1, 1))
        tone = 0.3 + 0.42 * depth + 0.15 * sun + tone_bias + rng.normal(0, 0.045)
        shade = tone + np.where(perp_b > 0, 0.05, -0.04) + 0.08 * (t - 0.5)
        leaf = ramp(shade, [(0.0, (20, 40, 22)), (0.25, (36, 70, 30)), (0.5, (60, 104, 38)), (0.72, (100, 140, 50)),
                            (0.88, (146, 170, 66)), (1.05, (204, 202, 108))])
        leaf = mix(leaf, leaf * rgb(236, 250, 222), 0.5 * rng.random())   # some leaves a touch cooler
        rib = np.clip(0.9 - np.abs(perp_b), 0, 1) * (t < 0.9) * 0.3
        leaf = mix(leaf, rgb(196, 204, 140), rib)
        sub[:] = mix(sub, leaf, cov)
        sa[:] = sa + (1 - sa) * cov
    return rgb_, a_


def dilate_colour(col, alpha):
    """Bleed opaque colours into transparent texels so mipmaps don't fringe."""
    out = col.copy()
    filled = alpha.copy()
    for sigma in (1.5, 4, 10, 28, 80):
        w = blur(alpha, sigma)
        c = blur(col * alpha[..., None], sigma) / np.maximum(w, 1e-6)[..., None]
        need = np.clip(1 - filled, 0, 1) * (w > 1e-4)
        out = mix(out, c, need)
        filled = np.maximum(filled, (w > 1e-4).astype(np.float64))
    return out


def leaves(rng):
    n = 1024                               # supersampled 2x
    q = n // 2
    specs = [  # kind, leaf length, aspect, spacing along stems, side branches, tone bias
        ('oval', 0.19, 0.46, 0.06, 7, 0.00),     # broadleaf (oak / beech)
        ('lance', 0.24, 0.24, 0.034, 7, 0.02),   # long slender leaves (willow / olive)
        ('round', 0.11, 0.66, 0.036, 9, -0.05),  # small dense round leaves (birch / box)
        ('heart', 0.22, 0.72, 0.09, 6, 0.07),    # big heart-shaped leaves, warmer (linden)
    ]
    col = np.zeros((n, n, 3))
    alpha = np.zeros((n, n))
    for i, (kind, ln, aspect, spacing, branches, bias) in enumerate(specs):
        c, a = _leaf_cluster(rng, q, kind, ln, aspect, spacing, branches, bias)
        oy, ox = (i // 2) * q, (i % 2) * q
        col[oy:oy + q, ox:ox + q] = c
        alpha[oy:oy + q, ox:ox + q] = a
    col = dilate_colour(col, alpha)
    out = np.concatenate([down(col, 2), down(alpha, 2)[..., None]], -1)
    return np.clip(out, 0, 1)


# ─── effects ──────────────────────────────────────────────────────────────────────────

def water_height(rng):
    """Two wind-sea spectra (swell peaked near 5 cycles/tile, chop near 14), each Pierson-Moskowitz
    shaped with cos² directional spreading, so crests are elongated across the wind."""
    n = 512
    fx, fy = _freqs(n)
    k = np.hypot(fx, fy)
    k[0, 0] = 1
    h = np.zeros((n, n))
    for kp, wind, weight in ((5.0, 0.5, 1.0), (14.0, 1.1, 0.3)):
        cosang = (fx * np.cos(wind) + fy * np.sin(wind)) / k
        amp = k ** -2.5 * np.exp(-1.25 * (kp / k) ** 2) * cosang ** 2 * np.exp(-(k / (kp * 2.5)) ** 2)
        amp[0, 0] = 0
        layer = np.fft.irfft2(np.fft.rfft2(rng.standard_normal((n, n))) * amp, s=(n, n))
        h += weight * layer / layer.std()
    h /= h.std()
    # Sharpen crests a touch (trochoid-like), keep troughs broad.
    return h + 0.15 * (h * h - 1)


def noise_tex(rng):
    return norm01(fbm(256, rng, 1, None, 1.0))


def clouds(rng):
    """Billowy cumulus (sum of |band-limited noise| octaves) gathered into drifting banks,
    with a few stretched wisps; soft 0..1 density, roughly 40 % clear sky."""
    n = 512
    y, x = grid(n)
    wx = fbm(n, rng, 1, 6, 1.3) * 14
    wy = fbm(n, rng, 1, 6, 1.3) * 9
    billow = np.zeros((n, n))
    for o in range(6):
        f0 = 2.0 * 2 ** o
        billow += 0.55 ** o * np.abs(fbm(n, rng, f0, f0 * 2.2, 1.0, stretch=(1.5, 1)))
    billow = sample((billow - billow.mean()) / billow.std(), y + wy, x + wx)
    banks = fbm(n, rng, 2, 7, 1.0, stretch=(1.4, 1))
    wisps = np.abs(fbm(n, rng, 6, 40, 1.0, stretch=(2.5, 1)))
    d = 0.6 * banks - 0.7 * billow + 0.12 * (1 - wisps) - 0.02
    c = smoothstep(-0.3, 1.4, d)
    return np.clip(c / c.max(), 0, 1) ** 1.1


def glow():
    n = 128
    y, x = grid(n)
    r = np.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2)
    k = 5.0
    a = np.clip((np.exp(-k * r * r) - np.exp(-k)) / (1 - np.exp(-k)), 0, 1)
    a = 0.8 * a + 0.2 * np.clip(1 - r, 0, 1) ** 3
    out = np.ones((n, n, 4))
    out[..., 3] = a
    return out


# ─── driver ───────────────────────────────────────────────────────────────────────────

def build(name, out_dir):
    rng = rng_for(name)
    terrain = {'grass': (grass, 7.0), 'sand': (sand, 5.0), 'dirt': (dirt, 1.0), 'rock': (rock, 0.85)}
    props = {'planks': (planks, 1.0), 'stone': (stone, 1.0), 'bark': (bark, 1.0), 'roof': (roof, 1.0)}
    if name in terrain:
        fn, strength = terrain[name]
        col, h = fn(rng)
        save(out_dir, f'{name}_albedo', np.clip(flatten_macro(col, 96, 0.45), 0, 1))
        save(out_dir, f'{name}_normal', normal_map(h, strength, 512), NORMAL_Q)
    elif name in props:
        fn, strength = props[name]
        col, h = fn(rng)
        save(out_dir, f'{name}_albedo', down(col, 2))
        save(out_dir, f'{name}_normal', normal_map(h, strength, 512), NORMAL_Q)
    elif name == 'plaster':
        save(out_dir, 'plaster_albedo', plaster(rng))
    elif name == 'cloth':
        save(out_dir, 'cloth_albedo', cloth(rng))
    elif name == 'leaves':
        save(out_dir, 'leaves_albedo', leaves(rng), 90)
    # Smooth data textures go lossless: lossy blocks and edge errors show up as faint grids/seams
    # once shaders scroll, sharpen or threshold them.
    elif name == 'water':
        save(out_dir, 'water_normal', normal_map(water_height(rng), 1.7, 512), lossless=True)
    elif name == 'noise':
        save(out_dir, 'noise', noise_tex(rng), lossless=True)
    elif name == 'clouds':
        save(out_dir, 'clouds', clouds(rng), lossless=True)
    elif name == 'glow':
        save(out_dir, 'glow', glow(), lossless=True)


GROUPS = ['grass', 'sand', 'dirt', 'rock', 'planks', 'stone', 'bark', 'roof', 'plaster', 'cloth', 'leaves',
          'water', 'noise', 'clouds', 'glow']


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT)
    ap.add_argument('--only', default='', help='comma-separated groups: ' + ','.join(GROUPS))
    args = ap.parse_args()
    groups = [g for g in args.only.split(',') if g] or GROUPS
    unknown = sorted(set(groups) - set(GROUPS))
    if unknown:
        ap.error(f'unknown group(s): {", ".join(unknown)}')
    args.out.mkdir(parents=True, exist_ok=True)
    t_all = time.time()
    for g in groups:
        t0 = time.time()
        build(g, args.out)
        print(f'{g:8s} {time.time() - t0:5.1f}s')
    total = sum(f.stat().st_size for f in args.out.glob('*.webp'))
    print(f'done in {time.time() - t_all:.1f}s, folder {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
