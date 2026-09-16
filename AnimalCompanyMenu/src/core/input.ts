/**
 * input.ts — controller state through UnityEngine.XR.InputDevices, polled
 * once per frame, with edge detection (pressed / released this frame).
 */
import type { VRButton } from "../config.js";
import type { V2 } from "./math.js";
import { log } from "./log.js";
import { UE, findMethod, isNull, type VT } from "./unity.js";

export interface HandState {
    valid: boolean;
    trigger: number;      // 0..1
    grip: number;         // 0..1
    triggerBtn: boolean;
    gripBtn: boolean;
    primary: boolean;     // A / X
    secondary: boolean;   // B / Y
    stickClick: boolean;
    menu: boolean;        // left menu button
    stick: V2;
}

const emptyHand = (): HandState => ({
    valid: false, trigger: 0, grip: 0, triggerBtn: false, gripBtn: false,
    primary: false, secondary: false, stickClick: false, menu: false, stick: { x: 0, y: 0 },
});

const XR_LEFT = 4, XR_RIGHT = 5;

export class XRInput {
    left: HandState = emptyHand();
    right: HandState = emptyHand();
    prevLeft: HandState = emptyHand();
    prevRight: HandState = emptyHand();
    /** true while a desktop keyboard is driving the input (no headset). */
    desktop = false;

    private devLeft: VT | null = null;
    private devRight: VT | null = null;
    private nextDeviceRefresh = 0;
    private readonly outBool = Memory.alloc(8);
    private readonly outFloat = Memory.alloc(8);
    private readonly outVec2 = Memory.alloc(16);
    private tryBool: Il2Cpp.Method | null = null;
    private tryFloat: Il2Cpp.Method | null = null;
    private tryVec2: Il2Cpp.Method | null = null;
    private haptic: Il2Cpp.Method | null = null;
    private usages: Record<string, VT> = {};
    private ready = false;
    private initFailed = false;

    private init(): boolean {
        if (this.ready) return true;
        if (this.initFailed) return false;
        try {
            const dev = UE.InputDevice;
            this.tryBool = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<System.Boolean>", "System.Boolean&"]);
            this.tryFloat = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<System.Single>", "System.Single&"]);
            this.tryVec2 = findMethod(dev, "TryGetFeatureValue", ["UnityEngine.XR.InputFeatureUsage<UnityEngine.Vector2>", "UnityEngine.Vector2&"]);
            this.haptic = dev.tryMethod("SendHapticImpulse", 3);
            const cu = UE.CommonUsages;
            for (const n of ["primaryButton", "secondaryButton", "triggerButton", "gripButton", "primary2DAxisClick", "menuButton", "trigger", "grip", "primary2DAxis"]) {
                const f = cu.tryField<VT>(n);
                if (f) this.usages[n] = f.value;
            }
            if (!this.tryBool) throw new Error("TryGetFeatureValue(bool) overload not found");
            this.ready = true;
            log.ok("input: XR InputDevices ready");
            return true;
        } catch (e) {
            this.initFailed = true;
            log.error("input: XR init failed (falling back to desktop keys)", e);
            return false;
        }
    }

    private refreshDevices(now: number): void {
        if (now < this.nextDeviceRefresh) return;
        this.nextDeviceRefresh = now + 1.0;
        try {
            const get = UE.InputDevices.method<VT>("GetDeviceAtXRNode", 1);
            const l = get.invoke(XR_LEFT), r = get.invoke(XR_RIGHT);
            this.devLeft = l.method<boolean>("get_isValid").invoke() ? l : null;
            this.devRight = r.method<boolean>("get_isValid").invoke() ? r : null;
        } catch (e) {
            this.devLeft = this.devRight = null;
        }
    }

    private readBool(dev: VT, usage: string): boolean {
        const u = this.usages[usage];
        if (!u || !this.tryBool) return false;
        this.outBool.writeU8(0);
        this.tryBool.bind(dev).invoke(u, this.outBool);
        return this.outBool.readU8() !== 0;
    }
    private readFloat(dev: VT, usage: string): number {
        const u = this.usages[usage];
        if (!u || !this.tryFloat) return 0;
        this.outFloat.writeFloat(0);
        this.tryFloat.bind(dev).invoke(u, this.outFloat);
        return this.outFloat.readFloat();
    }
    private readVec2(dev: VT, usage: string): V2 {
        const u = this.usages[usage];
        if (!u || !this.tryVec2) return { x: 0, y: 0 };
        this.outVec2.writeFloat(0); this.outVec2.add(4).writeFloat(0);
        this.tryVec2.bind(dev).invoke(u, this.outVec2);
        return { x: this.outVec2.readFloat(), y: this.outVec2.add(4).readFloat() };
    }

