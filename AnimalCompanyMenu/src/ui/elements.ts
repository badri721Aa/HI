/**
 * elements.ts — the three primitives every widget is made of:
 *   Rect  (empty RectTransform container)
 *   Image (UnityEngine.UI.Image with one of our sprites)
 *   Text  (TextMeshProUGUI when available, UnityEngine.UI.Text otherwise)
 *
 * Every setter caches the last value so unchanged properties never cross the
 * IL2CPP boundary.
 */
import { colorEq, type RGBA } from "../core/math.js";
import { log } from "../core/log.js";
import {
    UE, addComponent, getComponent, newGameObject, transformOf, color as ucolor, str, vec4, builtinFont, isNull,
    rtSetLocalEuler, rtSetAnchors, rtSetPivot, rtSetAnchoredPosition, rtSetSizeDelta, setActive, type Obj,
} from "../core/unity.js";

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface RectEl { go: Obj; rt: Obj }
export interface ImageEl extends RectEl {
    img: Obj;
    _color?: RGBA;
    _sprite?: Obj | null;
    _angle?: number;
}
export interface TextEl extends RectEl {
    txt: Obj;
    kind: "tmp" | "legacy";
    _text?: string;
    _color?: RGBA;
    _size?: number;
    _bold?: boolean;
    _align?: string;
    _wrap?: boolean;
}

export const textBackend: { kind: "tmp" | "legacy" | "unknown"; font: Obj | null } = { kind: "unknown", font: null };

/** Decides TMP vs legacy text. Call once on the main thread before creating UI. */
export function initTextBackend(preferTmp = true): void {
    if (textBackend.kind !== "unknown") return;
    if (preferTmp) {
        try {
            const tmpClass = UE.TextMeshProUGUI;
            const settings = UE.TMP_Settings;
            if (tmpClass && settings) {
                const fa = settings.method<Obj>("get_defaultFontAsset").invoke();
                if (!isNull(fa)) {
                    textBackend.kind = "tmp";
                    log.ok("text: TextMeshPro backend");
                    return;
                }
                log.warn("text: TMP present but no default font asset, using legacy Text");
            }
        } catch (e) {
            log.warn(`text: TMP probe failed (${String(e)}), using legacy Text`);
        }
    }
    textBackend.kind = "legacy";
    textBackend.font = builtinFont();
    if (!textBackend.font) log.warn("text: no builtin font found — text may be invisible");
    else log.ok("text: legacy UnityEngine.UI.Text backend");
}

export function createRect(parent: Obj, name: string): RectEl {
    const go = newGameObject(name, parent);
    const rt = addComponent(go, UE.RectTransform);
    return { go, rt };
}

export function createImage(parent: Obj, name: string, sprite: Obj | null, c: RGBA, sliced = true): ImageEl {
    const go = newGameObject(name, parent);
    const img = addComponent(go, UE.Image);
    const rt = getComponent(go, UE.RectTransform)!;
    img.method("set_raycastTarget").invoke(false);
    const el: ImageEl = { go, rt, img };
    imageSetSprite(el, sprite, sliced);
    imageSetColor(el, c);
    return el;
}

export function imageSetSprite(el: ImageEl, sprite: Obj | null, sliced = true): void {
    if (el._sprite === sprite) return;
    el._sprite = sprite;
    el.img.method("set_sprite").invoke(sprite ?? new Il2Cpp.Object(NULL));
    el.img.method("set_type").invoke(sliced && sprite ? 1 /* Sliced */ : 0 /* Simple */);
}

export function imageSetColor(el: ImageEl, c: RGBA): void {
    if (el._color && colorEq(el._color, c)) return;
    el._color = { ...c };
    el.img.method("set_color").invoke(ucolor(c));
}

export function imageSetRotation(el: ImageEl, zDeg: number): void {
    if (el._angle === zDeg) return;
    el._angle = zDeg;
    rtSetLocalEuler(el.rt, 0, 0, zDeg);
}

// ── text ───────────────────────────────────────────────────────────────────
const TMP_ALIGN: Record<string, number> = {
    "left:top": 257, "center:top": 258, "right:top": 260,
    "left:middle": 513, "center:middle": 514, "right:middle": 516,
    "left:bottom": 1025, "center:bottom": 1026, "right:bottom": 1028,
};
const LEGACY_ALIGN: Record<string, number> = {
    "left:top": 0, "center:top": 1, "right:top": 2,
    "left:middle": 3, "center:middle": 4, "right:middle": 5,
    "left:bottom": 6, "center:bottom": 7, "right:bottom": 8,
};

