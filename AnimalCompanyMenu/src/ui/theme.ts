/**
 * theme.ts — colors & metrics. "Classic" is a plain grey Dear-ImGui look (flat),
 * "Magenta" the black/pink Quest-menu look; the rest are fancier variants.
 * Add your own preset to THEMES and it shows up in the Theme page.
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
    /** flat = classic ImGui look: no glow, no gradients, square-ish corners */
    flat: boolean;
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
    radius: 6, widgetRadius: 3, glow: 0, fontSize: 16, smallFontSize: 13, titleSize: 18,
    widgetHeight: 38, spacing: 6, padding: 12,
};
const FANCY = { ...METRICS, radius: 14, widgetRadius: 8, glow: 0.7 };

/** Plain grey Dear-ImGui look — the default. */
const Classic: Theme = {
    name: "Classic",
    bg: hex("#1e1e1e"), surface: hex("#262626"), surface2: hex("#333333"), border: hex("#414141"), shadow: hex("#000000", 0.6),
    titleBg: hex("#2a2a2a"), text: hex("#f0f0f0"), textDim: hex("#b5b5b5"), textMuted: hex("#7c7c7c"),
    accent: hex("#4c8bf5"), accent2: hex("#8ab4ff"), onAccent: hex("#ffffff"),
    hover: hex("#3a3a3a"), active: hex("#474747"),
    success: hex("#4caf50"), warning: hex("#e0a83a"), danger: hex("#d9534f"), info: hex("#5aa9e6"),
    track: hex("#3a3a3a"), knob: hex("#d4d4d4"),
    sidebarBg: hex("#232323"), sidebarActive: hex("#3d3d3d"), sidebarText: hex("#bdbdbd"), sidebarActiveText: hex("#ffffff"),
    flat: true,
    ...METRICS,
};

/** Black + magenta, in the style of the popular Quest menus. */
const Magenta: Theme = {
    ...Classic, name: "Magenta",
    bg: hex("#0b0b12"), surface: hex("#14141f"), surface2: hex("#1c1c2c"), border: hex("#2c2c44"), titleBg: hex("#c2157f"),
    text: hex("#ffffff"), textDim: hex("#c9bfd6"), textMuted: hex("#7d6f8f"),
    accent: hex("#ff2fa0"), accent2: hex("#ff7ac8"), onAccent: hex("#ffffff"),
    hover: hex("#241a33"), active: hex("#3a1f44"), track: hex("#2c2c44"), knob: hex("#ffffff"),
    sidebarBg: hex("#0d0d18"), sidebarActive: hex("#ff2fa0"), sidebarText: hex("#c9bfd6"), sidebarActiveText: hex("#ffffff"),
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
    flat: false,
    ...FANCY,
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

export const THEMES: Theme[] = [Classic, Magenta, Midnight, Aurora, Ember, Ocean, Ghost];

/** The live theme. Mutate fields freely (Theme page does), then call bumpTheme(). */
export const theme: Theme = { ...Classic };
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
