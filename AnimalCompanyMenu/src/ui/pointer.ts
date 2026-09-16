/**
 * pointer.ts — turns the pointer hand into a 2D cursor on the panel.
 *   finger: index-finger tip pushes "into" the panel to click (touch-screen feel)
 *   laser : ray from the controller, click with a button
 *   gaze  : head ray (desktop / no controllers), click with trigger or keyboard
 */
import type { Settings } from "../config.js";
import type { XRInput } from "../core/input.js";
import type { Rig } from "../core/hands.js";
import { type V3, type Q, add, sub, dot, mul, normalize, qrot, qinv, qforward, length } from "../core/math.js";
import { log } from "../core/log.js";
import { newGameObject, addComponent, UE, newMaterial, vec3, color as ucolor, setActive, destroy, type Obj } from "../core/unity.js";
import type { PointerState } from "./gui.js";
import { theme } from "./theme.js";

export interface PanelPose { pos: V3; rot: Q; mpu: number; width: number; height: number }

const PRESS_ENGAGE = -0.006;   // finger closer than 6 mm to the surface (or behind) = pressed
const PRESS_RELEASE = -0.018;  // must pull back 18 mm to release
const HOVER_RANGE = 0.12;      // finger considered "over" the panel within 12 cm

export class PointerSource {
    state: PointerState = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
    private latched = false;
    private laserGo: Obj | null = null;
    private laserLr: Obj | null = null;
    private laserVisible = false;
    private laserFailed = false;

    compute(settings: Settings, input: XRInput, rig: Rig, panel: PanelPose, active: boolean): PointerState {
        const prevDown = this.state.down;
        const s: PointerState = { valid: false, x: 0, y: 0, down: false, pressed: false, released: false, depth: 0 };
        const pointerHand = settings.hand === "left" ? "right" : "left";
        const mode = input.desktop ? "gaze" : settings.pointerMode;
        let origin: V3 | null = null, dir: V3 | null = null, tip: V3 | null = null;

        if (active) {
            if (mode === "finger") {
                const h = rig.pose(pointerHand);
                if (h.valid) tip = add(h.pos, qrot(h.rot, { x: settings.fingerOffset.x, y: settings.fingerOffset.y, z: settings.fingerOffset.z }));
            } else if (mode === "laser") {
                const h = rig.pose(pointerHand);
                if (h.valid) { origin = h.pos; dir = qforward(h.rot); }
            } else {
                const h = rig.pose("head");
                if (h.valid) { origin = h.pos; dir = qforward(h.rot); }
            }
        }

        const inv = qinv(panel.rot);
        const toLocal = (world: V3): { x: number; y: number; z: number } => {
            const rel = qrot(inv, sub(world, panel.pos));
            // canvas: +x right, +y up, +z away from the viewer
            return { x: rel.x / panel.mpu + panel.width / 2, y: panel.height / 2 - rel.y / panel.mpu, z: rel.z };
        };
        const inBounds = (x: number, y: number, margin: number): boolean =>
            x >= -margin && x <= panel.width + margin && y >= -margin && y <= panel.height + margin;

        if (tip) {
            const l = toLocal(tip);
            s.depth = l.z;
            if (inBounds(l.x, l.y, 30) && l.z > -HOVER_RANGE && l.z < 0.05) {
                s.valid = true; s.x = l.x; s.y = l.y;
                if (!this.latched && l.z > PRESS_ENGAGE) this.latched = true;
                else if (this.latched && l.z < PRESS_RELEASE) this.latched = false;
                s.down = this.latched && inBounds(l.x, l.y, 4);
            } else {
                this.latched = false;
            }
        } else if (origin && dir) {
            const n = qforward(panel.rot);
            const denom = dot(dir, n);
            let end = add(origin, mul(dir, 1.0));
            if (Math.abs(denom) > 1e-4) {
                const t = dot(sub(panel.pos, origin), n) / denom;
                if (t > 0 && t < 4) {
                    const hit = add(origin, mul(dir, t));
                    const l = toLocal(hit);
                    if (inBounds(l.x, l.y, 30)) {
                        s.valid = true; s.x = l.x; s.y = l.y; s.depth = 0;
                        end = hit;
                        const btn = mode === "gaze" ? "right.trigger" : settings.laserButton;
                        s.down = input.isDown(btn) && inBounds(l.x, l.y, 4);
                    }
                }
            }
            if (mode === "laser") this.updateLaser(origin, end, true);
        }
        if (mode !== "laser" || !active) this.updateLaser(null, null, false);

        s.pressed = s.down && !prevDown;
        s.released = !s.down && prevDown;
        if (!s.valid && prevDown) { s.released = true; }
        this.state = s;
        return s;
    }

    private updateLaser(origin: V3 | null, end: V3 | null, visible: boolean): void {
        if (this.laserFailed) return;
        try {
            if (visible && !this.laserGo) {
                const go = newGameObject("ACMenu.Laser");
                const lr = addComponent(go, UE.LineRenderer);
                lr.method("set_useWorldSpace").invoke(true);
                lr.method("set_positionCount").invoke(2);
                lr.method("set_startWidth").invoke(0.004);
                lr.method("set_endWidth").invoke(0.001);
                const mat = newMaterial(["Universal Render Pipeline/Unlit", "Sprites/Default", "Unlit/Color", "UI/Default"]);
                if (mat) { mat.method("set_color").invoke(ucolor(theme.accent2)); lr.method("set_material").invoke(mat); }
                lr.method("set_startColor").invoke(ucolor(theme.accent2));
                lr.method("set_endColor").invoke(ucolor({ ...theme.accent, a: 0.2 }));
                this.laserGo = go; this.laserLr = lr;
            }
            if (!this.laserGo || !this.laserLr) return;
            if (visible !== this.laserVisible) { setActive(this.laserGo, visible); this.laserVisible = visible; }
            if (visible && origin && end) {
                this.laserLr.method("SetPosition").invoke(0, vec3(origin));
                this.laserLr.method("SetPosition").invoke(1, vec3(end));
            }
        } catch (e) {
            this.laserFailed = true;
            log.warn(`laser visual disabled: ${String(e)}`);
        }
    }

    destroy(): void {
        if (this.laserGo) { destroy(this.laserGo); this.laserGo = null; this.laserLr = null; }
    }

    /** Distance helper for the settings page ("finger is X cm from the panel"). */
    static describeDepth(d: number): string { return `${(Math.abs(d) * 100).toFixed(1)} cm ${d < 0 ? "in front" : "behind"}`; }
}

export const _unused = { length };
