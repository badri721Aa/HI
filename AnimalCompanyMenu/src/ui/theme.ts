/**
 * theme.ts — colors & metrics. ImGui-style dark themes with a two-color accent
 * gradient. Add your own preset to THEMES and it shows up in the Theme page.
 */
import { hex, type RGBA } from "../core/math.js";

export interface Theme {
    name: string;
    /** window background */
    bg: RGBA;
    /** cards / widgets */
    surface: RGBA;
    surface2: RGBA;
    border: RGBA;
    shadow: RGBA;
    titleBg: RGBA;
    text: RGBA;
    textDim: RGBA;
    textMuted: RGBA;
    accent: RGBA;
    accent2: RGBA;
    onAccent: RGBA;
    hover: RGBA;
    active: RGBA;
    success: RGBA;
    warning: RGBA;
    danger: RGBA;
    info: RGBA;
    track: RGBA;
    knob: RGBA;
    sidebarBg: RGBA;
    sidebarActive: RGBA;
    sidebarText: RGBA;
    sidebarActiveText: RGBA;
    /** metrics (canvas units) */
    radius: number;
    widgetRadius: number;
    glow: number;
    fontSize: number;
    smallFontSize: number;
    titleSize: number;
    widgetHeight: number;
    spacing: number;
    padding: number;
}

const METRICS = {
    radius: 16, widgetRadius: 9, glow: 0.7, fontSize: 15, smallFontSize: 12, titleSize: 17,
    widgetHeight: 34, spacing: 7, padding: 12,
};

const Midnight: Theme = {
    name: "Midnight",
    bg: hex("#0b0d14"), surface: hex("#131624"), surface2: hex("#1a1e30"), border: hex("#262c42"), shadow: hex("#000000", 0.55),
    titleBg: hex("#0e1120"), text: hex("#eaedf7"), textDim: hex("#9aa3bf"), textMuted: hex("#5c6684"),
    accent: hex("#7c5cff"), accent2: hex("#22d3ee"), onAccent: hex("#ffffff"),
    hover: hex("#1f2540"), active: hex("#2b3358"),
    success: hex("#22c55e"), warning: hex("#f59e0b"), danger: hex("#ef4444"), info: hex("#38bdf8"),
    track: hex("#232941"), knob: hex("#ffffff"),
    sidebarBg: hex("#0d101b"), sidebarActive: hex("#1a1f36"), sidebarText: hex("#8d97b5"), sidebarActiveText: hex("#ffffff"),
    ...METRICS,
};

const Aurora: Theme = {
    ...Midnight, name: "Aurora",
    bg: hex("#07110f"), surface: hex("#0d1b18"), surface2: hex("#122622"), border: hex("#1f3a34"), titleBg: hex("#0a1614"),
    text: hex("#e9fbf5"), textDim: hex("#8fbdb0"), textMuted: hex("#4f7a70"),
    accent: hex("#34d399"), accent2: hex("#a3e635"), onAccent: hex("#062016"),
    hover: hex("#163129"), active: hex("#1f4438"), track: hex("#1a3129"),
    sidebarBg: hex("#091512"), sidebarActive: hex("#143029"), sidebarText: hex("#7fae9f"),
};

const Ember: Theme = {
    ...Midnight, name: "Ember",
    bg: hex("#130b0d"), surface: hex("#1e1216"), surface2: hex("#29181d"), border: hex("#40242b"), titleBg: hex("#170d10"),
    text: hex("#fbeff1"), textDim: hex("#c4949d"), textMuted: hex("#7a5560"),
    accent: hex("#fb7185"), accent2: hex("#f59e0b"), onAccent: hex("#2b0a10"),
    hover: hex("#33191f"), active: hex("#4a232c"), track: hex("#33202a"),
    sidebarBg: hex("#100a0c"), sidebarActive: hex("#2c171d"), sidebarText: hex("#b98a94"),
};

const Ocean: Theme = {
    ...Midnight, name: "Ocean",
    bg: hex("#06101a"), surface: hex("#0c1a2a"), surface2: hex("#122438"), border: hex("#1d3650"), titleBg: hex("#081522"),
    text: hex("#e6f2ff"), textDim: hex("#8fb3d6"), textMuted: hex("#4f6f90"),
    accent: hex("#38bdf8"), accent2: hex("#818cf8"), onAccent: hex("#03111f"),
    hover: hex("#152d45"), active: hex("#1c3f60"), track: hex("#17304a"),
    sidebarBg: hex("#070f18"), sidebarActive: hex("#12283e"), sidebarText: hex("#7ea3c8"),
};

const Ghost: Theme = {
    ...Midnight, name: "Ghost",
    bg: hex("#f2f3f8"), surface: hex("#ffffff"), surface2: hex("#eef0f6"), border: hex("#d6dae6"), shadow: hex("#0f172a", 0.25),
    titleBg: hex("#ffffff"), text: hex("#12141c"), textDim: hex("#5b6478"), textMuted: hex("#9aa2b6"),
    accent: hex("#6366f1"), accent2: hex("#06b6d4"), onAccent: hex("#ffffff"),
    hover: hex("#e6e9f3"), active: hex("#d9ddec"), track: hex("#dfe3ee"), knob: hex("#ffffff"),
    sidebarBg: hex("#e9ebf3"), sidebarActive: hex("#ffffff"), sidebarText: hex("#5b6478"), sidebarActiveText: hex("#12141c"),
};

export const THEMES: Theme[] = [Midnight, Aurora, Ember, Ocean, Ghost];

/** The live theme. Mutate fields freely (Theme page does), then call bumpTheme(). */
export const theme: Theme = { ...Midnight };
/** Increments whenever the theme changes; widgets re-style when they see a new version. */
export let themeVersion = 1;

export function bumpTheme(): void { themeVersion++; }

export function applyTheme(name: string): boolean {
    const t = THEMES.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!t) return false;
    Object.assign(theme, t);
    bumpTheme();
    return true;
}
export function themeNames(): string[] { return THEMES.map(t => t.name); }
