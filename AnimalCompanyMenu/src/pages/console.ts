import { registerPage } from "./page.js";
import { logBuffer, log, type LogLevel } from "../core/log.js";
import { theme } from "../ui/theme.js";
import type { RGBA } from "../core/math.js";

let filter = 0;
const FILTERS: Array<LogLevel | "all"> = ["all", "info", "warn", "error"];

registerPage({
    id: "console", title: "Console", icon: "C", order: 50,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header("Console");
        filter = ui.tabs("logfilter", filter, ["All", "Info", "Warn", "Error"]);
        ui.beginColumns(4);
        if (ui.button("Clear", { small: true })) log.clear();
        ui.nextColumn();
        if (ui.button("Info##t", { small: true })) ctx.notify.info("Info toast", "ui.notify.info()");
        ui.nextColumn();
        if (ui.button("Warn##t", { small: true })) ctx.notify.warn("Warning toast", "something to look at");
        ui.nextColumn();
        if (ui.button("Error##t", { small: true })) ctx.notify.error("Error toast", "something broke");
        ui.endColumns();
        ui.beginCard("runtime");
        ui.keyValue("Frame hook", ctx.menu.frameHook);
        ui.keyValue("Export map", ctx.menu.exportStrategy);
        ui.keyValue("Text backend", ctx.menu.textBackend);
        ui.keyValue("Rig source", ctx.rig.source);
        ui.keyValue("Input", ctx.input.desktop ? "keyboard (no XR device)" : "XR InputDevices");
        ui.endCard();
        ui.separator(`log (${logBuffer.length})`);
        const want = FILTERS[filter];
        const lines = logBuffer.filter(e => want === "all" || e.level === want || (want === "info" && e.level === "ok")).slice(-60).reverse();
        if (lines.length === 0) ui.textDim("nothing here");
        for (let i = 0; i < lines.length; i++) {
            const e = lines[i];
            const c: RGBA = e.level === "error" ? theme.danger : e.level === "warn" ? theme.warning : e.level === "ok" ? theme.success : e.level === "debug" ? theme.textMuted : theme.textDim;
            const d = new Date(e.time);
            const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
            ui.pushId(i);
            ui.label(`<color=#5c6684>${ts}</color> ${e.msg.split("\n")[0]}`, { color: c, size: theme.smallFontSize + 1 });
            ui.popId();
        }
    },
});
