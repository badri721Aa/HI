/**
 * menu.ts — MenuCore: builds the world-space panel, follows the hand, and runs
 * the per-frame draw (title bar, sidebar, page content, footer, overlays).
 */
import { MENU_INFO, PANEL } from "../config.js";
import { settings, loadSettings, saveSettings, flushIfDirty } from "../core/prefs.js";
import { log, describe } from "../core/log.js";
import { XRInput } from "../core/input.js";
import { Rig } from "../core/hands.js";
import { installFrameHook, onFrame, removeFrameHook, frameHookName } from "../core/frame.js";
import { currentExportStrategy } from "../il2cpp-exports.js";
import {
    type V3, type Q, add, mul, sub, normalize, cross, dot, length, qrot, qlook, qmul, qeuler, qnlerp, qforward, lerpV3, damp, lerp,
    V3_UP, V3_RIGHT, Q_IDENTITY, easeOutBack, clamp, clamp01, toHex,
} from "../core/math.js";
import {
    UE, newGameObject, addComponent, getComponent, transformOf, dontDestroyOnLoad, destroy, setActive,
    setPosition, setRotation, setLocalScale, rtSetSizeDelta, rtSetPivot, type Obj,
} from "../core/unity.js";
import { Gui, newScroll, type ScrollState, type PointerState } from "./gui.js";
import { Sprites } from "./sprites.js";
import { theme, applyTheme } from "./theme.js";
import {
    createRect, createImage, createText, initTopLeft, place, setVisible, imageSetColor, imageSetSprite, textSet, textSetColor,
    addCanvasGroup, groupSetAlpha, addMask, initTextBackend, textBackend, type ImageEl, type TextEl, type RectEl, type GroupEl,
} from "./elements.js";
import { PointerSource } from "./pointer.js";
import { Notify } from "./notifications.js";
import { drawKeyboard } from "./keyboard.js";
import { allPages, type PageContext, type MenuActions } from "../pages/page.js";
import { featureRegistry } from "../features/feature.js";
import { drawFeatureCategory } from "../pages/features.js";

type View = { kind: "page"; id: string } | { kind: "cat"; name: string };

const W = PANEL.width, H = PANEL.height, TH = PANEL.titleHeight, SW = PANEL.sidebarWidth, FH = PANEL.footerHeight, PAD = PANEL.padding;
const VX = SW + 1, VY = TH, VW = W - SW - 1, VH = H - TH - FH;

interface Chrome {
    shadow: ImageEl; bg: ImageEl; border: ImageEl; titleClip: RectEl; titleBg: ImageEl; titleLine: ImageEl;
    divider: ImageEl; footerLine: ImageEl; scrollTrack: ImageEl; scrollThumb: ImageEl; statusDot: ImageEl; sidebarBg: ImageEl;
}
interface Hud { go: Obj; t: Obj; group: GroupEl; bg: ImageEl; border: ImageEl; time: TextEl; info: TextEl; shown: boolean }

export class Menu {
    readonly input = new XRInput();
    readonly rig = new Rig();
    readonly pointer = new PointerSource();
    readonly gui: Gui;

    private built = false;
    private fatal = false;
    private buildAttempts = 0;
    private nextBuildTry = 0;
    private root: Obj | null = null;
    private panelGo!: Obj;
    private panelT!: Obj;
    private panelGroup!: GroupEl;
    private chrome!: Chrome;
    private layers!: { title: Obj; sidebar: Obj; content: Obj; footer: Obj; overlay: Obj };
    private hud: Hud | null = null;

    visible = false;
    private openT = 0;
    private panelActive = false;
    private lastScale = -1;
    private pos: V3 = { x: 0, y: 0, z: 0 };
    private rot: Q = { ...Q_IDENTITY };
    private poseInit = false;
    private view: View | null = null;
    private scrolls = new Map<string, ScrollState>();
    private fpsEma = 72;
    private startedAt = Date.now() / 1000;
    private openedAt = 0;
    private palmTimer = 0;
    private holdGrace = 0;
    private lastHover = 0;
    private lastPtr: PointerState = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
    private now = 0;
    private dt = 1 / 72;
    private pageError = "";
    private readonly ctx: PageContext;