export function createText(parent: Obj, name: string, text: string, size: number, c: RGBA, h: HAlign = "left", v: VAlign = "middle", bold = false): TextEl {
    if (textBackend.kind === "unknown") initTextBackend();
    const go = newGameObject(name, parent);
    let txt: Obj;
    let kind: "tmp" | "legacy";
    if (textBackend.kind === "tmp" && UE.TextMeshProUGUI) {
        txt = addComponent(go, UE.TextMeshProUGUI);
        kind = "tmp";
        txt.method("set_raycastTarget").invoke(false);
        txt.method("set_richText").invoke(true);
        txt.tryMethod("set_enableAutoSizing")?.invoke(false);
        txt.tryMethod("set_margin")?.invoke(vec4(0, 0, 0, 0));
    } else {
        txt = addComponent(go, UE.Text);
        kind = "legacy";
        txt.method("set_raycastTarget").invoke(false);
        txt.method("set_supportRichText").invoke(true);
        if (textBackend.font) txt.method("set_font").invoke(textBackend.font);
    }
    const rt = getComponent(go, UE.RectTransform)!;
    const el: TextEl = { go, rt, txt, kind };
    textSetWrap(el, false);
    textSetSize(el, size);
    textSetColor(el, c);
    textSetAlign(el, h, v);
    textSetBold(el, bold);
    textSet(el, text);
    return el;
}

export function textSet(el: TextEl, s: string): void {
    if (el._text === s) return;
    el._text = s;
    el.txt.method("set_text").invoke(str(s));
}
export function textSetColor(el: TextEl, c: RGBA): void {
    if (el._color && colorEq(el._color, c)) return;
    el._color = { ...c };
    el.txt.method("set_color").invoke(ucolor(c));
}
export function textSetSize(el: TextEl, size: number): void {
    if (el._size === size) return;
    el._size = size;
    if (el.kind === "tmp") el.txt.method("set_fontSize").invoke(size);
    else el.txt.method("set_fontSize").invoke(Math.round(size));
}
export function textSetBold(el: TextEl, bold: boolean): void {
    if (el._bold === bold) return;
    el._bold = bold;
    el.txt.method("set_fontStyle").invoke(bold ? 1 : 0);
}
export function textSetAlign(el: TextEl, h: HAlign, v: VAlign): void {
    const key = `${h}:${v}`;
    if (el._align === key) return;
    el._align = key;
    el.txt.method("set_alignment").invoke(el.kind === "tmp" ? TMP_ALIGN[key] : LEGACY_ALIGN[key]);
}
export function textSetWrap(el: TextEl, wrap: boolean): void {
    if (el._wrap === wrap) return;
    el._wrap = wrap;
    if (el.kind === "tmp") {
        const m = el.txt.tryMethod("set_textWrappingMode") ?? null;
        if (m) m.invoke(wrap ? 1 /* Normal */ : 0 /* NoWrap */);
        else el.txt.tryMethod("set_enableWordWrapping")?.invoke(wrap);
        el.txt.tryMethod("set_overflowMode")?.invoke(wrap ? 0 /* Overflow */ : 1 /* Ellipsis */);
    } else {
        el.txt.method("set_horizontalOverflow").invoke(wrap ? 0 : 1);
        el.txt.method("set_verticalOverflow").invoke(1);
    }
}
/** Height the text needs at its current width (call after sizing the rect). */
export function textPreferredHeight(el: TextEl): number {
    try { return el.txt.method<number>("get_preferredHeight").invoke(); } catch { return 0; }
}

// ── canvas group (alpha for whole subtrees) ────────────────────────────────
export interface GroupEl { cg: Obj; _alpha?: number }
export function addCanvasGroup(go: Obj): GroupEl {
    const cg = addComponent(go, UE.CanvasGroup);
    cg.method("set_blocksRaycasts").invoke(false);
    cg.method("set_interactable").invoke(false);
    return { cg };
}
export function groupSetAlpha(g: GroupEl, a: number): void {
    const v = Math.round(a * 100) / 100;
    if (g._alpha === v) return;
    g._alpha = v;
    g.cg.method("set_alpha").invoke(v);
}

/** Adds a RectMask2D so children are clipped to this rect. */
export function addMask(go: Obj): void {
    addComponent(go, UE.RectMask2D);
}

export const parentTransform = (el: RectEl): Obj => transformOf(el.go);

// ── placement with caching (anchors set once, position/size only when changed) ──
export interface Placed { _px?: number; _py?: number; _pw?: number; _ph?: number; _center?: boolean }
export function initTopLeft(el: RectEl & Placed, center = false): void {
    if (center) { rtSetAnchors(el.rt, 0, 1, 0, 1); rtSetPivot(el.rt, 0.5, 0.5); }
    else { rtSetAnchors(el.rt, 0, 1, 0, 1); rtSetPivot(el.rt, 0, 1); }
    el._center = center;
    el._px = el._py = el._pw = el._ph = undefined;
}
export function place(el: RectEl & Placed, x: number, y: number, w: number, h: number): void {
    x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; w = Math.round(w * 2) / 2; h = Math.round(h * 2) / 2;
    if (el._center) {
        const cx = x + w / 2, cy = y + h / 2;
        if (el._px !== cx || el._py !== cy) { rtSetAnchoredPosition(el.rt, cx, -cy); el._px = cx; el._py = cy; }
    } else if (el._px !== x || el._py !== y) {
        rtSetAnchoredPosition(el.rt, x, -y); el._px = x; el._py = y;
    }
    if (el._pw !== w || el._ph !== h) { rtSetSizeDelta(el.rt, w, h); el._pw = w; el._ph = h; }
}
export function setVisible(el: RectEl & { _vis?: boolean }, v: boolean): void {
    if (el._vis === v) return;
    el._vis = v;
    setActive(el.go, v);
}
