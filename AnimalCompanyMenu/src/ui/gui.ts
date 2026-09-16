/**
 * gui.ts — the ImGui-style immediate-mode layer.
 *
 *   ui.beginLayer(...)
 *   if (ui.button("Do it")) { ... }
 *   state.on = ui.toggle("Enabled", state.on);
 *   state.speed = ui.slider("Speed", state.speed, 0, 10);
 *   ui.endLayer();
 *
 * Widgets are re-declared every frame (like Dear ImGui) but backed by pooled
 * Unity UI objects keyed by a stable ID, so nothing is re-created per frame and
 * only changed properties cross into IL2CPP.
 */
import { theme } from "./theme.js";
import { Sprites } from "./sprites.js";
import {
    createRect, createImage, createText, initTopLeft, place, setVisible,
    imageSetColor, imageSetRotation, imageSetSprite, textSet, textSetColor, textSetSize, textSetBold, textSetAlign, textSetWrap,
    textPreferredHeight, type ImageEl, type TextEl, type RectEl, type Placed, type HAlign, type VAlign,
} from "./elements.js";
import {
    type RGBA, lerpColor, withAlpha, clamp, clamp01, lerp, damp, hashStr, hashCombine, hsv, toHsv, toHex, colorEq, easeOutCubic,
} from "../core/math.js";
import { type Obj, transformOf, destroy, setActive, setParent, setAsFirstSibling, vec2 } from "../core/unity.js";
import { type Settings, type VRButton, ALL_BUTTONS, BUTTON_LABELS } from "../config.js";
import type { XRInput } from "../core/input.js";
import { log } from "../core/log.js";

// ── public types ───────────────────────────────────────────────────────────
export interface PointerState {
    valid: boolean;
    /** panel-space coordinates (canvas units, origin top-left, y down) */
    x: number; y: number;
    down: boolean; pressed: boolean; released: boolean;
    /** finger depth in meters (negative = in front of the panel) */
    depth: number;
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Interaction {
    hovered: boolean; pressed: boolean; held: boolean; released: boolean; clicked: boolean;
}
export interface GuiHost {
    settings: Settings;
    input: XRInput;
    haptic(kind: "hover" | "click"): void;
}
export interface ScrollState {
    scroll: number; velocity: number; contentH: number; viewH: number;
    dragging: boolean; pressed: boolean; pressY: number; scrollAtPress: number; lastY: number;
    _applied?: number;
}
export const newScroll = (): ScrollState => ({
    scroll: 0, velocity: 0, contentH: 0, viewH: 0, dragging: false, pressed: false, pressY: 0, scrollAtPress: 0, lastY: 0,
});
export interface KeyboardState {
    open: boolean; targetId: number; buffer: string; title: string; shift: boolean; symbols: boolean; changed: boolean; closedFrame: number;
}
export type ButtonVariant = "default" | "primary" | "danger" | "ghost" | "accent2";
export type ToastKind = "info" | "success" | "warning" | "error";

// ── internals ──────────────────────────────────────────────────────────────
type Part = (ImageEl | TextEl | RectEl) & Placed & { _vis?: boolean };

class Widget {
    parts: Record<string, Part> = {};
    lastFrame = -1;
    shown = true;
    /** true only during the frame the widget was created */
    created = true;
    hoverT = 0; pressT = 0; anim = 0;
    zoneHover = -1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: any = {};
    constructor(public id: number, public kind: string, public layerId: number, public root: RectEl & Placed) {}
}

interface ColumnState { n: number; gap: number; i: number; startY: number; maxY: number; colW: number; baseIndent: number; baseRight: number }
interface CardFrame { w: Widget; startY: number; indent: number; right: number; pad: number; hasTitle: boolean }

interface Layer {
    id: number; container: Obj; x0: number; y0: number; width: number; clip: Rect; scroll: ScrollState | null;
    indent: number; rightEdge: number; cursorX: number; cursorY: number; lineH: number; sameLine: boolean;
    nextW: number | null; maxY: number; cols: ColumnState | null; cards: CardFrame[];
    lastItem: Rect; lastId: number; idBase: number;
}

const lineHeight = (size: number): number => Math.round(size * 1.5);
const estWidth = (text: string, size: number): number => Math.round(text.length * size * 0.56);
const approach = (cur: number, target: number, k: number): number => Math.abs(target - cur) < 0.002 ? target : cur + (target - cur) * clamp01(k);
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

export class Gui {
    frame = 0;
    dt = 1 / 72;
    now = 0;
    ptr: PointerState = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
    /** When true, only layers drawn with `overlay = true` receive input (modal). */
    pointerBlocked = false;
    keyboard: KeyboardState = { open: false, targetId: 0, buffer: "", title: "", shift: false, symbols: false, changed: false, closedFrame: -1 };
    tooltipReq: { text: string; rect: Rect } | null = null;

    private widgets = new Map<number, Widget>();
    private layers: Layer[] = [];
    private L!: Layer;
    private overlayPass = false;
    private activeId = 0;
    private activeZone = 0;
    private activeCaptured = false;
    private hoveredId = 0;
    private hoverStart = 0;
    private hoverThisFrame = 0;
    private idStack: number[] = [];
    private openDropdown = 0;
    private capturing = 0;
    private dup = 0;

    constructor(private host: GuiHost) {}

    // ── frame ──────────────────────────────────────────────────────────────
    beginFrame(ptr: PointerState, dt: number, now: number): void {
        this.frame++;
        this.dt = dt;
        this.now = now;
        this.ptr = ptr;
        this.hoverThisFrame = 0;
        this.tooltipReq = null;
        this.dup = 0;
        this.layers.length = 0;
        if (this.keyboard.changed && this.keyboard.closedFrame >= 0 && this.frame - this.keyboard.closedFrame > 2) this.keyboard.changed = false;
    }

    endFrame(): void {
        for (const w of this.widgets.values()) {
            if (w.lastFrame !== this.frame && w.shown) { setActive(w.root.go, false); w.shown = false; }
        }
        if (!this.ptr.down) { this.activeId = 0; this.activeCaptured = false; }
        if (this.hoverThisFrame === 0) this.hoveredId = 0;
    }

    /** Destroys every pooled widget (page reload / unload). */
    reset(): void {
        for (const w of this.widgets.values()) destroy(w.root.go);
        this.widgets.clear();
    }

    // ── layers ─────────────────────────────────────────────────────────────
    /**
     * Starts drawing into `container` (a Transform). x0/y0 = container's top-left in
     * panel space, `clip` = visible rect in panel space, `scroll` = optional scroll state.
     */
    beginLayer(id: string, container: Obj, x0: number, y0: number, width: number, clip: Rect, scroll: ScrollState | null = null, overlay = false): void {
        const idBase = hashStr(id);
        let sy = 0;
        if (scroll) {
            this.updateScroll(scroll, clip);
            sy = scroll.scroll;
            if (scroll._applied !== Math.round(sy * 2) / 2) {
                scroll._applied = Math.round(sy * 2) / 2;
                container.method("set_anchoredPosition").invoke(vec2(0, scroll._applied));
            }
        }
        const L: Layer = {
            id: idBase, container, x0, y0: y0 - sy, width, clip, scroll,
            indent: 0, rightEdge: width, cursorX: 0, cursorY: 0, lineH: 0, sameLine: false, nextW: null, maxY: 0,
            cols: null, cards: [], lastItem: { x: 0, y: 0, w: 0, h: 0 }, lastId: 0, idBase,
        };
        this.layers.push(L);
        this.L = L;
        this.overlayPass = overlay;
    }

    /** Ends the layer; returns the content height. */
    endLayer(): number {
        const L = this.L;
        this.flushLine();
        const h = Math.max(L.maxY, L.cursorY);
        if (L.scroll) L.scroll.contentH = h;
        this.layers.pop();
        this.L = this.layers[this.layers.length - 1];
        this.overlayPass = false;
        return h;
    }