    constructor() {
        this.gui = new Gui({
            settings,
            input: this.input,
            haptic: (kind) => {
                if (!settings.haptics) return;
                const hand = settings.hand === "left" ? "right" : "left";
                if (kind === "hover") {
                    if (this.now - this.lastHover < 0.05) return;
                    this.lastHover = this.now;
                    this.input.vibrate(hand, 0.12, 0.01);
                } else this.input.vibrate(hand, 0.5, 0.03);
            },
        });
        const self = this;
        const actions: MenuActions = {
            close: () => self.setVisible(false),
            goTo: (id: string) => {
                if (id.startsWith("cat:")) { self.view = { kind: "cat", name: id.slice(4) }; return; }
                if (allPages().some(p => p.id === id)) self.view = { kind: "page", id };
            },
            unload: () => self.unload(),
            rebuild: () => self.rebuild(),
            get pageCount() { return allPages().length + featureRegistry.categories().length; },
            get openedAt() { return self.openedAt; },
            get fps() { return self.fpsEma; },
            get frameHook() { return frameHookName(); },
            get exportStrategy() { return currentExportStrategy(); },
            get textBackend() { return textBackend.kind; },
            get pointerDepth() { return self.lastPtr.valid ? self.lastPtr.depth : 0; },
            get startedAt() { return self.startedAt; },
        };
        this.ctx = {
            ui: this.gui, settings, input: this.input, rig: this.rig, notify: Notify, menu: actions,
            get now() { return self.now; }, get dt() { return self.dt; },
        };
    }

    /** Installs the frame hook; the UI itself is built on the first frame (Unity main thread). */
    start(): void {
        onFrame((dt, now) => this.frame(dt, now));
        if (!installFrameHook()) this.fatal = true;
    }

    // ── build ───────────────────────────────────────────────────────────────
    private tryBuild(now: number): void {
        if (now < this.nextBuildTry) return;
        try {
            loadSettings();
            applyTheme(settings.theme);
            this.build();
            this.built = true;
            featureRegistry.restore(this.ctx);
            log.ok(`menu built (${allPages().length} pages, ${featureRegistry.all().length} features) — open with ${settings.openMode === "palm" ? "palm gesture" : settings.openButton}`);
            Notify.success(`${MENU_INFO.name} ready`, `${settings.openMode === "palm" ? "turn your palm toward you" : "press " + settings.openButton} to open`);
        } catch (e) {
            this.buildAttempts++;
            this.nextBuildTry = now + 3;
            log.error(`menu build failed (attempt ${this.buildAttempts})`, e);
            if (this.buildAttempts >= 6) { this.fatal = true; log.error("giving up — check the errors above"); }
        }
    }

