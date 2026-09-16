/**
 * hands.ts — where are the player's head and hands?
 *
 * Tries the game-specific providers listed in game/ac.ts, then generic
 * GameObject names, then Camera.main. Re-resolves automatically when a
 * transform dies (scene change, respawn).
 */
import { GAME } from "../game/ac.js";
import { log } from "./log.js";
import type { V3, Q } from "./math.js";
import { Q_IDENTITY } from "./math.js";
import { UE, tryCls, isNull, transformOf, findGameObject, mainCamera, getPosition, getRotation, type Obj } from "./unity.js";

export interface Pose { pos: V3; rot: Q; valid: boolean }
export type Part = "head" | "left" | "right";

export class Rig {
    source = "unresolved";
    private t: Record<Part, Obj | null> = { head: null, left: null, right: null };
    private nextResolve = 0;
    private failures = 0;

    get resolved(): boolean { return !!(this.t.left && this.t.right && this.t.head); }

    /** Attempts to (re)resolve transforms. Cheap when already resolved. */
    resolve(now: number, force = false): boolean {
        if (this.resolved && !force) return true;
        if (now < this.nextResolve && !force) return false;
        this.nextResolve = now + 2.0;

        for (const p of GAME.rigs) {
            try {
                const klass = tryCls(GAME.assembly, p.klass);
                if (!klass) continue;
                const inst = klass.field<Obj>(p.instanceField).value;
                if (isNull(inst)) continue;
                const left = inst.field<Obj>(p.left).value;
                const right = inst.field<Obj>(p.right).value;
                let head: Obj | null = null;
                if ("head" in p && p.head) {
                    head = inst.field<Obj>(p.head).value;
                    if (isNull(head) && "headAlt" in p && p.headAlt) head = inst.field<Obj>(p.headAlt).value;
                } else if ("headComponent" in p && p.headComponent) {
                    const comp = inst.field<Obj>(p.headComponent).value;
                    if (!isNull(comp)) head = transformOf(comp);
                }
                if (isNull(left) || isNull(right)) continue;
                this.t.left = left; this.t.right = right;
                this.t.head = !isNull(head) ? head : this.headFallback();
                this.source = p.name;
                log.ok(`rig: hands from ${p.name}${this.t.head ? "" : " (no head yet)"}`);
                return this.resolved;
            } catch (e) {
                log.warn(`rig: provider ${p.name} failed: ${String(e)}`);
            }
        }

        // generic names
        const findFirst = (names: string[]): Obj | null => {
            for (const n of names) {
                const go = findGameObject(n);
                if (go) return transformOf(go);
            }
            return null;
        };
        const l = findFirst(GAME.genericNames.left), r = findFirst(GAME.genericNames.right);
        if (l && r) {
            this.t.left = l; this.t.right = r;
            this.t.head = findFirst(GAME.genericNames.head) ?? this.headFallback();
            this.source = "GameObject names";
            log.ok("rig: hands from generic GameObject names");
            return this.resolved;
        }
        if (++this.failures % 10 === 1) log.warn("rig: could not find hand transforms yet (are you in-game?)");
        return false;
    }

    private headFallback(): Obj | null {
        try {
            const cm = tryCls(GAME.assembly, GAME.cameraManager.klass);
            if (cm) {
                const cam = cm.method<Obj>(GAME.cameraManager.getter).invoke();
                if (!isNull(cam)) return transformOf(cam);
            }
        } catch { /* ignore */ }
        try {
            const cam = mainCamera();
            if (cam) return transformOf(cam);
        } catch { /* ignore */ }
        return null;
    }

    pose(part: Part): Pose {
        const t = this.t[part];
        if (!t) return { pos: { x: 0, y: 0, z: 0 }, rot: { ...Q_IDENTITY }, valid: false };
        try {
            return { pos: getPosition(t), rot: getRotation(t), valid: true };
        } catch {
            // destroyed transform → force re-resolve next frame
            this.t[part] = null;
            this.nextResolve = 0;
            return { pos: { x: 0, y: 0, z: 0 }, rot: { ...Q_IDENTITY }, valid: false };
        }
    }

    transform(part: Part): Obj | null { return this.t[part]; }
    invalidate(): void { this.t = { head: null, left: null, right: null }; this.nextResolve = 0; }
}
