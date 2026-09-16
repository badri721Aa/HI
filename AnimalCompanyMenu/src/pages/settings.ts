import { registerPage } from "./page.js";
import { settings, markDirty, resetSettings, saveSettings } from "../core/prefs.js";
import { ALL_BUTTONS, BUTTON_LABELS, DEFAULT_SETTINGS, type FollowMode, type OpenMode, type PointerMode } from "../config.js";
import { theme, themeNames, applyTheme } from "../ui/theme.js";

const dirty = (): void => markDirty();

registerPage({
    id: "settings", title: "Settings", icon: "S", order: 30,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header("Settings");

        if (ui.collapsingHeader("Hand & position", true)) {
            ui.indent(6);
            ui.tabs("hand", settings.hand === "left" ? 0 : 1, ["Left hand", "Right hand"], i => { settings.hand = i === 0 ? "left" : "right"; dirty(); });
            ui.tooltip("The other hand becomes the pointer");
            const modes: FollowMode[] = ["float", "locked"];
            ui.dropdown("Follow mode", modes.indexOf(settings.followMode), ["Float (faces you)", "Locked to hand"], i => { settings.followMode = modes[i]; dirty(); });
            ui.slider("Size", settings.scale, 0.5, 2.0, { step: 0.05, onChange: v => { settings.scale = v; dirty(); }, suffix: "x" });
            ui.slider("Smoothing", settings.smoothing, 0, 1, { step: 0.05, onChange: v => { settings.smoothing = v; dirty(); } });
            ui.beginCard("offset (cm)");
            ui.slider("Right / left", settings.offset.x * 100, -30, 30, { step: 0.5, onChange: v => { settings.offset.x = v / 100; dirty(); } });
            ui.slider("Up / down", settings.offset.y * 100, -30, 30, { step: 0.5, onChange: v => { settings.offset.y = v / 100; dirty(); } });
            ui.slider("Toward you", settings.offset.z * 100, -30, 30, { step: 0.5, onChange: v => { settings.offset.z = v / 100; dirty(); } });
            ui.endCard();
            if (settings.followMode === "locked") {
                ui.beginCard("rotation (deg)");
                ui.slider("Tilt X", settings.rotationOffset.x, -180, 180, { step: 5, onChange: v => { settings.rotationOffset.x = v; dirty(); } });
                ui.slider("Turn Y", settings.rotationOffset.y, -180, 180, { step: 5, onChange: v => { settings.rotationOffset.y = v; dirty(); } });
                ui.slider("Roll Z", settings.rotationOffset.z, -180, 180, { step: 5, onChange: v => { settings.rotationOffset.z = v; dirty(); } });
                ui.endCard();
            }
            if (ui.button("Reset position", { small: true, variant: "ghost" })) {
                settings.offset = { ...DEFAULT_SETTINGS.offset }; settings.rotationOffset = { ...DEFAULT_SETTINGS.rotationOffset }; settings.scale = 1; dirty();
            }
            ui.unindent(6);
        }

        if (ui.collapsingHeader("Opening the menu", true)) {
            ui.indent(6);
            const om: OpenMode[] = ["toggle", "hold", "palm"];
            ui.dropdown("Open mode", om.indexOf(settings.openMode), ["Press button to toggle", "Hold button", "Palm facing you"], i => { settings.openMode = om[i]; dirty(); });
            if (settings.openMode !== "palm") ui.keybind("Open button", settings.openButton, b => { settings.openButton = b; dirty(); });
            else ui.slider("Palm sensitivity", settings.palmThreshold, 0.3, 0.9, { step: 0.05, onChange: v => { settings.palmThreshold = v; dirty(); } });
            ui.unindent(6);
        }

        if (ui.collapsingHeader("Pointer", true)) {
            ui.indent(6);
            const pm: PointerMode[] = ["finger", "laser", "gaze"];
            ui.dropdown("Pointer", pm.indexOf(settings.pointerMode), ["Finger (touch)", "Laser (button)", "Gaze (head)"], i => { settings.pointerMode = pm[i]; dirty(); });
            if (settings.pointerMode === "finger") {
                ui.beginCard("finger tip offset (cm)");
                ui.slider("Sideways", settings.fingerOffset.x * 100, -10, 10, { step: 0.25, onChange: v => { settings.fingerOffset.x = v / 100; dirty(); } });
                ui.slider("Up / down", settings.fingerOffset.y * 100, -10, 10, { step: 0.25, onChange: v => { settings.fingerOffset.y = v / 100; dirty(); } });
                ui.slider("Forward", settings.fingerOffset.z * 100, -10, 15, { step: 0.25, onChange: v => { settings.fingerOffset.z = v / 100; dirty(); } });
                ui.keyValue("Finger depth now", ctx.menu.pointerDepth === 0 ? "—" : `${(ctx.menu.pointerDepth * 100).toFixed(1)} cm`);
                ui.endCard();
            }
            if (settings.pointerMode === "laser") ui.keybind("Laser click", settings.laserButton, b => { settings.laserButton = b; dirty(); });
            ui.toggle("Click on press", settings.clickOnPress, v => { settings.clickOnPress = v; dirty(); }, { description: "Fire when the finger enters instead of when it leaves" });
            ui.toggle("Haptics", settings.haptics, v => { settings.haptics = v; dirty(); });
            ui.unindent(6);
        }

        if (ui.collapsingHeader("Appearance")) {
            ui.indent(6);
            const names = themeNames();
            ui.dropdown("Theme", Math.max(0, names.indexOf(settings.theme)), names, i => { settings.theme = names[i]; applyTheme(names[i]); dirty(); });
            ui.dropdown("Toggle style", settings.toggleStyle === "switch" ? 0 : 1, ["Switch", "Checkbox"], i => { settings.toggleStyle = i === 0 ? "switch" : "checkbox"; dirty(); });
            ui.slider("Tooltip delay", settings.tooltipDelay, 0.1, 2, { step: 0.1, onChange: v => { settings.tooltipDelay = v; dirty(); }, suffix: " s" });
            ui.toggle("Show FPS", settings.showFps, v => { settings.showFps = v; dirty(); });
            ui.toggle("Show clock", settings.showClock, v => { settings.showClock = v; dirty(); });
            ui.toggle("Wrist HUD", settings.wristHud, v => { settings.wristHud = v; dirty(); }, { description: "Small clock/fps panel on the hand while the menu is closed" });
            ui.unindent(6);
        }

        ui.separator("danger zone");
        ui.beginColumns(3);
        if (ui.button("Save now", { variant: "primary" })) { saveSettings(); ctx.notify.success("Saved"); }
        ui.nextColumn();
        if (ui.button("Reset all", { variant: "danger" })) { resetSettings(); applyTheme(settings.theme); ctx.notify.warn("Settings reset"); }
        ui.nextColumn();
        if (ui.button("Unload menu", { variant: "danger" })) ctx.menu.unload();
        ui.endColumns();
        ui.textDim(`bindings: ${ALL_BUTTONS.filter(b => b !== "none").map(b => BUTTON_LABELS[b]).join(" · ")}`);
        ui.label(" ", { color: theme.textMuted });
    },
});