    private build(): void {
        initTextBackend();
        Sprites.warmup([theme.radius, theme.radius - 4, theme.widgetRadius, 11, 8, 6, 3, 2]);

        const root = newGameObject("ACMenu");
        dontDestroyOnLoad(root);
        this.root = root;
        const rootT = transformOf(root);

        const panelGo = newGameObject("Panel", rootT);
        const canvas = addComponent(panelGo, UE.Canvas);
        canvas.method("set_renderMode").invoke(2 /* WorldSpace */);
        canvas.method("set_sortingOrder").invoke(30000);
        const scaler = addComponent(panelGo, UE.CanvasScaler);
        scaler.method("set_dynamicPixelsPerUnit").invoke(3);
        const panelRt = getComponent(panelGo, UE.RectTransform)!;
        rtSetSizeDelta(panelRt, W, H);
        rtSetPivot(panelRt, 0.5, 0.5);
        this.panelGroup = addCanvasGroup(panelGo);
        this.panelGo = panelGo;
        this.panelT = transformOf(panelGo);
        const P = this.panelT;

        const img = (name: string, parent: Obj, sprite: Obj | null, c = theme.bg, sliced = true): ImageEl => {
            const e = createImage(parent, name, sprite, c, sliced); initTopLeft(e); return e;
        };
        const rect = (name: string, parent: Obj, x: number, y: number, w: number, h: number): RectEl => {
            const e = createRect(parent, name); initTopLeft(e); place(e, x, y, w, h); return e;
        };

        const shadow = img("Shadow", P, Sprites.shadow(theme.radius, 22), theme.shadow); place(shadow, -18, -14, W + 36, H + 40);
        const bg = img("Bg", P, Sprites.rounded(theme.radius), theme.bg); place(bg, 0, 0, W, H);
        const titleClip = rect("TitleClip", P, 0, 0, W, TH); addMask(titleClip.go);
        const titleBg = img("TitleBg", transformOf(titleClip.go), Sprites.rounded(theme.radius), theme.titleBg); place(titleBg, 0, 0, W, H);
        const titleLine = img("TitleLine", P, Sprites.gradientH(), theme.accent, false); place(titleLine, 0, TH - 1, W, 1);
        const sidebarBg = img("SidebarBg", P, Sprites.white(), theme.sidebarBg, false); place(sidebarBg, 0, TH, SW, VH);
        const sidebar = rect("Sidebar", P, 0, TH, SW, VH);
        const divider = img("Divider", P, Sprites.white(), theme.border, false); place(divider, SW, TH + 12, 1, VH - 24);
        const viewport = rect("Viewport", P, VX, VY, VW, VH); addMask(viewport.go);
        const content = rect("Content", transformOf(viewport.go), 0, 0, VW, 10);
        const footer = rect("Footer", P, 0, H - FH, W, FH);
        const footerLine = img("FooterLine", P, Sprites.white(), theme.border, false); place(footerLine, 14, H - FH, W - 28, 1);
        const scrollTrack = img("ScrollTrack", P, Sprites.rounded(2), theme.track); place(scrollTrack, W - 8, VY + 8, 3, VH - 16);
        const scrollThumb = img("ScrollThumb", P, Sprites.rounded(2), theme.accent); place(scrollThumb, W - 8, VY + 8, 3, 40);
        const statusDot = img("StatusDot", P, Sprites.circle(), theme.success, false); place(statusDot, 16, H - FH + 9, 8, 8);
        const title = rect("Title", P, 0, 0, W, TH);
        const border = img("Border", P, Sprites.ring(theme.radius, 1), theme.border); place(border, 0, 0, W, H);
        const overlay = rect("Overlay", P, 0, 0, W, H);

        this.chrome = { shadow, bg, border, titleClip, titleBg, titleLine, divider, footerLine, scrollTrack, scrollThumb, statusDot, sidebarBg };
        this.layers = {
            title: transformOf(title.go), sidebar: transformOf(sidebar.go), content: transformOf(content.go),
            footer: transformOf(footer.go), overlay: transformOf(overlay.go),
        };
        this.buildHud(rootT);
        setActive(panelGo, false);
        this.panelActive = false;
        this.gui.reset();
    }

    private buildHud(rootT: Obj): void {
        try {
            const go = newGameObject("WristHud", rootT);
            const canvas = addComponent(go, UE.Canvas);
            canvas.method("set_renderMode").invoke(2);
            canvas.method("set_sortingOrder").invoke(30000);
            const scaler = addComponent(go, UE.CanvasScaler);
            scaler.method("set_dynamicPixelsPerUnit").invoke(3);
            const rt = getComponent(go, UE.RectTransform)!;
            rtSetSizeDelta(rt, 220, 64); rtSetPivot(rt, 0.5, 0.5);
            const t = transformOf(go);
            const group = addCanvasGroup(go);
            const bg = createImage(t, "Bg", Sprites.rounded(14), theme.bg); initTopLeft(bg); place(bg, 0, 0, 220, 64);
            const border = createImage(t, "Border", Sprites.ring(14, 1), theme.border); initTopLeft(border); place(border, 0, 0, 220, 64);
            const time = createText(t, "Time", "", 22, theme.text, "center", "middle", true); initTopLeft(time); place(time, 0, 4, 220, 34);
            const info = createText(t, "Info", "", 11, theme.textDim, "center", "middle"); initTopLeft(info); place(info, 0, 36, 220, 22);
            setLocalScale(t, { x: PANEL.metersPerUnit, y: PANEL.metersPerUnit, z: PANEL.metersPerUnit });
            setActive(go, false);
            this.hud = { go, t, group, bg, border, time, info, shown: false };
        } catch (e) {
            log.warn(`wrist HUD disabled: ${describe(e)}`);
            this.hud = null;
        }
    }