    private readHand(dev: VT | null, into: HandState): void {
        if (!dev) { Object.assign(into, emptyHand()); return; }
        into.valid = true;
        into.primary = this.readBool(dev, "primaryButton");
        into.secondary = this.readBool(dev, "secondaryButton");
        into.triggerBtn = this.readBool(dev, "triggerButton");
        into.gripBtn = this.readBool(dev, "gripButton");
        into.stickClick = this.readBool(dev, "primary2DAxisClick");
        into.menu = this.readBool(dev, "menuButton");
        into.trigger = this.readFloat(dev, "trigger");
        into.grip = this.readFloat(dev, "grip");
        into.stick = this.readVec2(dev, "primary2DAxis");
    }

    /** Poll once per frame. */
    poll(now: number): void {
        // rotate buffers
        const pl = this.prevLeft, pr = this.prevRight;
        this.prevLeft = this.left; this.prevRight = this.right;
        this.left = pl; this.right = pr;

        if (!this.init()) { this.pollDesktop(); return; }
        this.refreshDevices(now);
        try {
            this.readHand(this.devLeft, this.left);
            this.readHand(this.devRight, this.right);
        } catch (e) {
            this.devLeft = this.devRight = null;
            this.nextDeviceRefresh = 0;
        }
        this.desktop = !this.left.valid && !this.right.valid;
        if (this.desktop) this.pollDesktop();
    }

    /** Minimal keyboard fallback (new Input System) so the menu can be tested without a headset. */
    private pollDesktop(): void {
        Object.assign(this.left, emptyHand());
        Object.assign(this.right, emptyHand());
        const kb = UE.Keyboard;
        if (!kb) return;
        try {
            const cur = kb.method<Il2Cpp.Object>("get_current").invoke();
            if (isNull(cur)) return;
            const key = (getter: string): boolean => cur.method<Il2Cpp.Object>(getter).invoke().method<boolean>("get_isPressed").invoke();
            this.left.secondary = key("get_tabKey");        // open / close
            this.right.triggerBtn = key("get_enterKey") || key("get_spaceKey"); // click
            this.right.trigger = this.right.triggerBtn ? 1 : 0;
            this.right.stick = { x: 0, y: key("get_upArrowKey") ? 1 : key("get_downArrowKey") ? -1 : 0 };
        } catch { /* ignore */ }
    }

    private state(btn: VRButton, s: { l: HandState; r: HandState }): boolean {
        switch (btn) {
            case "left.trigger": return s.l.triggerBtn || s.l.trigger > 0.6;
            case "left.grip": return s.l.gripBtn || s.l.grip > 0.6;
            case "left.primary": return s.l.primary;
            case "left.secondary": return s.l.secondary;
            case "left.stick": return s.l.stickClick;
            case "left.menu": return s.l.menu;
            case "right.trigger": return s.r.triggerBtn || s.r.trigger > 0.6;
            case "right.grip": return s.r.gripBtn || s.r.grip > 0.6;
            case "right.primary": return s.r.primary;
            case "right.secondary": return s.r.secondary;
            case "right.stick": return s.r.stickClick;
            default: return false;
        }
    }
    isDown(btn: VRButton): boolean { return this.state(btn, { l: this.left, r: this.right }); }
    wasDown(btn: VRButton): boolean { return this.state(btn, { l: this.prevLeft, r: this.prevRight }); }
    wasPressed(btn: VRButton): boolean { return this.isDown(btn) && !this.wasDown(btn); }
    wasReleased(btn: VRButton): boolean { return !this.isDown(btn) && this.wasDown(btn); }
    /** First button that went down this frame (for key binding UI). */
    anyPressed(): VRButton | null {
        const all: VRButton[] = ["left.primary", "left.secondary", "left.trigger", "left.grip", "left.stick", "left.menu",
            "right.primary", "right.secondary", "right.trigger", "right.grip", "right.stick"];
        for (const b of all) if (this.wasPressed(b)) return b;
        return null;
    }
    stick(hand: "left" | "right"): V2 { return hand === "left" ? this.left.stick : this.right.stick; }

    vibrate(hand: "left" | "right", amplitude = 0.3, duration = 0.02): void {
        const dev = hand === "left" ? this.devLeft : this.devRight;
        if (!dev || !this.haptic) return;
        try { this.haptic.bind(dev).invoke(0, amplitude, duration); } catch { /* not supported */ }
    }
}
