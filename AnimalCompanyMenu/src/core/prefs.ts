/**
 * prefs.ts — settings persistence through Unity's PlayerPrefs (works on PC and
 * Quest without touching the file system).
 */
import { DEFAULT_SETTINGS, MENU_INFO, type Settings } from "../config.js";
import { log } from "./log.js";
import { prefsGet, prefsSet } from "./unity.js";

export const settings: Settings = clone(DEFAULT_SETTINGS);
/** Free-form bag for feature state: `featureState["MyFeature.speed"] = 3`. Persisted with the settings. */
export const featureState: Record<string, unknown> = {};

let dirty = false;
let lastFlush = 0;

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

function mergeInto(target: Record<string, unknown>, src: Record<string, unknown>): void {
    for (const k of Object.keys(src)) {
        const s = src[k], t = target[k];
        if (s && typeof s === "object" && !Array.isArray(s) && t && typeof t === "object") {
            mergeInto(t as Record<string, unknown>, s as Record<string, unknown>);
        } else if (k in target || target === featureState) {
            target[k] = s;
        }
    }
}

export function loadSettings(): void {
    try {
        const raw = prefsGet(MENU_INFO.prefsKey, "");
        if (!raw) { log.info("prefs: no saved settings, using defaults"); return; }
        const parsed = JSON.parse(raw) as { settings?: Record<string, unknown>; features?: Record<string, unknown> };
        if (parsed.settings) mergeInto(settings as unknown as Record<string, unknown>, parsed.settings);
        if (parsed.features) mergeInto(featureState, parsed.features);
        log.ok("prefs: settings loaded");
    } catch (e) {
        log.error("prefs: load failed", e);
    }
}

export function saveSettings(): void {
    try {
        prefsSet(MENU_INFO.prefsKey, JSON.stringify({ settings, features: featureState }));
        dirty = false;
        lastFlush = Date.now();
    } catch (e) {
        log.error("prefs: save failed", e);
    }
}

export function markDirty(): void { dirty = true; }

/** Call once per frame: writes at most every 2 s. */
export function flushIfDirty(): void {
    if (dirty && Date.now() - lastFlush > 2000) saveSettings();
}

export function resetSettings(): void {
    const fresh = clone(DEFAULT_SETTINGS);
    for (const k of Object.keys(fresh) as (keyof Settings)[]) (settings as unknown as Record<string, unknown>)[k] = fresh[k];
    markDirty();
}

/** Typed accessors for feature state. */
export function getState<T>(key: string, def: T): T {
    return (key in featureState ? featureState[key] : def) as T;
}
export function setState<T>(key: string, value: T): void {
    featureState[key] = value;
    markDirty();
}