    // ── frame ───────────────────────────────────────────────────────────────
    private frame(dt: number, now: number): void {
        if (this.fatal) return;
        this.now = now; this.dt = dt;
        if (!this.built) { this.tryBuild(now); if (!this.built) return; }

        this.input.poll(now);
        this.rig.resolve(now);
        this.fpsEma = lerp(this.fpsEma, 1 / Math.max(dt, 1e-3), 0.05);
        Notify.now = now;
        featureRegistry.update(dt, this.ctx);
        this.handleOpenInput(dt);
        this.updateHud();

        // open / close animation
        const target = this.visible ? 1 : 0;
        this.openT = lerp(this.openT, target, damp(target ? 11 : 16, dt));
        if (!this.visible && this.openT < 0.02) {
            if (this.panelActive) { setActive(this.panelGo, false); this.panelActive = false; }
            this.openT = 0;
            return;
        }
        if (!this.panelActive) { setActive(this.panelGo, true); this.panelActive = true; }

        this.follow(dt);
        const mpu = PANEL.metersPerUnit * settings.scale;
        const s = Math.max(0.0005, mpu * easeOutBack(this.openT));
        if (Math.abs(s - this.lastScale) > 1e-6) { setLocalScale(this.panelT, { x: s, y: s, z: s }); this.lastScale = s; }
        groupSetAlpha(this.panelGroup, clamp01(this.openT * 1.6));

        const interactive = this.openT > 0.85 && this.visible;
        const ptr = this.pointer.compute(settings, this.input, this.rig, { pos: this.pos, rot: this.rot, mpu, width: W, height: H }, interactive);
        this.lastPtr = ptr;

        const gui = this.gui;
        gui.pointerBlocked = gui.keyboard.open;
        gui.beginFrame(ptr, dt, now);
        this.drawTitle();
        this.drawSidebar();
        this.drawContent(dt);
        this.drawFooter();
        this.drawOverlay(ptr);
        gui.endFrame();
        this.styleChrome();
        flushIfDirty();
    }

    private styleChrome(): void {
        const c = this.chrome;
        imageSetColor(c.bg, theme.bg); imageSetColor(c.titleBg, theme.titleBg); imageSetColor(c.border, theme.border);
        imageSetSprite(c.titleLine, theme.flat ? Sprites.white() : Sprites.gradientH(), false);
        imageSetColor(c.titleLine, theme.flat ? theme.border : theme.accent); imageSetColor(c.divider, theme.border); imageSetColor(c.footerLine, theme.border);
        imageSetColor(c.shadow, theme.shadow); imageSetColor(c.scrollTrack, theme.track);
        imageSetColor(c.statusDot, this.rig.resolved ? theme.success : theme.warning);
        imageSetColor(c.sidebarBg, theme.flat ? theme.sidebarBg : { ...theme.sidebarBg, a: 0 });
    }

    // ── open / close ────────────────────────────────────────────────────────
    setVisible(v: boolean): void {
        if (v === this.visible) return;
        this.visible = v;
        if (v) { this.openedAt = this.now; this.poseInit = false; }
        else { this.gui.keyboard.open = false; saveSettings(); }
    }

    private handleOpenInput(dt: number): void {
        const inp = this.input;
        switch (settings.openMode) {
            case "toggle":
                if (inp.wasPressed(settings.openButton)) this.setVisible(!this.visible);
                break;
            case "hold":
                if (inp.isDown(settings.openButton)) { this.holdGrace = 0.15; this.setVisible(true); }
                else { this.holdGrace -= dt; if (this.holdGrace <= 0) this.setVisible(false); }
                break;
            case "palm": {
                const hand = this.rig.pose(settings.hand), head = this.rig.pose("head");
                if (hand.valid && head.valid) {
                    const palm = qrot(hand.rot, settings.hand === "left" ? V3_RIGHT : mul(V3_RIGHT, -1));
                    const facing = dot(palm, normalize(sub(head.pos, hand.pos)));
                    this.palmTimer = clamp(this.palmTimer + (facing > settings.palmThreshold ? dt : -dt), 0, 0.6);
                    if (!this.visible && this.palmTimer > 0.2) this.setVisible(true);
                    if (this.visible && this.palmTimer <= 0) this.setVisible(false);
                }
                // desktop fallback still toggles with the bound key
                if (inp.desktop && inp.wasPressed(settings.openButton)) this.setVisible(!this.visible);
                break;
            }
        }
    }

