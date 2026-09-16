import { registerPage } from "./page.js";
import { MENU_INFO } from "../config.js";
import { theme } from "../ui/theme.js";
import { featureRegistry } from "../features/feature.js";

registerPage({
    id: "home", title: "Home", icon: "H", order: 0,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header(`Welcome to ${MENU_INFO.name}`);
        ui.textWrapped("This is the template's dashboard. Everything you see is a widget you can reuse in your own pages.");
        ui.spacing(4);
        const up = Math.max(0, ctx.now - ctx.menu.startedAt);
        ui.beginColumns(2);
        ui.statCard("Rig", ctx.rig.resolved ? "Tracked" : "Searching", ctx.rig.source, ctx.rig.resolved ? theme.success : theme.warning);
        ui.nextColumn();
        ui.statCard("Pointer", ctx.input.desktop ? "Gaze / keys" : ctx.settings.pointerMode, `${ctx.settings.hand === "left" ? "right" : "left"} hand`, theme.accent2);
        ui.endColumns();
        ui.beginColumns(2);
        ui.statCard("FPS", ctx.menu.fps.toFixed(0), `${(ctx.dt * 1000).toFixed(1)} ms/frame`, theme.info);
        ui.nextColumn();
        ui.statCard("Features", `${featureRegistry.enabledCount()} / ${featureRegistry.all().length}`, "enabled", theme.accent);
        ui.endColumns();
        ui.separator("quick actions");
        const hit = ui.buttonRow(["Features", "Settings", "Theme"]);
        if (hit === 0) ctx.menu.goTo("features");
        if (hit === 1) ctx.menu.goTo("settings");
        if (hit === 2) ctx.menu.goTo("theme");
        ui.beginColumns(2);
        if (ui.button("Test toast", { variant: "primary" })) ctx.notify.success("Hello!", `uptime ${up.toFixed(0)} s`);
        ui.nextColumn();
        if (ui.button("Close menu", { variant: "ghost" })) ctx.menu.close();
        ui.endColumns();
        ui.beginCard("tips");
        ui.textWrapped("• Push your finger into a widget to click, pull back to release.\n• Drag on empty space or use the thumbstick to scroll.\n• Hold a widget to see its tooltip.\n• Position, size and hand are in Settings.");
        ui.endCard();
    },
});
