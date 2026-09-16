/**
 * notifications.ts — toast stack (top-right of the panel).
 *   Notify.success("Saved", "settings written");
 */
import { clamp01, easeOutBack } from "../core/math.js";
import type { Gui, ToastKind } from "./gui.js";

export interface Toast { id: number; kind: ToastKind; title: string; message: string; born: number; duration: number }

let nextId = 1;
const MAX_VISIBLE = 4;

export const Notify = {
    list: [] as Toast[],
    now: 0,
    show(kind: ToastKind, title: string, message = "", seconds = 3.5): number {
        const t: Toast = { id: nextId++, kind, title, message, born: this.now, duration: seconds };
        this.list.push(t);
        if (this.list.length > 12) this.list.shift();
        return t.id;
    },
    info(title: string, message = "", seconds?: number): number { return this.show("info", title, message, seconds); },
    success(title: string, message = "", seconds?: number): number { return this.show("success", title, message, seconds); },
    warn(title: string, message = "", seconds?: number): number { return this.show("warning", title, message, seconds); },
    error(title: string, message = "", seconds?: number): number { return this.show("error", title, message, seconds ?? 6); },
    clear(): void { this.list.length = 0; },

    /** Draws the active toasts inside the current (overlay) layer. */
    draw(gui: Gui, rightX: number, topY: number, width: number, now: number): void {
        this.now = now;
        this.list = this.list.filter(t => now - t.born < t.duration + 0.35);
        const visible = this.list.slice(-MAX_VISIBLE);
        let y = topY;
        for (const t of visible) {
            const age = now - t.born;
            const slide = easeOutBack(clamp01(age / 0.28));
            const fade = age > t.duration ? clamp01(1 - (age - t.duration) / 0.35) : 1;
            const h = t.message ? 58 : 36;
            const x = rightX - width + (1 - slide) * (width + 30);
            gui.toast(t.id, x, y, width, h, t.kind, t.title, t.message, 1 - clamp01(age / t.duration), fade * slide);
            y += h + 8;
        }
    },
};