    private updateScroll(s: ScrollState, clip: Rect): void {
        const p = this.ptr, dt = this.dt;
        s.viewH = clip.h;
        const inClip = p.valid && this.pointIn(p.x, p.y, clip) && (!this.pointerBlocked || this.overlayPass);
        if (p.pressed && inClip) {
            s.pressed = true; s.dragging = false; s.pressY = p.y; s.scrollAtPress = s.scroll; s.lastY = p.y; s.velocity = 0;
        }
        if (s.pressed && p.down) {
            if (!this.activeCaptured) {
                const dy = p.y - s.pressY;
                if (!s.dragging && Math.abs(dy) > 10) { s.dragging = true; this.activeId = 0; }
                if (s.dragging) {
                    s.scroll = s.scrollAtPress - dy;
                    if (dt > 0) s.velocity = lerp(s.velocity, -(p.y - s.lastY) / dt, 0.5);
                }
            }
            s.lastY = p.y;
        }
        if (!p.down) { s.pressed = false; s.dragging = false; }
        if (!s.pressed && Math.abs(s.velocity) > 2) {
            s.scroll += s.velocity * dt;
            s.velocity *= Math.exp(-dt * 6);
        } else if (!s.pressed) s.velocity = 0;
        const max = Math.max(0, s.contentH - s.viewH);
        if (s.scroll < 0) { s.scroll = 0; s.velocity = 0; }
        if (s.scroll > max) { s.scroll = max; s.velocity = 0; }
    }

    scrollBy(s: ScrollState, dy: number): void { s.scroll += dy; s.velocity = 0; }

    // ── layout ─────────────────────────────────────────────────────────────
    get contentWidth(): number { return this.L.rightEdge - this.L.indent; }
    get cursorY(): number { return this.L.cursorY; }

    private flushLine(): void {
        const L = this.L;
        if (L.lineH > 0) { L.cursorY += L.lineH + theme.spacing; L.lineH = 0; }
        L.cursorX = L.indent;
        L.sameLine = false;
    }
    /** Reserves a rect for the next item. */
    allocate(h: number, w?: number): Rect {
        const L = this.L;
        if (!L.sameLine) {
            if (L.lineH > 0) L.cursorY += L.lineH + theme.spacing;
            L.cursorX = L.indent; L.lineH = 0;
        }
        const avail = Math.max(10, L.rightEdge - L.cursorX);
        const width = Math.min(avail, w ?? L.nextW ?? avail);
        const r: Rect = { x: L.cursorX, y: L.cursorY, w: width, h };
        L.cursorX += width + theme.spacing;
        L.lineH = Math.max(L.lineH, h);
        L.sameLine = false; L.nextW = null;
        L.maxY = Math.max(L.maxY, r.y + r.h);
        L.lastItem = r;
        return r;
    }
    /** Next item continues on the current line. */
    sameLine(): void { this.L.sameLine = true; }
    /** Width of the next item (default = remaining width). */
    setNextWidth(w: number): void { this.L.nextW = w; }
    spacing(h = theme.spacing): void { this.flushLine(); this.L.cursorY += h; }
    indent(px = 16): void { this.flushLine(); this.L.indent += px; this.L.cursorX = this.L.indent; }
    unindent(px = 16): void { this.flushLine(); this.L.indent = Math.max(0, this.L.indent - px); this.L.cursorX = this.L.indent; }
    beginColumns(n: number, gap = theme.spacing): void {
        this.flushLine();
        const L = this.L;
        const colW = (L.rightEdge - L.indent - gap * (n - 1)) / n;
        L.cols = { n, gap, i: 0, startY: L.cursorY, maxY: L.cursorY, colW, baseIndent: L.indent, baseRight: L.rightEdge };
        L.rightEdge = L.indent + colW;
        L.cursorX = L.indent;
    }
    nextColumn(): void {
        const L = this.L, c = L.cols;
        if (!c) return;
        this.flushLine();
        c.maxY = Math.max(c.maxY, L.cursorY);
        c.i = Math.min(c.n - 1, c.i + 1);
        L.indent = c.baseIndent + c.i * (c.colW + c.gap);
        L.rightEdge = L.indent + c.colW;
        L.cursorX = L.indent; L.cursorY = c.startY; L.lineH = 0;
    }
    endColumns(): void {
        const L = this.L, c = L.cols;
        if (!c) return;
        this.flushLine();
        c.maxY = Math.max(c.maxY, L.cursorY);
        L.indent = c.baseIndent; L.rightEdge = c.baseRight; L.cursorX = L.indent;
        L.cursorY = c.maxY; L.lineH = 0; L.cols = null;
    }
    pushId(id: string | number): void { this.idStack.push(typeof id === "number" ? id : hashStr(id)); }
    popId(): void { this.idStack.pop(); }

    // ── ids & pool ─────────────────────────────────────────────────────────
    private makeId(label: string): number {
        let h = hashCombine(this.L.idBase, hashStr(label));
        for (const s of this.idStack) h = hashCombine(h, s);
        return h;
    }
    private static display(label: string): string {
        const i = label.indexOf("##");
        return i >= 0 ? label.substring(0, i) : label;
    }
    private get(label: string, kind: string): Widget {
        let id = this.makeId(label);
        let w = this.widgets.get(id);
        if (w && w.lastFrame === this.frame) {
            id = hashCombine(id, ++this.dup); // duplicate label in the same layer this frame
            w = this.widgets.get(id);
        }
        if (w && w.kind !== kind) { destroy(w.root.go); this.widgets.delete(id); w = undefined; }
        if (!w) {
            const root = createRect(this.L.container, kind);
            initTopLeft(root);
            w = new Widget(id, kind, this.L.id, root);
            this.widgets.set(id, w);
        } else {
            w.created = false;
            if (w.layerId !== this.L.id) {
                setParent(transformOf(w.root.go), this.L.container, false);
                w.layerId = this.L.id;
            }
        }
        if (!w.shown) { setActive(w.root.go, true); w.shown = true; }
        w.lastFrame = this.frame;
        this.L.lastId = id;
        return w;
    }
    private img(w: Widget, name: string, sprite: Obj | null, c: RGBA, sliced = true, center = false): ImageEl {
        let p = w.parts[name] as ImageEl | undefined;
        if (!p) {
            p = createImage(transformOf(w.root.go), name, sprite, c, sliced);
            initTopLeft(p, center);
            w.parts[name] = p;
        }
        return p;
    }
    private txt(w: Widget, name: string, size: number, c: RGBA, h: HAlign = "left", v: VAlign = "middle", bold = false): TextEl {
        let p = w.parts[name] as TextEl | undefined;
        if (!p) {
            p = createText(transformOf(w.root.go), name, "", size, c, h, v, bold);
            initTopLeft(p);
            w.parts[name] = p;
        }
        return p;
    }
    private hide(w: Widget, name: string): void {
        const p = w.parts[name];
        if (p) setVisible(p, false);
    }
    private show(p: Part): void { setVisible(p, true); }

