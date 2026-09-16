/**
 * sprites.ts — procedural, anti-aliased sprites (rounded rects, rings, circles,
 * soft shadows, gradients, check marks). No asset files needed: pixels are
 * rasterised in JS and uploaded with Texture2D.LoadRawTextureData.
 */
import { log } from "../core/log.js";
import { UE, findMethod, rect, vec2, vec4, setHideFlags, HIDE_AND_DONT_SAVE, type Obj } from "../core/unity.js";

type Painter = (x: number, y: number, w: number, h: number) => number; // returns alpha 0..1

const cache = new Map<string, Obj>();

function upload(w: number, h: number, paint: Painter, border: [number, number, number, number]): Obj {
    const bytes = new Uint8Array(w * h * 4);
    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            const a = Math.max(0, Math.min(1, paint(px + 0.5, py + 0.5, w, h)));
            // Unity raw data is bottom-to-top
            const i = ((h - 1 - py) * w + px) * 4;
            bytes[i] = 255; bytes[i + 1] = 255; bytes[i + 2] = 255; bytes[i + 3] = Math.round(a * 255);
        }
    }
    const tex = UE.Texture2D.alloc();
    const ctor = findMethod(UE.Texture2D, ".ctor", ["System.Int32", "System.Int32", "UnityEngine.TextureFormat", "System.Boolean"]);
    if (!ctor) throw new Error("Texture2D ctor not found");
    ctor.bind(tex).invoke(w, h, 4 /* RGBA32 */, false);
    tex.method("set_filterMode").invoke(1 /* Bilinear */);
    tex.method("set_wrapMode").invoke(1 /* Clamp */);
    const mem = Memory.alloc(bytes.length);
    mem.writeByteArray(Array.from(bytes));
    const load = findMethod(UE.Texture2D, "LoadRawTextureData", ["System.IntPtr", "System.Int32"]);
    if (!load) throw new Error("LoadRawTextureData(IntPtr,int) not found");
    load.bind(tex).invoke(mem, bytes.length);
    tex.method("Apply", 0).invoke();
    setHideFlags(tex, HIDE_AND_DONT_SAVE);

    const create = findMethod(UE.Sprite, "Create", [
        "UnityEngine.Texture2D", "UnityEngine.Rect", "UnityEngine.Vector2", "System.Single",
        "System.UInt32", "UnityEngine.SpriteMeshType", "UnityEngine.Vector4",
    ]);
    if (!create) throw new Error("Sprite.Create overload not found");
    const sprite = create.invoke(tex, rect(0, 0, w, h), vec2(0.5, 0.5), 100, 0, 1 /* FullRect */, vec4(border[0], border[1], border[2], border[3])) as Obj;
    setHideFlags(sprite, HIDE_AND_DONT_SAVE);
    return sprite;
}

function cached(key: string, make: () => Obj): Obj {
    let s = cache.get(key);
    if (!s) {
        s = make();
        cache.set(key, s);
    }
    return s;
}

/** signed distance to a rounded box centred in (w,h) with radius r and inset `inset` */
function sdRoundBox(x: number, y: number, w: number, h: number, r: number, inset = 0): number {
    const hx = w / 2 - inset, hy = h / 2 - inset;
    const px = Math.abs(x - w / 2) - (hx - r), py = Math.abs(y - h / 2) - (hy - r);
    const ox = Math.max(px, 0), oy = Math.max(py, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(px, py), 0) - r;
}

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
    const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy)));
    const dx = ax + vx * t - x, dy = ay + vy * t - y;
    return Math.sqrt(dx * dx + dy * dy);
}

