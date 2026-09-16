/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  config.ts — identity + default settings of the menu.
 *
 *  Everything here is safe to edit. Runtime-changeable values live in
 *  `Settings` (persisted with PlayerPrefs); constants live in MENU_INFO.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MENU_INFO = {
    /** Shown in the title bar. Rich text is NOT supported here (keep it short). */
    name: "AC MENU",
    /** Small text next to the name. */
    tagline: "hand menu template",
    version: "1.0.0",
    author: "you",
    /** PlayerPrefs key under which settings are stored. */
    prefsKey: "acmenu.settings.v1",
};

export type HandSide = "left" | "right";
export type OpenMode = "toggle" | "hold" | "palm";
export type PointerMode = "finger" | "laser" | "gaze";
export type FollowMode = "float" | "locked";
export type ToggleStyle = "checkbox" | "switch";
export type LayoutMode = "sidebar" | "tabs";

/** Buttons that can be bound to actions. */
export type VRButton =
    | "none"
    | "left.trigger" | "left.grip" | "left.primary" | "left.secondary" | "left.stick" | "left.menu"
    | "right.trigger" | "right.grip" | "right.primary" | "right.secondary" | "right.stick";

export const ALL_BUTTONS: VRButton[] = [
    "none",
    "left.primary", "left.secondary", "left.trigger", "left.grip", "left.stick", "left.menu",
    "right.primary", "right.secondary", "right.trigger", "right.grip", "right.stick",
];

export const BUTTON_LABELS: Record<VRButton, string> = {
    "none": "Unbound",
    "left.trigger": "L Trigger", "left.grip": "L Grip", "left.primary": "X", "left.secondary": "Y",
    "left.stick": "L Stick", "left.menu": "Menu",
    "right.trigger": "R Trigger", "right.grip": "R Grip", "right.primary": "A", "right.secondary": "B",
    "right.stick": "R Stick",
};

export interface Vec3Like { x: number; y: number; z: number }

export interface Settings {
    /** Hand the menu is attached to. The other hand becomes the pointer hand. */
    hand: HandSide;
    /** Overall size multiplier of the panel. */
    scale: number;
    /** "float": panel hovers above the hand and always faces your head.  "locked": rigidly follows the hand rotation. */
    followMode: FollowMode;
    /** Offset from the hand (meters). In float mode: world up/right/forward relative to your head. In locked mode: hand-local axes. */
    offset: Vec3Like;
    /** Extra rotation (degrees) applied in locked mode. */
    rotationOffset: Vec3Like;
    /** 0 = instant, 1 = very smooth. */
    smoothing: number;

    openMode: OpenMode;
    openButton: VRButton;
    /** Palm gesture sensitivity (0.3 loose … 0.9 strict). */
    palmThreshold: number;

    pointerMode: PointerMode;
    /** Finger tip offset from the pointer hand transform (meters, hand-local). */
    fingerOffset: Vec3Like;
    /** Fire click when the finger enters (true) or when it leaves (false). */
    clickOnPress: boolean;
    laserButton: VRButton;

    haptics: boolean;
    sounds: boolean;
    toggleStyle: ToggleStyle;
    layout: LayoutMode;
    tooltipDelay: number;
    wristHud: boolean;
    showFps: boolean;
    showClock: boolean;
    theme: string;
}

export const DEFAULT_SETTINGS: Settings = {
    hand: "left",
    scale: 1.0,
    followMode: "float",
    offset: { x: 0.0, y: 0.13, z: 0.0 },
    rotationOffset: { x: 0, y: 0, z: 0 },
    smoothing: 0.35,

    openMode: "toggle",
    openButton: "left.secondary",
    palmThreshold: 0.55,

    pointerMode: "finger",
    fingerOffset: { x: 0.0, y: -0.01, z: 0.05 },
    clickOnPress: false,
    laserButton: "right.trigger",

    haptics: true,
    sounds: false,
    toggleStyle: "switch",
    layout: "sidebar",
    tooltipDelay: 0.6,
    wristHud: true,
    showFps: true,
    showClock: true,
    theme: "Midnight",
};

/** Physical size / layout constants (canvas units). One unit = 1 px of the canvas; the canvas is scaled to meters at runtime. */
export const PANEL = {
    width: 520,
    height: 600,
    /** meters per canvas unit at scale 1.0 → 520u ≈ 0.21 m wide */
    metersPerUnit: 0.0004,
    titleHeight: 46,
    sidebarWidth: 138,
    footerHeight: 26,
    padding: 12,
};