    // ── interaction ────────────────────────────────────────────────────────
    private pointIn(x: number, y: number, r: Rect): boolean { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

    /** Pointer position in the current layer's coordinates. */
    layerPointer(): { x: number; y: number } { return { x: this.ptr.x - this.L.x0, y: this.ptr.y - this.L.y0 }; }

    private interact(w: Widget, r: Rect, zone = 0, capture = false, disabled = false): Interaction {
        const L = this.L, p = this.ptr;
        const lx = p.x - L.x0, ly = p.y - L.y0;
        const allowed = p.valid && !disabled && this.pointIn(p.x, p.y, L.clip) && (!this.pointerBlocked || this.overlayPass);
        const inside = allowed && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
        const scrollDrag = L.scroll?.dragging ?? false;
        const isActive = this.activeId === w.id && this.activeZone === zone;
        const hovered = inside && !scrollDrag && (this.activeId === 0 || isActive);
        let pressed = false, clicked = false, released = false;
        if (hovered && p.pressed && this.activeId === 0) {
            this.activeId = w.id; this.activeZone = zone; this.activeCaptured = capture; pressed = true;
        }
        const nowActive = this.activeId === w.id && this.activeZone === zone;
        const held = nowActive && p.down;
        if (nowActive && p.released) { released = true; clicked = inside && !scrollDrag; }
        if (this.host.settings.clickOnPress) clicked = pressed;
        if (hovered) {
            this.hoverThisFrame = w.id;
            if (this.hoveredId !== w.id || w.zoneHover !== zone) {
                this.hoveredId = w.id; w.zoneHover = zone; this.hoverStart = this.now; this.host.haptic("hover");
            }
        }
        if (clicked) this.host.haptic("click");
        if (zone === 0) {
            w.hoverT = approach(w.hoverT, hovered || held ? 1 : 0, this.dt * 16);
            w.pressT = approach(w.pressT, held ? 1 : 0, this.dt * 20);
        }
        return { hovered, pressed, held, released, clicked };
    }

    /** True if the last item is hovered. */
    isItemHovered(): boolean { return this.hoveredId === this.L.lastId && this.hoveredId !== 0; }
    /** Tooltip for the last item (shows after `settings.tooltipDelay`). */
    tooltip(text: string): void {
        if (!this.isItemHovered()) return;
        if (this.now - this.hoverStart < this.host.settings.tooltipDelay) return;
        const r = this.L.lastItem;
        this.tooltipReq = { text, rect: { x: r.x + this.L.x0, y: r.y + this.L.y0, w: r.w, h: r.h } };
    }

    // ── widgets: text ──────────────────────────────────────────────────────
    label(text: string, opts: { color?: RGBA; size?: number; bold?: boolean; align?: HAlign; wrap?: boolean; height?: number } = {}): void {
        const size = opts.size ?? theme.fontSize;
        const w = this.get(text + "##lbl" + (this.L.cursorY | 0), "label");
        const t = this.txt(w, "t", size, theme.text);
        textSetSize(t, size); textSetBold(t, !!opts.bold); textSetAlign(t, opts.align ?? "left", "middle");
        textSetColor(t, opts.color ?? theme.text);
        textSetWrap(t, !!opts.wrap);
        let h = opts.height ?? lineHeight(size);
        if (opts.wrap) {
            const width = this.L.nextW ?? (this.L.rightEdge - (this.L.sameLine ? this.L.cursorX : this.L.indent));
            if (w.state.text !== text || w.state.width !== width) {
                place(w.root, 0, 0, width, h); place(t, 0, 0, width, h);
                textSet(t, text);
                h = Math.max(h, Math.ceil(textPreferredHeight(t)) + 2);
                w.state = { text, width, h };
            } else h = w.state.h;
        }
        const r = this.allocate(h);
        place(w.root, r.x, r.y, r.w, r.h); place(t, 0, 0, r.w, r.h);
        textSet(t, text);
    }
    text(text: string, color: RGBA = theme.text): void { this.label(text, { color }); }
    textDim(text: string): void { this.label(text, { color: theme.textDim }); }
    textWrapped(text: string, color: RGBA = theme.textDim): void { this.label(text, { color, wrap: true }); }

    header(text: string): void {
        const w = this.get(text + "##hdr", "header");
        const r = this.allocate(lineHeight(theme.titleSize) + 6);
        place(w.root, r.x, r.y, r.w, r.h);
        const t = this.txt(w, "t", theme.titleSize, theme.text, "left", "middle", true);
        place(t, 0, 0, r.w, r.h - 6); textSet(t, GuiText(text)); textSetColor(t, theme.text); textSetSize(t, theme.titleSize);
        const line = this.img(w, "line", Sprites.gradientH(), theme.accent, false);
        place(line, 0, r.h - 3, Math.min(r.w, 120), 2); imageSetColor(line, theme.accent);
    }

    separator(label?: string): void {
        const w = this.get((label ?? "") + "##sep" + (this.L.cursorY | 0), "separator");
        const r = this.allocate(label ? 20 : 10);
        place(w.root, r.x, r.y, r.w, r.h);
        const line = this.img(w, "line", Sprites.fadeLine(), theme.border, false);
        if (label) {
            const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
            const tw = estWidth(label, theme.smallFontSize) + 6;
            place(t, 0, 0, tw, r.h); textSet(t, label.toUpperCase()); textSetColor(t, theme.textMuted);
            place(line, tw + 4, r.h / 2, Math.max(0, r.w - tw - 4), 1);
        } else {
            place(line, 0, r.h / 2, r.w, 1);
        }
        imageSetColor(line, withAlpha(theme.border, 0.9));
    }

    keyValue(key: string, value: string, valueColor: RGBA = theme.text): void {
        const w = this.get(key + "##kv", "kv");
        const r = this.allocate(24);
        place(w.root, r.x, r.y, r.w, r.h);
        const k = this.txt(w, "k", theme.smallFontSize + 1, theme.textDim);
        const v = this.txt(w, "v", theme.smallFontSize + 1, theme.text, "right");
        place(k, 0, 0, r.w * 0.5, r.h); textSet(k, key); textSetColor(k, theme.textDim);
        place(v, r.w * 0.45, 0, r.w * 0.55, r.h); textSet(v, value); textSetColor(v, valueColor);
    }

    badge(text: string, color: RGBA = theme.accent): void {
        const w = this.get(text + "##badge", "badge");
        const width = estWidth(text, theme.smallFontSize) + 18;
        const r = this.allocate(22, width);
        place(w.root, r.x, r.y, r.w, r.h);
        const bg = this.img(w, "bg", Sprites.rounded(11), withAlpha(color, 0.18));
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, withAlpha(color, 0.18));
        const t = this.txt(w, "t", theme.smallFontSize, color, "center", "middle", true);
        place(t, 0, 0, r.w, r.h); textSet(t, text); textSetColor(t, color);
    }

