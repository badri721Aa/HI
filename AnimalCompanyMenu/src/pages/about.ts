import { registerPage } from "./page.js";
import { MENU_INFO } from "../config.js";
import { theme } from "../ui/theme.js";

registerPage({
    id: "about", title: "About", icon: "i", order: 90,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header(`${MENU_INFO.name}  <size=70%><color=#9aa3bf>v${MENU_INFO.version}</color></size>`);
        ui.textDim(MENU_INFO.tagline);
        ui.beginCard("controls");
        ui.keyValue("Open / close", ctx.settings.openMode === "palm" ? "palm toward face" : "bound button");
        ui.keyValue("Click", ctx.settings.pointerMode === "finger" ? "push finger into panel" : "laser button");
        ui.keyValue("Scroll", "drag empty space / thumbstick");
        ui.keyValue("Tooltip", "hover a moment");
        ui.endCard();
        ui.beginCard("stack");
        ui.keyValue("Injection", "Frida + frida-il2cpp-bridge");
        ui.keyValue("Rendering", "Unity uGUI world-space canvas");
        ui.keyValue("Text", ctx.menu.textBackend);
        ui.keyValue("Unity", safe(() => Il2Cpp.unityVersion));
        ui.keyValue("App", safe(() => `${Il2Cpp.application.identifier} ${Il2Cpp.application.version}`));
        ui.endCard();
        ui.textWrapped("Template only: it contains no game modifications. Add your own features in src/features/ and pages in src/pages/.", theme.textMuted);
        ui.label(`by ${MENU_INFO.author}`, { color: theme.textMuted, align: "right" });
    },
});

function safe(f: () => string): string { try { return f(); } catch { return "?"; } }
