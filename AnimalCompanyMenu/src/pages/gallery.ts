/** Every widget in one place — copy/paste from here. */
import { registerPage } from "./page.js";
import { theme } from "../ui/theme.js";
import { hex, type RGBA } from "../core/math.js";
import type { VRButton } from "../config.js";

const demo = {
    toggleA: true, toggleB: false, slider: 4.2, int: 3, drop: 1, step: 2, tab: 0, color: hex("#7c5cff") as RGBA,
    key: "right.primary" as VRButton, text: "", tbtn: false, progress: 0,
};

registerPage({
    id: "gallery", title: "Widgets", icon: "W", order: 20,
    draw(ctx) {
        const ui = ctx.ui;
        demo.progress = (demo.progress + ctx.dt * 0.15) % 1;
        ui.header("Widget gallery");
        ui.textDim("Every widget the template ships, with the call that draws it.");

        ui.separator("text");
        ui.label("ui.label(text)");
        ui.label("bold + colored", { bold: true, color: theme.accent2 });
        ui.textWrapped("ui.textWrapped(): long text wraps to the available width and pushes the layout down like any other widget.");
        ui.keyValue("ui.keyValue(k, v)", "value");
        ui.badge("badge"); ui.sameLine(); ui.badge("success", theme.success); ui.sameLine(); ui.badge("danger", theme.danger);

        ui.separator("buttons");
        if (ui.button("ui.button()")) ctx.notify.info("Clicked", "default button");
        ui.tooltip("Tooltips appear after hovering a moment");
        ui.beginColumns(3);
        if (ui.button("primary", { variant: "primary" })) ctx.notify.success("Primary");
        ui.nextColumn();
        if (ui.button("danger", { variant: "danger" })) ctx.notify.error("Danger", "be careful");
        ui.nextColumn();
        if (ui.button("ghost", { variant: "ghost" })) ctx.notify.warn("Ghost");
        ui.endColumns();
        demo.tbtn = ui.toggleButton("ui.toggleButton()", demo.tbtn);
        const row = ui.buttonRow(["one", "two", "three"]);
        if (row >= 0) ctx.notify.info(`buttonRow → ${row}`);

        ui.separator("toggles");
        demo.toggleA = ui.toggle("ui.toggle()", demo.toggleA);
        demo.toggleB = ui.toggle("with description", demo.toggleB, undefined, { description: "opts.description adds a second line" });
        ui.toggle("disabled", true, undefined, { disabled: true });

        ui.separator("sliders");
        demo.slider = ui.slider("ui.slider()", demo.slider, 0, 10, { step: 0.1, suffix: " m" });
        demo.int = ui.intSlider("ui.intSlider()", demo.int, 0, 10, undefined, " px");
        demo.step = ui.stepper("ui.stepper()", demo.step, 0, 10);
        ui.progress(demo.progress, "ui.progress()");

        ui.separator("selection");
        demo.drop = ui.dropdown("ui.dropdown()", demo.drop, ["Alpha", "Beta", "Gamma", "Delta"]);
        demo.tab = ui.tabs("demo", demo.tab, ["Tab A", "Tab B", "Tab C"]);
        demo.color = ui.colorPicker("ui.colorPicker()", demo.color);
        demo.key = ui.keybind("ui.keybind()", demo.key);
        demo.text = ui.textField("ui.textField()", demo.text, "tap to type…");

        ui.separator("layout");
        if (ui.collapsingHeader("ui.collapsingHeader()")) {
            ui.indent();
            ui.textDim("Content inside a collapsing header.");
            ui.beginColumns(2);
            ui.button("col 1"); ui.nextColumn(); ui.button("col 2");
            ui.endColumns();
            ui.unindent();
        }
        ui.beginCard("ui.beginCard() / endCard()");
        ui.textDim("Cards group related widgets.");
        ui.label("ui.sameLine() + setNextWidth():");
        ui.setNextWidth(90); ui.button("A##sl"); ui.sameLine();
        ui.setNextWidth(90); ui.button("B##sl"); ui.sameLine();
        ui.button("C fills the rest##sl");
        ui.endCard();
        ui.beginColumns(2);
        ui.statCard("stat card", "42", "ui.statCard()", theme.accent);
        ui.nextColumn();
        ui.statCard("another", "1.2k", "with accent", theme.success);
        ui.endColumns();
        ui.spacing(20);
    },
});