    // ── widgets: buttons ───────────────────────────────────────────────────
    button(label: string, opts: { variant?: ButtonVariant; width?: number; height?: number; disabled?: boolean; small?: boolean } = {}): boolean {
        const w = this.get(label, "button");
        const h = opts.height ?? (opts.small ? 28 : theme.widgetHeight);
        const r = this.allocate(h, opts.width);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h }, 0, false, opts.disabled);
        const v = opts.variant ?? "default";
        let base: RGBA, hover: RGBA, textC: RGBA, borderC: RGBA;
        switch (v) {
            case "primary": base = theme.accent; hover = lerpColor(theme.accent, { r: 1, g: 1, b: 1, a: 1 }, 0.15); textC = theme.onAccent; borderC = withAlpha(theme.accent, 0); break;
            case "accent2": base = theme.accent2; hover = lerpColor(theme.accent2, { r: 1, g: 1, b: 1, a: 1 }, 0.15); textC = theme.onAccent; borderC = withAlpha(theme.accent2, 0); break;
            case "danger": base = withAlpha(theme.danger, 0.16); hover = withAlpha(theme.danger, 0.35); textC = theme.danger; borderC = withAlpha(theme.danger, 0.5); break;
            case "ghost": base = TRANSPARENT; hover = theme.hover; textC = theme.textDim; borderC = TRANSPARENT; break;
            default: base = theme.surface2; hover = theme.hover; textC = theme.text; borderC = theme.border;
        }
        let bgc = lerpColor(base, hover, w.hoverT);
        bgc = lerpColor(bgc, theme.active, w.pressT * 0.6);
        if (opts.disabled) { bgc = withAlpha(bgc, 0.4); textC = withAlpha(textC, 0.5); }
        const rad = theme.widgetRadius;
        if (v === "primary" || v === "accent2") {
            const glow = this.img(w, "glow", Sprites.shadow(rad, 10), withAlpha(base, 0.35));
            place(glow, -8, -6, r.w + 16, r.h + 16); imageSetColor(glow, withAlpha(base, 0.25 * theme.glow + 0.2 * w.hoverT));
        }
        const bg = this.img(w, "bg", Sprites.rounded(rad), bgc);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, bgc);
        if (v === "primary" || v === "accent2") {
            const sheen = this.img(w, "sheen", Sprites.gradientV(), withAlpha({ r: 1, g: 1, b: 1, a: 1 }, 0.12), false);
            place(sheen, 2, 1, r.w - 4, r.h / 2); imageSetColor(sheen, withAlpha({ r: 1, g: 1, b: 1, a: 1 }, 0.12));
        }
        const border = this.img(w, "border", Sprites.ring(rad, 1), borderC);
        place(border, 0, 0, r.w, r.h); imageSetColor(border, lerpColor(borderC, theme.accent, v === "default" ? w.hoverT * 0.6 : 0));
        const t = this.txt(w, "t", opts.small ? theme.smallFontSize + 1 : theme.fontSize, textC, "center", "middle", true);
        place(t, 6, 0, r.w - 12, r.h); textSet(t, Gui.display(label)); textSetColor(t, textC);
        return it.clicked && !opts.disabled;
    }

    /** A button that stays highlighted while `value` is true. Returns the new value. */
    toggleButton(label: string, value: boolean, onChange?: (v: boolean) => void, opts: { width?: number; height?: number } = {}): boolean {
        const w = this.get(label, "tbutton");
        const r = this.allocate(opts.height ?? theme.widgetHeight, opts.width);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
        w.anim = approach(w.anim, value ? 1 : 0, this.dt * 14);
        const base = lerpColor(theme.surface2, withAlpha(theme.accent, 0.9), w.anim);
        const bgc = lerpColor(base, lerpColor(theme.hover, theme.accent, w.anim), w.hoverT);
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, bgc);
        const border = this.img(w, "border", Sprites.ring(theme.widgetRadius, 1), theme.border);
        place(border, 0, 0, r.w, r.h); imageSetColor(border, lerpColor(theme.border, theme.accent, w.anim));
        const tc = lerpColor(theme.text, theme.onAccent, w.anim);
        const t = this.txt(w, "t", theme.fontSize, tc, "center", "middle", true);
        place(t, 6, 0, r.w - 12, r.h); textSet(t, Gui.display(label)); textSetColor(t, tc);
        if (it.clicked) { value = !value; onChange?.(value); }
        return value;
    }

    /** Buttons side by side; returns index clicked or -1. */
    buttonRow(labels: string[], variant: ButtonVariant = "default"): number {
        let hit = -1;
        this.beginColumns(labels.length);
        labels.forEach((l, i) => {
            if (i > 0) this.nextColumn();
            if (this.button(l, { variant })) hit = i;
        });
        this.endColumns();
        return hit;
    }

    /** Square icon button. icon: close | chevron-left | chevron-right | chevron-down | chevron-up */
    iconButton(id: string, icon: "close" | "chevron-left" | "chevron-right" | "chevron-down" | "chevron-up", size = 30, color: RGBA = theme.textDim): boolean {
        const w = this.get(id + "##icon", "iconbtn");
        const r = this.allocate(size, size);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
        const bg = this.img(w, "bg", Sprites.rounded(Math.round(size * 0.3)), TRANSPARENT);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, withAlpha(theme.hover, w.hoverT));
        const ic = this.img(w, "ic", icon === "close" ? Sprites.cross() : Sprites.chevron(), color, false, true);
        imageSetSprite(ic, icon === "close" ? Sprites.cross() : Sprites.chevron(), false);
        const g = Math.round(size * 0.7);
        place(ic, (size - g) / 2, (size - g) / 2, g, g);
        imageSetColor(ic, lerpColor(color, theme.text, w.hoverT));
        imageSetRotation(ic, icon === "chevron-left" ? 180 : icon === "chevron-down" ? -90 : icon === "chevron-up" ? 90 : 0);
        return it.clicked;
    }

    // ── widgets: toggle ────────────────────────────────────────────────────
    toggle(label: string, value: boolean, onChange?: (v: boolean) => void, opts: { description?: string; disabled?: boolean } = {}): boolean {
        const w = this.get(label, "toggle");
        const hasDesc = !!opts.description;
        const r = this.allocate(hasDesc ? 46 : 36);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h }, 0, false, opts.disabled);
        if (it.clicked) { value = !value; onChange?.(value); }
        w.anim = approach(w.anim, value ? 1 : 0, this.dt * 14);
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), TRANSPARENT);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, withAlpha(theme.hover, w.hoverT * 0.9));
        const sw = this.host.settings.toggleStyle === "switch";
        const t = this.txt(w, "t", theme.fontSize, theme.text);
        const textX = sw ? 10 : 36;
        place(t, textX, hasDesc ? 3 : 0, r.w - textX - 56, hasDesc ? 24 : r.h);
        textSet(t, Gui.display(label)); textSetColor(t, opts.disabled ? theme.textMuted : theme.text);
        if (hasDesc) {
            const d = this.txt(w, "d", theme.smallFontSize, theme.textMuted);
            place(d, textX, 24, r.w - textX - 56, 18); textSet(d, opts.description!); textSetColor(d, theme.textMuted);
        } else this.hide(w, "d");
        if (sw) {
            const tw = 40, th = 22, ty = (r.h - th) / 2, tx = r.w - tw - 8;
            const trackC = lerpColor(theme.track, theme.accent, w.anim);
            const glow = this.img(w, "glow", Sprites.shadow(11, 8), TRANSPARENT);
            place(glow, tx - 6, ty - 6, tw + 12, th + 12); imageSetColor(glow, withAlpha(theme.accent, 0.35 * w.anim * theme.glow));
            const track = this.img(w, "track", Sprites.rounded(11), trackC);
            place(track, tx, ty, tw, th); imageSetColor(track, trackC);
            const ring = this.img(w, "ring", Sprites.ring(11, 1), theme.border);
            place(ring, tx, ty, tw, th); imageSetColor(ring, withAlpha(theme.border, 1 - w.anim));
            const knob = this.img(w, "knob", Sprites.circle(), theme.knob, false);
            const kx = tx + 3 + w.anim * (tw - 22);
            place(knob, kx, ty + 3, 16, 16); imageSetColor(knob, lerpColor(theme.textDim, theme.knob, w.anim));
            this.hide(w, "box"); this.hide(w, "boxr"); this.hide(w, "check");
        } else {
            const bs = 22, bx = 6, by = (r.h - bs) / 2;
            const boxC = lerpColor(theme.surface2, theme.accent, w.anim);
            const box = this.img(w, "box", Sprites.rounded(6), boxC);
            this.show(box); place(box, bx, by, bs, bs); imageSetColor(box, boxC);
            const boxr = this.img(w, "boxr", Sprites.ring(6, 1), theme.border);
            this.show(boxr); place(boxr, bx, by, bs, bs); imageSetColor(boxr, lerpColor(theme.border, theme.accent, Math.max(w.anim, w.hoverT * 0.5)));
            const check = this.img(w, "check", Sprites.check(), theme.onAccent, false, true);
            this.show(check);
            const cs = 6 + 12 * easeOutCubic(w.anim);
            place(check, bx + (bs - cs) / 2, by + (bs - cs) / 2, cs, cs); imageSetColor(check, withAlpha(theme.onAccent, w.anim));
            this.hide(w, "glow"); this.hide(w, "track"); this.hide(w, "ring"); this.hide(w, "knob");
        }
        return value;
    }

    // ── widgets: sliders ───────────────────────────────────────────────────
    slider(label: string, value: number, min: number, max: number, opts: { step?: number; format?: (v: number) => string; onChange?: (v: number) => void; suffix?: string } = {}): number {
        const w = this.get(label, "slider");
        const r = this.allocate(46);
        place(w.root, r.x, r.y, r.w, r.h);
        const trackY = 30, trackH = 6, knob = 18, pad = 2;
        const it = this.interact(w, { x: 0, y: 20, w: r.w, h: r.h - 20 }, 0, true);
        const span = Math.max(1e-6, max - min);
        if (it.held) {
            const lp = this.layerPointer();
            const t = clamp01((lp.x - r.x - pad - knob / 2) / (r.w - pad * 2 - knob));
            let v = min + t * span;
            if (opts.step) v = Math.round(v / opts.step) * opts.step;
            v = clamp(v, min, max);
            if (v !== value) { value = v; opts.onChange?.(v); }
        }
        const t = clamp01((value - min) / span);
        const fmt = opts.format ?? ((v: number) => (Number.isInteger(opts.step ?? 0.1) && (opts.step ?? 0) >= 1 ? String(Math.round(v)) : v.toFixed(2)) + (opts.suffix ?? ""));
        const lt = this.txt(w, "l", theme.fontSize, theme.text);
        place(lt, 4, 0, r.w * 0.6, 22); textSet(lt, Gui.display(label)); textSetColor(lt, theme.text);
        const vt = this.txt(w, "v", theme.smallFontSize + 1, theme.textDim, "right", "middle", true);
        place(vt, r.w * 0.55, 0, r.w * 0.45 - 4, 22); textSet(vt, fmt(value)); textSetColor(vt, lerpColor(theme.textDim, theme.accent2, w.hoverT));
        const track = this.img(w, "track", Sprites.rounded(3), theme.track);
        place(track, pad, trackY, r.w - pad * 2, trackH); imageSetColor(track, theme.track);
        const fillW = Math.max(0, (r.w - pad * 2 - knob) * t + knob / 2);
        const fill = this.img(w, "fill", Sprites.rounded(3), theme.accent);
        place(fill, pad, trackY, fillW, trackH); imageSetColor(fill, theme.accent);
        const fill2 = this.img(w, "fill2", Sprites.gradientH(), theme.accent2, false);
        place(fill2, pad, trackY, fillW, trackH); imageSetColor(fill2, withAlpha(theme.accent2, 0.9));
        const kx = pad + (r.w - pad * 2 - knob) * t;
        const glow = this.img(w, "glow", Sprites.glow(), theme.accent, false);
        const gs = knob + 14 + 8 * w.hoverT;
        place(glow, kx + knob / 2 - gs / 2, trackY + trackH / 2 - gs / 2, gs, gs); imageSetColor(glow, withAlpha(theme.accent, (0.35 + 0.35 * w.hoverT) * theme.glow));
        const kn = this.img(w, "knob", Sprites.circle(), theme.knob, false);
        place(kn, kx, trackY + trackH / 2 - knob / 2, knob, knob); imageSetColor(kn, lerpColor(theme.knob, theme.accent2, w.pressT * 0.5));
        return value;
    }
    intSlider(label: string, value: number, min: number, max: number, onChange?: (v: number) => void, suffix = ""): number {
        return Math.round(this.slider(label, value, min, max, { step: 1, onChange, format: v => String(Math.round(v)) + suffix }));
    }

    progress(t: number, label?: string, color: RGBA = theme.accent): void {
        const w = this.get((label ?? "") + "##prog" + (this.L.cursorY | 0), "progress");
        const r = this.allocate(label ? 30 : 12);
        place(w.root, r.x, r.y, r.w, r.h);
        const barY = label ? 22 : 3, barH = 6;
        if (label) {
            const lt = this.txt(w, "l", theme.smallFontSize + 1, theme.textDim);
            place(lt, 2, 0, r.w * 0.7, 20); textSet(lt, label); textSetColor(lt, theme.textDim);
            const vt = this.txt(w, "v", theme.smallFontSize, theme.textDim, "right");
            place(vt, r.w * 0.6, 0, r.w * 0.4 - 2, 20); textSet(vt, `${Math.round(clamp01(t) * 100)}%`); textSetColor(vt, theme.textDim);
        }
        const track = this.img(w, "track", Sprites.rounded(3), theme.track);
        place(track, 0, barY, r.w, barH); imageSetColor(track, theme.track);
        const fill = this.img(w, "fill", Sprites.rounded(3), color);
        place(fill, 0, barY, Math.max(6, r.w * clamp01(t)), barH); imageSetColor(fill, color);
    }

    // ── widgets: dropdown / stepper ────────────────────────────────────────
    dropdown(label: string, index: number, options: string[], onChange?: (i: number) => void): number {
        const w = this.get(label, "dropdown");
        const open = this.openDropdown === w.id;
        const rowH = 36, optH = 30;
        const r = this.allocate(rowH);
        place(w.root, r.x, r.y, r.w, r.h + (open ? options.length * optH + 8 : 0));
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: rowH });
        if (it.clicked) this.openDropdown = open ? 0 : w.id;
        w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
        const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
        place(bg, 0, 0, r.w, rowH); imageSetColor(bg, bgc);
        const border = this.img(w, "border", Sprites.ring(theme.widgetRadius, 1), theme.border);
        place(border, 0, 0, r.w, rowH); imageSetColor(border, lerpColor(theme.border, theme.accent, Math.max(w.hoverT * 0.6, w.anim)));
        const lt = this.txt(w, "l", theme.fontSize, theme.text);
        place(lt, 10, 0, r.w * 0.5, rowH); textSet(lt, Gui.display(label)); textSetColor(lt, theme.text);
        const vt = this.txt(w, "v", theme.fontSize, theme.accent2, "right", "middle", true);
        place(vt, r.w * 0.4, 0, r.w * 0.6 - 34, rowH); textSet(vt, options[index] ?? "—"); textSetColor(vt, theme.accent2);
        const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
        place(ch, r.w - 28, (rowH - 18) / 2, 18, 18); imageSetColor(ch, theme.textDim); imageSetRotation(ch, -90 * w.anim);
        // options
        const listH = open ? options.length * optH + 8 : 0;
        if (open) {
            const list = this.img(w, "list", Sprites.rounded(theme.widgetRadius), theme.surface);
            this.show(list); place(list, 0, rowH + 2, r.w, listH); imageSetColor(list, theme.surface);
            const listB = this.img(w, "listb", Sprites.ring(theme.widgetRadius, 1), theme.border);
            this.show(listB); place(listB, 0, rowH + 2, r.w, listH); imageSetColor(listB, theme.border);
            for (let i = 0; i < options.length; i++) {
                const oy = rowH + 6 + i * optH;
                const zone = i + 1;
                const oi = this.interact(w, { x: 4, y: oy, w: r.w - 8, h: optH }, zone);
                const hov = oi.hovered || oi.held;
                const ob = this.img(w, `o${i}`, Sprites.rounded(6), TRANSPARENT);
                this.show(ob); place(ob, 4, oy, r.w - 8, optH); imageSetColor(ob, hov ? theme.hover : i === index ? withAlpha(theme.accent, 0.15) : TRANSPARENT);
                const ot = this.txt(w, `t${i}`, theme.fontSize, theme.text);
                this.show(ot); place(ot, 14, oy, r.w - 28, optH); textSet(ot, options[i]);
                textSetColor(ot, i === index ? theme.accent2 : theme.text);
                if (oi.clicked) { if (i !== index) { index = i; onChange?.(i); } this.openDropdown = 0; }
            }
            // reserve space in the layout for the list
            this.L.lineH = Math.max(this.L.lineH, rowH + listH + 2);
            this.L.maxY = Math.max(this.L.maxY, r.y + rowH + listH + 2);
        } else {
            this.hide(w, "list"); this.hide(w, "listb");
            for (let i = 0; w.parts[`o${i}`]; i++) { this.hide(w, `o${i}`); this.hide(w, `t${i}`); }
        }
        return index;
    }

    /** Numeric stepper: label  [-] value [+] */
    stepper(label: string, value: number, min: number, max: number, step = 1, onChange?: (v: number) => void, format?: (v: number) => string): number {
        const w = this.get(label, "stepper");
        const r = this.allocate(36);
        place(w.root, r.x, r.y, r.w, r.h);
        const bw = 30, vw = 64;
        const plusX = r.w - bw, valX = plusX - vw, minusX = valX - bw;
        const lt = this.txt(w, "l", theme.fontSize, theme.text);
        place(lt, 4, 0, minusX - 8, r.h); textSet(lt, Gui.display(label)); textSetColor(lt, theme.text);
        const mk = (name: string, x: number, zone: number, glyph: string): boolean => {
            const it = this.interact(w, { x, y: 3, w: bw, h: r.h - 6 }, zone);
            const bg = this.img(w, name, Sprites.rounded(8), theme.surface2);
            place(bg, x, 3, bw, r.h - 6); imageSetColor(bg, it.hovered || it.held ? theme.hover : theme.surface2);
            const t = this.txt(w, name + "t", theme.fontSize + 2, theme.text, "center", "middle", true);
            place(t, x, 3, bw, r.h - 6); textSet(t, glyph); textSetColor(t, it.hovered ? theme.accent2 : theme.text);
            return it.clicked;
        };
        const vt = this.txt(w, "v", theme.fontSize, theme.accent2, "center", "middle", true);
        place(vt, valX, 0, vw, r.h); textSet(vt, format ? format(value) : String(Math.round(value * 100) / 100)); textSetColor(vt, theme.accent2);
        if (mk("m", minusX, 1, "−") && value - step >= min - 1e-9) { value = Math.max(min, value - step); onChange?.(value); }
        if (mk("p", plusX, 2, "+") && value + step <= max + 1e-9) { value = Math.min(max, value + step); onChange?.(value); }
        return value;
    }

    // ── widgets: sections ──────────────────────────────────────────────────
    collapsingHeader(label: string, defaultOpen = false): boolean {
        const w = this.get(label, "collapse");
        if (w.state.open === undefined) w.state.open = defaultOpen;
        const r = this.allocate(34);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
        if (it.clicked) w.state.open = !w.state.open;
        const open = !!w.state.open;
        w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
        const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, bgc);
        const bar = this.img(w, "bar", Sprites.rounded(2), theme.accent);
        place(bar, 0, 8, 3, r.h - 16); imageSetColor(bar, withAlpha(theme.accent, 0.4 + 0.6 * w.anim));
        const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
        place(ch, 8, (r.h - 18) / 2, 18, 18); imageSetColor(ch, lerpColor(theme.textDim, theme.accent2, w.anim)); imageSetRotation(ch, -90 * w.anim);
        const t = this.txt(w, "t", theme.fontSize, theme.text, "left", "middle", true);
        place(t, 30, 0, r.w - 36, r.h); textSet(t, Gui.display(label)); textSetColor(t, theme.text);
        return open;
    }

    /** Card = rounded box grouping the items drawn until endCard(). */
    beginCard(title?: string): void {
        this.flushLine();
        const w = this.get((title ?? "card") + "##card" + (this.L.cursorY | 0), "card");
        // backgrounds must render behind widgets that may already exist in this container
        if (w.created) setAsFirstSibling(transformOf(w.root.go));
        const L = this.L;
        const pad = 10;
        const startY = L.cursorY;
        const bg = this.img(w, "bg", Sprites.rounded(theme.radius - 4), theme.surface);
        imageSetColor(bg, theme.surface);
        const border = this.img(w, "border", Sprites.ring(theme.radius - 4, 1), theme.border);
        imageSetColor(border, theme.border);
        L.cards.push({ w, startY, indent: L.indent, right: L.rightEdge, pad, hasTitle: !!title });
        L.indent += pad; L.rightEdge -= pad; L.cursorX = L.indent; L.cursorY += pad;
        if (title) {
            const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
            this.show(t);
            place(t, pad + 2, 6, L.rightEdge - L.indent, 18); textSet(t, title.toUpperCase()); textSetColor(t, theme.textMuted);
            L.cursorY += 14;
        } else this.hide(w, "t");
    }
    endCard(): void {
        const L = this.L, f = L.cards.pop();
        if (!f) return;
        this.flushLine();
        const h = L.cursorY - f.startY - theme.spacing + f.pad;
        const w = f.w;
        place(w.root, f.indent, f.startY, f.right - f.indent, h);
        place(w.parts.bg, 0, 0, f.right - f.indent, h);
        place(w.parts.border, 0, 0, f.right - f.indent, h);
        L.indent = f.indent; L.rightEdge = f.right; L.cursorX = L.indent;
        L.cursorY = f.startY + h; L.lineH = 0;
        L.maxY = Math.max(L.maxY, L.cursorY);
        L.cursorY += theme.spacing;
    }

    statCard(title: string, value: string, sub = "", accent: RGBA = theme.accent): void {
        const w = this.get(title + "##stat", "stat");
        const r = this.allocate(68);
        place(w.root, r.x, r.y, r.w, r.h);
        const bg = this.img(w, "bg", Sprites.rounded(theme.radius - 4), theme.surface);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, theme.surface);
        const border = this.img(w, "border", Sprites.ring(theme.radius - 4, 1), theme.border);
        place(border, 0, 0, r.w, r.h); imageSetColor(border, theme.border);
        const bar = this.img(w, "bar", Sprites.rounded(2), accent);
        place(bar, 8, 12, 3, r.h - 24); imageSetColor(bar, accent);
        const t = this.txt(w, "t", theme.smallFontSize, theme.textMuted, "left", "middle", true);
        place(t, 20, 8, r.w - 26, 18); textSet(t, title.toUpperCase()); textSetColor(t, theme.textMuted);
        const v = this.txt(w, "v", theme.titleSize + 3, theme.text, "left", "middle", true);
        place(v, 20, 24, r.w - 26, 26); textSet(v, value); textSetColor(v, theme.text);
        const s = this.txt(w, "s", theme.smallFontSize, accent, "left", "middle");
        place(s, 20, 48, r.w - 26, 16); textSet(s, sub); textSetColor(s, accent);
    }

    // ── widgets: tabs ──────────────────────────────────────────────────────
    tabs(id: string, selected: number, labels: string[], onChange?: (i: number) => void): number {
        const w = this.get(id + "##tabs", "tabs");
        const r = this.allocate(34);
        place(w.root, r.x, r.y, r.w, r.h);
        const n = Math.max(1, labels.length), tw = (r.w - 6) / n;
        if (w.state.pos === undefined) w.state.pos = selected;
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), theme.surface2);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, theme.surface2);
        w.state.pos = lerp(w.state.pos, selected, damp(18, this.dt));
        const ind = this.img(w, "ind", Sprites.rounded(theme.widgetRadius - 2), theme.accent);
        place(ind, 3 + w.state.pos * tw, 3, tw, r.h - 6); imageSetColor(ind, theme.accent);
        for (let i = 0; i < labels.length; i++) {
            const it = this.interact(w, { x: 3 + i * tw, y: 0, w: tw, h: r.h }, i + 1);
            if (it.clicked && i !== selected) { selected = i; onChange?.(i); }
            const t = this.txt(w, `t${i}`, theme.smallFontSize + 1, theme.textDim, "center", "middle", true);
            this.show(t); place(t, 3 + i * tw, 0, tw, r.h); textSet(t, labels[i]);
            const sel = Math.abs(w.state.pos - i) < 0.5;
            textSetColor(t, sel ? theme.onAccent : it.hovered ? theme.text : theme.textDim);
        }
        for (let i = labels.length; w.parts[`t${i}`]; i++) this.hide(w, `t${i}`);
        return selected;
    }

    // ── widgets: color picker ──────────────────────────────────────────────
    colorPicker(label: string, value: RGBA, onChange?: (c: RGBA) => void): RGBA {
        const w = this.get(label, "color");
        const r = this.allocate(36);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
        if (it.clicked) w.state.open = !w.state.open;
        const open = !!w.state.open;
        w.anim = approach(w.anim, open ? 1 : 0, this.dt * 16);
        const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
        const bg = this.img(w, "bg", Sprites.rounded(theme.widgetRadius), bgc);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, bgc);
        const sw = this.img(w, "sw", Sprites.rounded(6), value);
        place(sw, 8, 7, 22, 22); imageSetColor(sw, withAlpha(value, 1));
        const swr = this.img(w, "swr", Sprites.ring(6, 1), theme.border);
        place(swr, 8, 7, 22, 22); imageSetColor(swr, theme.border);
        const t = this.txt(w, "t", theme.fontSize, theme.text);
        place(t, 40, 0, r.w * 0.5, r.h); textSet(t, Gui.display(label)); textSetColor(t, theme.text);
        const hx = this.txt(w, "hex", theme.smallFontSize, theme.textDim, "right", "middle", true);
        place(hx, r.w * 0.5, 0, r.w * 0.5 - 34, r.h); textSet(hx, toHex(value).toUpperCase()); textSetColor(hx, theme.textDim);
        const ch = this.img(w, "ch", Sprites.chevron(), theme.textDim, false, true);
        place(ch, r.w - 28, 9, 18, 18); imageSetColor(ch, theme.textDim); imageSetRotation(ch, -90 * w.anim);
        if (!open) return value;
        this.pushId(label);
        this.indent(8);
        // hue presets
        const presets = [0, 0.04, 0.09, 0.16, 0.33, 0.48, 0.55, 0.62, 0.72, 0.83, 0.93];
        const pw = this.get("presets##" + label, "swatches");
        const pr = this.allocate(26);
        place(pw.root, pr.x, pr.y, pr.w, pr.h);
        const cell = pr.w / (presets.length + 1);
        presets.forEach((h, i) => {
            const c = hsv(h, 0.75, 0.95);
            const pi = this.interact(pw, { x: i * cell, y: 0, w: cell, h: pr.h }, i + 1);
            const s = this.img(pw, `s${i}`, Sprites.rounded(6), c);
            place(s, i * cell + 2, pi.hovered ? 0 : 3, cell - 4, pi.hovered ? pr.h : pr.h - 6); imageSetColor(s, c);
            if (pi.clicked) { value = { ...c, a: value.a }; onChange?.(value); }
        });
        {
            const i = presets.length;
            const c: RGBA = { r: 1, g: 1, b: 1, a: 1 };
            const pi = this.interact(pw, { x: i * cell, y: 0, w: cell, h: pr.h }, i + 1);
            const s = this.img(pw, `s${i}`, Sprites.rounded(6), c);
            place(s, i * cell + 2, pi.hovered ? 0 : 3, cell - 4, pi.hovered ? pr.h : pr.h - 6); imageSetColor(s, c);
            if (pi.clicked) { value = { ...c, a: value.a }; onChange?.(value); }
        }
        const set = (k: "r" | "g" | "b" | "a", v: number): void => { value = { ...value, [k]: v }; onChange?.(value); };
        this.slider("R", value.r, 0, 1, { onChange: v => set("r", v) });
        this.slider("G", value.g, 0, 1, { onChange: v => set("g", v) });
        this.slider("B", value.b, 0, 1, { onChange: v => set("b", v) });
        const hsvv = toHsv(value);
        this.slider("Hue", hsvv.h, 0, 1, { onChange: v => { const c = hsv(v, Math.max(hsvv.s, 0.05), Math.max(hsvv.v, 0.05), value.a); value = c; onChange?.(c); } });
        this.unindent(8);
        this.popId();
        return value;
    }

    // ── widgets: keybind ───────────────────────────────────────────────────
    keybind(label: string, current: VRButton, onChange?: (b: VRButton) => void): VRButton {
        const w = this.get(label, "keybind");
        const r = this.allocate(36);
        place(w.root, r.x, r.y, r.w, r.h);
        const capturing = this.capturing === w.id;
        const bw = 150, cw = 30;
        const it = this.interact(w, { x: r.w - bw - cw - 4, y: 3, w: bw, h: r.h - 6 }, 1);
        const cl = this.interact(w, { x: r.w - cw, y: 3, w: cw, h: r.h - 6 }, 2);
        const lt = this.txt(w, "l", theme.fontSize, theme.text);
        place(lt, 4, 0, r.w - bw - cw - 12, r.h); textSet(lt, Gui.display(label)); textSetColor(lt, theme.text);
        if (it.clicked) { this.capturing = capturing ? 0 : w.id; w.state.phase = "release"; }
        if (capturing) {
            const inp = this.host.input;
            if (w.state.phase === "release") {
                if (!ALL_BUTTONS.some(b => b !== "none" && inp.isDown(b))) w.state.phase = "listen";
            } else {
                const b = inp.anyPressed();
                if (b) { current = b; onChange?.(b); this.capturing = 0; }
            }
        }
        const bgc = capturing ? withAlpha(theme.accent, 0.25) : lerpColor(theme.surface2, theme.hover, it.hovered ? 1 : 0);
        const bg = this.img(w, "bg", Sprites.rounded(8), bgc);
        place(bg, r.w - bw - cw - 4, 3, bw, r.h - 6); imageSetColor(bg, bgc);
        const br = this.img(w, "br", Sprites.ring(8, 1), theme.border);
        place(br, r.w - bw - cw - 4, 3, bw, r.h - 6); imageSetColor(br, capturing ? theme.accent : theme.border);
        const bt = this.txt(w, "b", theme.smallFontSize + 1, theme.accent2, "center", "middle", true);
        place(bt, r.w - bw - cw - 4, 3, bw, r.h - 6);
        textSet(bt, capturing ? (Math.floor(this.now * 2) % 2 ? "press a button" : "press a button…") : BUTTON_LABELS[current]);
        textSetColor(bt, capturing ? theme.accent2 : current === "none" ? theme.textMuted : theme.text);
        const xb = this.img(w, "x", Sprites.cross(), theme.textDim, false, true);
        place(xb, r.w - cw + 6, 9, 18, 18); imageSetColor(xb, cl.hovered ? theme.danger : theme.textMuted);
        if (cl.clicked) { current = "none"; onChange?.("none"); this.capturing = 0; }
        return current;
    }

    // ── widgets: text field (opens the virtual keyboard) ───────────────────
    textField(label: string, value: string, placeholder = "", onChange?: (v: string) => void): string {
        const w = this.get(label, "textfield");
        const r = this.allocate(36);
        place(w.root, r.x, r.y, r.w, r.h);
        const hasLabel = Gui.display(label).length > 0;
        const boxX = hasLabel ? Math.round(r.w * 0.38) : 0;
        const it = this.interact(w, { x: boxX, y: 0, w: r.w - boxX, h: r.h });
        const kb = this.keyboard;
        const editing = kb.open && kb.targetId === w.id;
        if (it.clicked && !kb.open) {
            kb.open = true; kb.targetId = w.id; kb.buffer = value; kb.title = Gui.display(label) || placeholder || "Text";
            kb.shift = false; kb.symbols = false; kb.changed = false;
        }
        if (editing && kb.buffer !== value) { value = kb.buffer; onChange?.(value); }
        if (hasLabel) {
            const lt = this.txt(w, "l", theme.fontSize, theme.text);
            place(lt, 4, 0, boxX - 8, r.h); textSet(lt, Gui.display(label)); textSetColor(lt, theme.text);
        }
        const bgc = lerpColor(theme.surface2, theme.hover, w.hoverT);
        const bg = this.img(w, "bg", Sprites.rounded(8), bgc);
        place(bg, boxX, 2, r.w - boxX, r.h - 4); imageSetColor(bg, bgc);
        const br = this.img(w, "br", Sprites.ring(8, 1), theme.border);
        place(br, boxX, 2, r.w - boxX, r.h - 4); imageSetColor(br, editing ? theme.accent : theme.border);
        const vt = this.txt(w, "v", theme.fontSize, theme.text);
        place(vt, boxX + 10, 0, r.w - boxX - 20, r.h);
        const showCaret = editing && Math.floor(this.now * 2) % 2 === 0;
        textSet(vt, value.length ? value + (showCaret ? "|" : "") : (editing ? (showCaret ? "|" : "") : placeholder));
        textSetColor(vt, value.length ? theme.text : theme.textMuted);
        return value;
    }

    // ── sidebar / chrome helpers (used by menu.ts) ─────────────────────────
    sidebarItem(label: string, active: boolean, icon = "", badge = ""): boolean {
        const w = this.get(label + "##side", "sidebar");
        const r = this.allocate(40);
        place(w.root, r.x, r.y, r.w, r.h);
        const it = this.interact(w, { x: 0, y: 0, w: r.w, h: r.h });
        w.anim = approach(w.anim, active ? 1 : 0, this.dt * 14);
        const bgc = lerpColor(withAlpha(theme.sidebarActive, 0), theme.sidebarActive, Math.max(w.anim, w.hoverT * 0.6));
        const bg = this.img(w, "bg", Sprites.rounded(10), bgc);
        place(bg, 0, 0, r.w, r.h); imageSetColor(bg, bgc);
        const bar = this.img(w, "bar", Sprites.rounded(2), theme.accent);
        place(bar, 0, 10 + (1 - w.anim) * 8, 3, (r.h - 20) * w.anim + 1); imageSetColor(bar, withAlpha(theme.accent, w.anim));
        const ic = this.txt(w, "i", theme.fontSize, theme.sidebarText, "center", "middle", true);
        place(ic, 8, 0, 24, r.h); textSet(ic, icon); textSetColor(ic, lerpColor(theme.sidebarText, theme.accent2, w.anim));
        const t = this.txt(w, "t", theme.fontSize, theme.sidebarText, "left", "middle", true);
        place(t, icon ? 36 : 14, 0, r.w - (icon ? 40 : 18), r.h); textSet(t, Gui.display(label));
        textSetColor(t, lerpColor(lerpColor(theme.sidebarText, theme.text, w.hoverT), theme.sidebarActiveText, w.anim));
        if (badge) {
            const b = this.img(w, "bb", Sprites.rounded(8), theme.accent);
            this.show(b); place(b, r.w - 30, 12, 22, 16); imageSetColor(b, theme.accent);
            const bt = this.txt(w, "bt", theme.smallFontSize - 1, theme.onAccent, "center", "middle", true);
            this.show(bt); place(bt, r.w - 30, 12, 22, 16); textSet(bt, badge); textSetColor(bt, theme.onAccent);
        } else { this.hide(w, "bb"); this.hide(w, "bt"); }
        return it.clicked;
    }

    /** Toast card drawn at an absolute position inside the current layer. */
    toast(id: number, x: number, y: number, w: number, h: number, kind: ToastKind, title: string, message: string, progress: number, alpha: number): void {
        const wd = this.get(`toast${id}`, "toast");
        place(wd.root, x, y, w, h);
        const col = kind === "success" ? theme.success : kind === "warning" ? theme.warning : kind === "error" ? theme.danger : theme.info;
        const sh = this.img(wd, "sh", Sprites.shadow(12, 14), theme.shadow);
        place(sh, -10, -6, w + 20, h + 22); imageSetColor(sh, withAlpha(theme.shadow, 0.6 * alpha));
        const bg = this.img(wd, "bg", Sprites.rounded(12), theme.surface);
        place(bg, 0, 0, w, h); imageSetColor(bg, withAlpha(theme.surface, alpha));
        const br = this.img(wd, "br", Sprites.ring(12, 1), theme.border);
        place(br, 0, 0, w, h); imageSetColor(br, withAlpha(theme.border, alpha));
        const bar = this.img(wd, "bar", Sprites.rounded(2), col);
        place(bar, 8, 10, 4, h - 20); imageSetColor(bar, withAlpha(col, alpha));
        const t = this.txt(wd, "t", theme.fontSize, theme.text, "left", "middle", true);
        place(t, 22, 6, w - 30, 22); textSet(t, title); textSetColor(t, withAlpha(theme.text, alpha));
        const m = this.txt(wd, "m", theme.smallFontSize + 1, theme.textDim);
        place(m, 22, 26, w - 30, h - 34); textSet(m, message); textSetColor(m, withAlpha(theme.textDim, alpha)); textSetWrap(m, true);
        const pg = this.img(wd, "pg", Sprites.rounded(1), col);
        place(pg, 22, h - 5, Math.max(2, (w - 30) * clamp01(progress)), 2); imageSetColor(pg, withAlpha(col, 0.7 * alpha));
    }

    /** Pointer cursor dot. */
    cursor(x: number, y: number, size: number, alpha: number): void {
        const w = this.get("cursor##ptr", "cursor");
        place(w.root, x - size / 2, y - size / 2, size, size);
        const g = this.img(w, "g", Sprites.glow(), theme.accent2, false);
        place(g, -size * 0.6, -size * 0.6, size * 2.2, size * 2.2); imageSetColor(g, withAlpha(theme.accent2, 0.45 * alpha));
        const d = this.img(w, "d", Sprites.circle(), theme.knob, false);
        place(d, 0, 0, size, size); imageSetColor(d, withAlpha(theme.knob, alpha));
    }

    /** Tooltip bubble (drawn by menu.ts in the overlay layer). */
    tooltipBubble(text: string, x: number, y: number, maxW: number): void {
        const w = this.get("tooltip##ov", "tooltipb");
        const tw = Math.min(maxW, estWidth(text, theme.smallFontSize + 1) + 24);
        const h = 30;
        place(w.root, x, y, tw, h);
        const bg = this.img(w, "bg", Sprites.rounded(8), theme.surface2);
        place(bg, 0, 0, tw, h); imageSetColor(bg, theme.surface2);
        const br = this.img(w, "br", Sprites.ring(8, 1), theme.accent);
        place(br, 0, 0, tw, h); imageSetColor(br, withAlpha(theme.accent, 0.6));
        const t = this.txt(w, "t", theme.smallFontSize + 1, theme.text, "center", "middle");
        place(t, 6, 0, tw - 12, h); textSet(t, text); textSetColor(t, theme.text);
    }

    /** Full-layer dim rectangle (modal backdrop). */
    dim(x: number, y: number, w: number, h: number, alpha: number): void {
        const wd = this.get("dim##ov", "dim");
        place(wd.root, x, y, w, h);
        const bg = this.img(wd, "bg", Sprites.rounded(theme.radius), theme.bg);
        place(bg, 0, 0, w, h); imageSetColor(bg, withAlpha(theme.bg, alpha));
    }

    /** Panel box with border used by the keyboard overlay. */
    panelBox(id: string, x: number, y: number, w: number, h: number): void {
        const wd = this.get(id + "##box", "box");
        place(wd.root, x, y, w, h);
        const sh = this.img(wd, "sh", Sprites.shadow(14, 18), theme.shadow);
        place(sh, -14, -10, w + 28, h + 30); imageSetColor(sh, theme.shadow);
        const bg = this.img(wd, "bg", Sprites.rounded(14), theme.surface);
        place(bg, 0, 0, w, h); imageSetColor(bg, theme.surface);
        const br = this.img(wd, "br", Sprites.ring(14, 1), theme.border);
        place(br, 0, 0, w, h); imageSetColor(br, theme.border);
    }

    /** Moves the layout cursor (used by absolute-positioned overlays). */
    setCursor(x: number, y: number): void { this.flushLine(); this.L.indent = x; this.L.cursorX = x; this.L.cursorY = y; }
    setRightEdge(x: number): void { this.L.rightEdge = x; }
}

/** Escapes nothing for now — hook for future text processing. */
function GuiText(s: string): string { return s; }