    // ── hand following ──────────────────────────────────────────────────────
    private targetPose(): { pos: V3; rot: Q } | null {
        const hand = this.rig.pose(settings.hand);
        if (!hand.valid) {
            // no hands (desktop): park it in front of the head
            const head = this.rig.pose("head");
            if (!head.valid) return null;
            const fwd = qforward(head.rot);
            const pos = add(head.pos, mul(fwd, 0.6));
            return { pos, rot: qlook(fwd, V3_UP) };
        }
        const head = this.rig.pose("head");
        const off = settings.offset;
        if (settings.followMode === "float") {
            const headPos = head.valid ? head.pos : add(hand.pos, { x: 0, y: 0.3, z: -0.5 });
            let toHead = sub(headPos, hand.pos); toHead = { x: toHead.x, y: 0, z: toHead.z };
            const fwd = length(toHead) > 1e-3 ? normalize(toHead) : qforward(hand.rot);
            const right = normalize(cross(V3_UP, fwd));
            const pos = add(add(add(hand.pos, mul(right, off.x)), mul(V3_UP, off.y)), mul(fwd, off.z));
            const away = normalize(sub(pos, headPos));
            return { pos, rot: qlook(length(away) > 1e-3 ? away : fwd, V3_UP) };
        }
        const pos = add(hand.pos, qrot(hand.rot, { x: off.x, y: off.y, z: off.z }));
        const base = qlook(settings.hand === "left" ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
        const ro = settings.rotationOffset;
        const rot = qmul(qmul(hand.rot, qeuler(ro.x, ro.y, ro.z)), base);
        return { pos, rot };
    }

    private follow(dt: number): void {
        const t = this.targetPose();
        if (!t) return;
        if (!this.poseInit) { this.pos = t.pos; this.rot = t.rot; this.poseInit = true; }
        else {
            const k = damp(lerp(45, 7, settings.smoothing), dt);
            this.pos = lerpV3(this.pos, t.pos, k);
            this.rot = qnlerp(this.rot, t.rot, k);
        }
        setPosition(this.panelT, this.pos);
        setRotation(this.panelT, this.rot);
    }

    private updateHud(): void {
        const h = this.hud;
        if (!h) return;
        const show = settings.wristHud && !this.visible && this.openT < 0.05 && this.rig.resolved;
        if (show !== h.shown) { setActive(h.go, show); h.shown = show; }
        if (!show) return;
        const hand = this.rig.pose(settings.hand), head = this.rig.pose("head");
        if (!hand.valid) return;
        const pos = add(hand.pos, mul(V3_UP, 0.05));
        const away = head.valid ? normalize(sub(pos, head.pos)) : qforward(hand.rot);
        setPosition(h.t, pos);
        setRotation(h.t, qlook(away, V3_UP));
        const palm = qrot(hand.rot, settings.hand === "left" ? V3_RIGHT : mul(V3_RIGHT, -1));
        const facing = head.valid ? dot(palm, normalize(sub(head.pos, hand.pos))) : 0;
        groupSetAlpha(h.group, clamp01(0.25 + facing));
        textSet(h.time, clock());
        textSet(h.info, `${settings.showFps ? Math.round(this.fpsEma) + " fps · " : ""}${settings.openMode === "palm" ? "palm up to open" : settings.openButton + " opens menu"}`);
        imageSetColor(h.bg, theme.bg); imageSetColor(h.border, theme.border); textSetColor(h.time, theme.text); textSetColor(h.info, theme.textDim);
    }

    // ── views ───────────────────────────────────────────────────────────────
    /** Everything the sidebar lists, in order: feature categories, then pages. */
    private entries(): Array<{ view: View; title: string; icon: string }> {
        const out: Array<{ view: View; title: string; icon: string }> = [];
        for (const c of featureRegistry.categories()) out.push({ view: { kind: "cat", name: c }, title: c, icon: "" });
        for (const p of allPages()) out.push({ view: { kind: "page", id: p.id }, title: p.title, icon: p.icon });
        return out;
    }
    private sameView(a: View | null, b: View): boolean {
        return !!a && a.kind === b.kind && (a.kind === "cat" ? a.name === (b as { name: string }).name : a.id === (b as { id: string }).id);
    }
    private currentView(): View | null {
        const all = this.entries();
        if (all.length === 0) return null;
        if (!this.view || !all.some(e => this.sameView(this.view, e.view))) this.view = all[0].view;
        return this.view;
    }
    private viewKey(v: View): string { return v.kind === "cat" ? `cat:${v.name}` : `page:${v.id}`; }
    private viewTitle(v: View): string { return v.kind === "cat" ? v.name : (allPages().find(p => p.id === v.id)?.title ?? v.id); }

    // ── drawing ─────────────────────────────────────────────────────────────
    private drawTitle(): void {
        const gui = this.gui;
        gui.beginLayer("title", this.layers.title, 0, 0, W, { x: 0, y: 0, w: W, h: TH });
        gui.setCursor(16, 7);
        gui.setNextWidth(260);
        gui.label(`<b>${MENU_INFO.name}</b>  <size=11><color=${toHex(theme.accent2)}>${MENU_INFO.tagline}</color></size>`, { size: theme.titleSize, height: 32 });
        let x = W - 44;
        if (settings.showFps) {
            x -= 58; gui.setCursor(x, 7); gui.setNextWidth(56);
            gui.label(`${Math.round(this.fpsEma)} <size=10>FPS</size>`, { size: theme.smallFontSize, color: theme.textDim, align: "right", height: 32 });
        }
        if (settings.showClock) {
            x -= 60; gui.setCursor(x, 7); gui.setNextWidth(56);
            gui.label(clock(), { size: theme.smallFontSize + 1, color: theme.textDim, align: "right", height: 32, bold: true });
        }
        gui.setCursor(W - 40, 8);
        if (gui.iconButton("close", "close", 30)) this.setVisible(false);
        gui.endLayer();
    }

    private drawSidebar(): void {
        const gui = this.gui;
        const cur = this.currentView();
        gui.beginLayer("sidebar", this.layers.sidebar, 0, TH, SW, { x: 0, y: TH, w: SW, h: VH });
        gui.setCursor(8, 8); gui.setRightEdge(SW - 8);
        let lastKind: string | null = null;
        for (const e of this.entries()) {
            if (lastKind && lastKind !== e.view.kind) gui.separator();
            lastKind = e.view.kind;
            if (gui.sidebarItem(e.title, this.sameView(cur, e.view), theme.flat ? "" : e.icon)) this.view = e.view;
        }
        gui.setCursor(8, VH - 26); gui.setNextWidth(SW - 16);
        gui.label(`${settings.hand === "left" ? "L" : "R"} hand · ${settings.pointerMode}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "center", height: 20 });
        gui.endLayer();
    }

    private drawContent(dt: number): void {
        const gui = this.gui;
        const view = this.currentView();
        if (!view) return;
        const key = this.viewKey(view);
        let sc = this.scrolls.get(key);
        if (!sc) { sc = newScroll(); this.scrolls.set(key, sc); }
        const stick = this.input.stick(settings.hand === "left" ? "right" : "left");
        if (Math.abs(stick.y) > 0.25) gui.scrollBy(sc, -stick.y * 800 * dt);

        gui.beginLayer(`content:${key}`, this.layers.content, VX, VY, VW, { x: VX, y: VY, w: VW, h: VH }, sc);
        gui.setCursor(PAD, PAD); gui.setRightEdge(VW - PAD - 8);
        gui.pushId(key);
        try {
            if (view.kind === "cat") drawFeatureCategory(this.ctx, view.name);
            else allPages().find(p => p.id === view.id)?.draw(this.ctx);
            this.pageError = "";
        } catch (e) {
            const msg = describe(e);
            if (msg !== this.pageError) { this.pageError = msg; log.error(`view "${key}" threw`, e); }
            gui.text(`page error: ${msg.split("\n")[0]}`, theme.danger);
        }
        gui.popId();
        gui.spacing(PAD);
        gui.endLayer();

        const c = this.chrome;
        if (sc.contentH > sc.viewH + 1) {
            const trackH = VH - 16;
            const thumbH = Math.max(24, trackH * sc.viewH / sc.contentH);
            const y = VY + 8 + (trackH - thumbH) * clamp01(sc.scroll / Math.max(1, sc.contentH - sc.viewH));
            setVisible(c.scrollTrack, true); setVisible(c.scrollThumb, true);
            place(c.scrollThumb, W - 8, y, 3, thumbH);
            imageSetColor(c.scrollThumb, sc.dragging || Math.abs(sc.velocity) > 1 ? theme.accent2 : theme.accent);
        } else { setVisible(c.scrollTrack, false); setVisible(c.scrollThumb, false); }
    }

    private drawFooter(): void {
        const gui = this.gui;
        const view = this.currentView();
        const all = this.entries();
        const idx = view ? all.findIndex(e => this.sameView(view, e.view)) : -1;
        gui.beginLayer("footer", this.layers.footer, 0, H - FH, W, { x: 0, y: H - FH, w: W, h: FH });
        gui.setCursor(30, 2); gui.setNextWidth(200);
        gui.label(this.rig.resolved ? this.rig.source : "waiting for player…", { size: theme.smallFontSize - 1, color: theme.textMuted, height: 22 });
        gui.setCursor(W / 2 - 80, 2); gui.setNextWidth(160);
        gui.label(this.input.desktop ? "keyboard mode" : `pointer: ${settings.pointerMode}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "center", height: 22 });
        gui.setCursor(W - 160, 2); gui.setNextWidth(146);
        gui.label(`${view ? this.viewTitle(view) : ""}  ${idx + 1}/${all.length}`, { size: theme.smallFontSize - 1, color: theme.textMuted, align: "right", height: 22 });
        gui.endLayer();
    }

