import { registerPage } from "./page.js";
import { theme, THEMES, themeNames, applyTheme, bumpTheme } from "../ui/theme.js";
import { settings, markDirty } from "../core/prefs.js";
import type { RGBA } from "../core/math.js";

let previewToggle = true;
let previewSlider = 6;

registerPage({
    id: "theme", title: "Theme", icon: "T", order: 40,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header("Theme");
        const names = themeNames();
        const cur = Math.max(0, THEMES.findIndex(t => t.name === theme.name));
        ui.tabs("presets", cur, names, i => { applyTheme(names[i]); settings.theme = names[i]; markDirty(); });
        ui.spacing(2);
        const pick = (label: string, key: keyof typeof theme): void => {
            const c = theme[key] as RGBA;
            ui.colorPicker(label, c, v => { (theme as unknown as Record<string, unknown>)[key] = v; bumpTheme(); });
        };
        if (ui.collapsingHeader("Colors", true)) {
            ui.indent(6);
            pick("Accent", "accent"); pick("Accent 2", "accent2"); pick("Background", "bg"); pick("Surface", "surface");
            pick("Surface 2", "surface2"); pick("Border", "border"); pick("Text", "text"); pick("Text dim", "textDim");
            ui.unindent(6);
        }
        if (ui.collapsingHeader("Shape")) {
            ui.indent(6);
            ui.slider("Corner radius", theme.radius, 4, 28, { step: 1, onChange: v => { theme.radius = v; bumpTheme(); } });
            ui.slider("Widget radius", theme.widgetRadius, 2, 17, { step: 1, onChange: v => { theme.widgetRadius = v; bumpTheme(); } });
            ui.slider("Glow", theme.glow, 0, 1.5, { step: 0.05, onChange: v => { theme.glow = v; bumpTheme(); } });
            ui.slider("Font size", theme.fontSize, 12, 20, { step: 1, onChange: v => { theme.fontSize = v; bumpTheme(); } });
            ui.unindent(6);
        }
        ui.separator("preview");
        ui.beginCard("preview");
        ui.beginColumns(2);
        ui.button("Primary", { variant: "primary" }); ui.nextColumn(); ui.button("Default");
        ui.endColumns();
        previewToggle = ui.toggle("Toggle", previewToggle);
        previewSlider = ui.slider("Slider", previewSlider, 0, 10, { step: 1 });
        ui.badge("badge"); ui.sameLine(); ui.badge("ok", theme.success); ui.sameLine(); ui.badge("warn", theme.warning);
        ui.endCard();
        if (ui.button("Revert to preset", { variant: "ghost", small: true })) applyTheme(theme.name);
    },
});