export const Sprites = {
    /** 9-sliced rounded rectangle fill */
    rounded(radius: number): Obj {
        const r = Math.max(1, Math.round(radius));
        return cached(`rounded:${r}`, () => {
            const s = r * 2 + 3;
            return upload(s, s, (x, y, w, h) => 0.5 - sdRoundBox(x, y, w, h, r), [r + 1, r + 1, r + 1, r + 1]);
        });
    },
    /** 9-sliced rounded outline */
    ring(radius: number, thickness = 1): Obj {
        const r = Math.max(1, Math.round(radius)), t = Math.max(1, thickness);
        return cached(`ring:${r}:${t}`, () => {
            const s = r * 2 + 3;
            return upload(s, s, (x, y, w, h) => {
                const d = sdRoundBox(x, y, w, h, r);
                const outer = Math.max(0, Math.min(1, 0.5 - d));
                const inner = Math.max(0, Math.min(1, 0.5 - (d + t)));
                return outer - inner;
            }, [r + 1, r + 1, r + 1, r + 1]);
        });
    },
    /** 9-sliced soft drop shadow / glow */
    shadow(radius: number, blur: number): Obj {
        const r = Math.max(1, Math.round(radius)), b = Math.max(1, Math.round(blur));
        return cached(`shadow:${r}:${b}`, () => {
            const s = (r + b) * 2 + 3;
            return upload(s, s, (x, y, w, h) => {
                const d = sdRoundBox(x, y, w, h, r, b);
                const a = 1 - Math.max(0, Math.min(1, (d + b * 0.15) / b));
                return a * a;
            }, [r + b + 1, r + b + 1, r + b + 1, r + b + 1]);
        });
    },
    circle(diameter = 32): Obj {
        const d = Math.max(4, Math.round(diameter));
        return cached(`circle:${d}`, () => upload(d, d, (x, y, w, h) => {
            const dx = x - w / 2, dy = y - h / 2;
            return 0.5 - (Math.sqrt(dx * dx + dy * dy) - (w / 2 - 0.5));
        }, [0, 0, 0, 0]));
    },
    /** radial glow (for knobs / status dots) */
    glow(diameter = 48): Obj {
        const d = Math.max(8, Math.round(diameter));
        return cached(`glow:${d}`, () => upload(d, d, (x, y, w, h) => {
            const dx = x - w / 2, dy = y - h / 2;
            const t = Math.sqrt(dx * dx + dy * dy) / (w / 2);
            const a = 1 - Math.min(1, t);
            return a * a * a;
        }, [0, 0, 0, 0]));
    },
    /** alpha 1 → 0 from left to right */
    gradientH(): Obj {
        return cached("gradH", () => upload(64, 2, (x, _y, w) => 1 - x / w, [0, 0, 0, 0]));
    },
    /** alpha 1 (top) → 0 (bottom) */
    gradientV(): Obj {
        return cached("gradV", () => upload(2, 64, (_x, y, _w, h) => 1 - y / h, [0, 0, 0, 0]));
    },
    /** fade in and out horizontally (separators) */
    fadeLine(): Obj {
        return cached("fadeLine", () => upload(96, 2, (x, _y, w) => 1 - Math.abs(x / w - 0.5) * 2, [0, 0, 0, 0]));
    },
    check(size = 28): Obj {
        const s = Math.max(12, Math.round(size));
        return cached(`check:${s}`, () => upload(s, s, (x, y, w, h) => {
            const t = w * 0.11;
            const d = Math.min(
                segDist(x, y, w * 0.22, h * 0.52, w * 0.42, h * 0.72),
                segDist(x, y, w * 0.42, h * 0.72, w * 0.80, h * 0.30),
            );
            return 0.5 - (d - t);
        }, [0, 0, 0, 0]));
    },
    /** chevron pointing right (rotate the RectTransform for other directions) */
    chevron(size = 24): Obj {
        const s = Math.max(12, Math.round(size));
        return cached(`chevron:${s}`, () => upload(s, s, (x, y, w, h) => {
            const t = w * 0.08;
            const d = Math.min(
                segDist(x, y, w * 0.36, h * 0.24, w * 0.64, h * 0.50),
                segDist(x, y, w * 0.64, h * 0.50, w * 0.36, h * 0.76),
            );
            return 0.5 - (d - t);
        }, [0, 0, 0, 0]));
    },
    /** "x" close glyph */
    cross(size = 24): Obj {
        const s = Math.max(12, Math.round(size));
        return cached(`cross:${s}`, () => upload(s, s, (x, y, w, h) => {
            const t = w * 0.07;
            const d = Math.min(
                segDist(x, y, w * 0.30, h * 0.30, w * 0.70, h * 0.70),
                segDist(x, y, w * 0.70, h * 0.30, w * 0.30, h * 0.70),
            );
            return 0.5 - (d - t);
        }, [0, 0, 0, 0]));
    },
    /** plain white square */
    white(): Obj {
        return cached("white", () => upload(4, 4, () => 1, [0, 0, 0, 0]));
    },
    /** Pre-builds the sprites the menu uses so the first open does not hitch. */
    warmup(radii: number[]): void {
        try {
            this.white(); this.gradientH(); this.gradientV(); this.fadeLine(); this.check(); this.chevron(); this.cross();
            this.circle(); this.glow();
            for (const r of radii) { this.rounded(r); this.ring(r, 1); }
            this.shadow(radii[0] ?? 16, 22);
            log.info(`sprites: ${cache.size} procedural sprites ready`);
        } catch (e) { log.error("sprites: warmup failed", e); }
    },
};
