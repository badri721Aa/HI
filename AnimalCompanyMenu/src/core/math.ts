/**
 * math.ts — plain-JS vector / quaternion math. All pointer projection, hand
 * following and animation math happens here so we only touch the Il2Cpp side
 * to read or write final transforms.
 */
export interface V3 { x: number; y: number; z: number }
export interface V2 { x: number; y: number }
export interface Q { x: number; y: number; z: number; w: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const V3_ZERO: V3 = { x: 0, y: 0, z: 0 };
export const V3_UP: V3 = { x: 0, y: 1, z: 0 };
export const V3_FWD: V3 = { x: 0, y: 0, z: 1 };
export const V3_RIGHT: V3 = { x: 1, y: 0, z: 0 };
export const Q_IDENTITY: Q = { x: 0, y: 0, z: 0, w: 1 };

export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});
export const length = (a: V3): number => Math.sqrt(dot(a, a));
export const distance = (a: V3, b: V3): number => length(sub(a, b));
export function normalize(a: V3): V3 {
    const l = length(a);
    return l > 1e-8 ? mul(a, 1 / l) : { x: 0, y: 0, z: 0 };
}
export const lerpV3 = (a: V3, b: V3, t: number): V3 => ({
    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
});
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const rad = (deg: number): number => deg * Math.PI / 180;
export const deg = (r: number): number => r * 180 / Math.PI;

/** Frame-rate independent exponential smoothing factor. `speed` ≈ 1/seconds to converge. */
export const damp = (speed: number, dt: number): number => 1 - Math.exp(-speed * dt);

// ── quaternions (Unity convention: left-handed, y-up, z-forward) ───────────
export const qmul = (a: Q, b: Q): Q => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export const qinv = (q: Q): Q => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function qnormalize(q: Q): Q {
    const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    return l > 1e-8 ? { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l } : { ...Q_IDENTITY };
}
/** Rotates vector v by quaternion q. */
export function qrot(q: Q, v: V3): V3 {
    const u = { x: q.x, y: q.y, z: q.z };
    const t = mul(cross(u, v), 2);
    return add(add(v, mul(t, q.w)), cross(u, t));
}
export function qaxisAngle(axis: V3, degrees: number): Q {
    const a = normalize(axis);
    const h = rad(degrees) / 2;
    const s = Math.sin(h);
    return { x: a.x * s, y: a.y * s, z: a.z * s, w: Math.cos(h) };
}
/** Same order as UnityEngine.Quaternion.Euler (Z, then X, then Y). */
export function qeuler(xDeg: number, yDeg: number, zDeg: number): Q {
    const qx = qaxisAngle(V3_RIGHT, xDeg);
    const qy = qaxisAngle(V3_UP, yDeg);
    const qz = qaxisAngle(V3_FWD, zDeg);
    return qmul(qmul(qy, qx), qz);
}
/** Quaternion whose forward is `forward` and whose up is as close as possible to `up`. */
export function qlook(forward: V3, up: V3 = V3_UP): Q {
    const z = normalize(forward);
    if (length(z) < 1e-6) return { ...Q_IDENTITY };
    let x = cross(up, z);
    if (length(x) < 1e-6) x = cross({ x: 0, y: 0, z: 1 }, z); // forward ∥ up, pick any
    x = normalize(x);
    const y = cross(z, x);
    // rotation matrix columns: x (right), y (up), z (forward)
    const m00 = x.x, m01 = y.x, m02 = z.x;
    const m10 = x.y, m11 = y.y, m12 = z.y;
    const m20 = x.z, m21 = y.z, m22 = z.z;
    const tr = m00 + m11 + m22;
    let q: Q;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
    }
    return qnormalize(q);
}
/** Normalized lerp – good enough for per-frame smoothing. */
export function qnlerp(a: Q, b: Q, t: number): Q {
    let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bb = b;
    if (d < 0) { bb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }; d = -d; }
    return qnormalize({
        x: a.x + (bb.x - a.x) * t, y: a.y + (bb.y - a.y) * t,
        z: a.z + (bb.z - a.z) * t, w: a.w + (bb.w - a.w) * t,
    });
}
export const qforward = (q: Q): V3 => qrot(q, V3_FWD);
export const qup = (q: Q): V3 => qrot(q, V3_UP);
export const qright = (q: Q): V3 => qrot(q, V3_RIGHT);

// ── easing ────────────────────────────────────────────────────────────────
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export function easeOutBack(t: number): number {
    const c1 = 1.70158, c3 = c1 + 1;
    t = clamp01(t);
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export const easeInOut = (t: number): number => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

// ── colors (r,g,b,a in 0..1) ──────────────────────────────────────────────
export interface RGBA { r: number; g: number; b: number; a: number }
export const rgba = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a });
export function hex(h: string, a = 1): RGBA {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    const alpha = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : a;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: alpha };
}
export function toHex(c: RGBA): string {
    const h = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
export const lerpColor = (a: RGBA, b: RGBA, t: number): RGBA => ({
    r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t), a: lerp(a.a, b.a, t),
});
export const withAlpha = (c: RGBA, a: number): RGBA => ({ r: c.r, g: c.g, b: c.b, a });
export const colorEq = (a: RGBA, b: RGBA): boolean =>
    Math.abs(a.r - b.r) < 1e-3 && Math.abs(a.g - b.g) < 1e-3 && Math.abs(a.b - b.b) < 1e-3 && Math.abs(a.a - b.a) < 1e-3;
export function hsv(h: number, s: number, v: number, a = 1): RGBA {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: return { r: v, g: t, b: p, a };
        case 1: return { r: q, g: v, b: p, a };
        case 2: return { r: p, g: v, b: t, a };
        case 3: return { r: p, g: q, b: v, a };
        case 4: return { r: t, g: p, b: v, a };
        default: return { r: v, g: p, b: q, a };
    }
}
export function toHsv(c: RGBA): { h: number; s: number; v: number } {
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    const d = max - min;
    let h = 0;
    if (d > 1e-6) {
        if (max === c.r) h = ((c.g - c.b) / d) % 6;
        else if (max === c.g) h = (c.b - c.r) / d + 2;
        else h = (c.r - c.g) / d + 4;
        h /= 6; if (h < 0) h += 1;
    }
    return { h, s: max > 1e-6 ? d / max : 0, v: max };
}
/** Stable 32-bit string hash (FNV-1a). Used for widget IDs. */
export function hashStr(s: string, seed = 0x811c9dc5): number {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
export const hashCombine = (a: number, b: number): number => (Math.imul(a ^ (b + 0x9e3779b9 + (a << 6) + (a >>> 2)), 0x01000193) >>> 0);