    private drawOverlay(ptr: PointerState): void {
        const gui = this.gui;
        gui.beginLayer("overlay", this.layers.overlay, 0, 0, W, { x: 0, y: 0, w: W, h: H }, null, true);
        Notify.draw(gui, W - 14, TH + 10, 250, this.now);
        const tt = gui.tooltipReq;
        if (tt) {
            const tw = Math.min(260, tt.text.length * 8 + 24);
            const x = clamp(tt.rect.x + tt.rect.w / 2 - tw / 2, 8, W - tw - 8);
            const y = tt.rect.y - 36 < TH ? tt.rect.y + tt.rect.h + 4 : tt.rect.y - 36;
            gui.tooltipBubble(tt.text, x, y, tw);
        }
        drawKeyboard(gui, W, H);
        if (ptr.valid) {
            const finger = settings.pointerMode === "finger" && !this.input.desktop;
            const size = finger ? clamp(7 + (-ptr.depth) * 140, 7, 22) : 9;
            gui.cursor(ptr.x, ptr.y, size, ptr.down ? 1 : 0.85);
        }
        gui.endLayer();
    }

    // ── lifecycle ──────────────────────────────────────────────────────────
    rebuild(): void {
        log.info("rebuilding menu…");
        try { this.gui.reset(); } catch { /* ignore */ }
        if (this.root) { destroy(this.root); this.root = null; }
        this.built = false; this.nextBuildTry = 0; this.buildAttempts = 0; this.hud = null; this.lastScale = -1;
    }

    unload(): void {
        log.info("unloading menu…");
        try { saveSettings(); } catch { /* ignore */ }
        try { featureRegistry.disableAll(this.ctx); } catch { /* ignore */ }
        removeFrameHook();
        try { this.gui.reset(); } catch { /* ignore */ }
        this.pointer.destroy();
        if (this.root) { destroy(this.root); this.root = null; }
        this.built = false; this.fatal = true;
        log.ok("menu unloaded — detach Frida or re-run the script to load again");
    }
}

function clock(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
