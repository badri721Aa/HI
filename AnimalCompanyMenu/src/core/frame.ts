/**
 * frame.ts — runs our code on Unity's main thread once per frame by hooking a
 * method the game already calls every frame. Everything UI-related MUST run
 * inside this callback (Unity API is not thread-safe).
 */
import { GAME } from "../game/ac.js";
import { log, describe } from "./log.js";
import { tryCls } from "./unity.js";

export type FrameCallback = (dt: number, now: number) => void;

const callbacks: FrameCallback[] = [];
let hooked: Il2Cpp.Method | null = null;
let hookName = "none";
let lastNow = 0;
let errorStreak = 0;
let lastErrorMsg = "";
let ticking = false;

export function onFrame(cb: FrameCallback): void { callbacks.push(cb); }
export function frameHookName(): string { return hookName; }

function tick(): void {
    if (ticking) return;             // re-entrancy guard
    ticking = true;
    const now = Date.now() / 1000;
    let dt = lastNow > 0 ? now - lastNow : 1 / 72;
    if (dt > 0.25) dt = 0.25;        // hitch protection
    lastNow = now;
    for (const cb of callbacks) {
        try {
            cb(dt, now);
            errorStreak = 0;
        } catch (e) {
            errorStreak++;
            const msg = describe(e);
            if (msg !== lastErrorMsg || errorStreak % 300 === 1) {
                lastErrorMsg = msg;
                log.error(`frame callback failed (${errorStreak}x)`, e);
            }
        }
    }
    ticking = false;
}

export function installFrameHook(): boolean {
    for (const c of GAME.frameHooks) {
        const klass = tryCls(c.assembly, c.klass);
        if (!klass) continue;
        const m = klass.tryMethod(c.method, 0);
        if (!m || m.virtualAddress.isNull()) continue;
        try {
            const name = c.method;
            m.implementation = function (this: Il2Cpp.Class | Il2Cpp.Object | Il2Cpp.ValueType) {
                const r = this.method(name, 0).invoke();
                tick();
                return r;
            };
            hooked = m;
            hookName = `${c.klass}.${c.method}`;
            log.ok(`frame hook installed on ${hookName}`);
            return true;
        } catch (e) {
            log.warn(`could not hook ${c.klass}.${c.method}: ${describe(e)}`);
        }
    }
    log.error("no frame hook candidate matched — edit GAME.frameHooks in src/game/ac.ts");
    return false;
}

export function removeFrameHook(): void {
    if (hooked) {
        try { hooked.revert(); } catch { /* ignore */ }
        hooked = null;
        hookName = "none";
    }
    callbacks.length = 0;
}
