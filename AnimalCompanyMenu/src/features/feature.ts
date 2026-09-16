/**
 * feature.ts — base class + registry for toggleable features.
 *
 * A feature is anything with an on/off state: it gets onEnable / onDisable /
 * onUpdate (every frame, even when the menu is closed) and can draw its own
 * settings widgets. The template ships only harmless examples — your logic
 * goes into subclasses (see features/examples.ts).
 */
import type { Gui } from "../ui/gui.js";
import type { PageContext } from "../pages/page.js";
import { getState, setState } from "../core/prefs.js";
import { log, describe } from "../core/log.js";

export abstract class Feature {
    /** stable id used for persistence — never rename after release */
    abstract readonly id: string;
    abstract readonly name: string;
    readonly description: string = "";
    readonly category: string = "General";
    /** remember on/off across sessions */
    readonly persist: boolean = true;
    /** show the "settings" expander */
    readonly hasSettings: boolean = false;
    /** widget tooltip */
    readonly tooltip: string = "";

    enabled = false;
    private failures = 0;

    onEnable(_ctx: PageContext): void { /* override */ }
    onDisable(_ctx: PageContext): void { /* override */ }
    onUpdate(_dt: number, _ctx: PageContext): void { /* override */ }
    drawSettings(_ui: Gui, _ctx: PageContext): void { /* override */ }

    setEnabled(v: boolean, ctx: PageContext): void {
        if (v === this.enabled) return;
        this.enabled = v;
        try { if (v) this.onEnable(ctx); else this.onDisable(ctx); }
        catch (e) { log.error(`feature ${this.id} ${v ? "enable" : "disable"} failed`, e); this.enabled = false; }
        if (this.persist) setState(`feature.${this.id}.enabled`, this.enabled);
    }
    toggle(ctx: PageContext): void { this.setEnabled(!this.enabled, ctx); }

    /** @internal */
    _update(dt: number, ctx: PageContext): void {
        if (!this.enabled) return;
        try { this.onUpdate(dt, ctx); this.failures = 0; }
        catch (e) {
            if (++this.failures > 30) {
                log.error(`feature ${this.id} disabled after repeated errors: ${describe(e)}`);
                this.setEnabled(false, ctx);
            }
        }
    }
    /** persisted per-feature value helpers */
    get<T>(key: string, def: T): T { return getState(`feature.${this.id}.${key}`, def); }
    set<T>(key: string, value: T): void { setState(`feature.${this.id}.${key}`, value); }
}

const features: Feature[] = [];

export const featureRegistry = {
    all(): Feature[] { return features; },
    register(f: Feature): void {
        const i = features.findIndex(x => x.id === f.id);
        if (i >= 0) features[i] = f; else features.push(f);
    },
    find(id: string): Feature | undefined { return features.find(f => f.id === id); },
    categories(): string[] {
        const seen: string[] = [];
        for (const f of features) if (!seen.includes(f.category)) seen.push(f.category);
        return seen;
    },
    byCategory(c: string): Feature[] { return features.filter(f => f.category === c); },
    enabledCount(): number { return features.filter(f => f.enabled).length; },
    update(dt: number, ctx: PageContext): void { for (const f of features) f._update(dt, ctx); },
    /** Re-applies persisted on/off states (call once after settings are loaded and the menu exists). */
    restore(ctx: PageContext): void {
        for (const f of features) {
            if (f.persist && getState(`feature.${f.id}.enabled`, false)) f.setEnabled(true, ctx);
        }
    },
    disableAll(ctx: PageContext): void { for (const f of features) f.setEnabled(false, ctx); },
};
