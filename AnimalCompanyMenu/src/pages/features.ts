import { registerPage } from "./page.js";
import { featureRegistry } from "../features/feature.js";
import { theme } from "../ui/theme.js";

let search = "";
const openSettings = new Set<string>();

registerPage({
    id: "features", title: "Features", icon: "F", order: 10,
    draw(ctx) {
        const ui = ctx.ui;
        ui.header("Features");
        search = ui.textField("##fsearch", search, "search features…", v => search = v);
        const q = search.trim().toLowerCase();
        const cats = featureRegistry.categories();
        if (featureRegistry.all().length === 0) { ui.textDim("No features registered. Add one in src/features/."); return; }
        for (const cat of cats) {
            const list = featureRegistry.byCategory(cat).filter(f => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q));
            if (list.length === 0) continue;
            ui.pushId(cat);
            if (ui.collapsingHeader(`${cat}  (${list.length})`, true)) {
                ui.indent(6);
                for (const f of list) {
                    ui.pushId(f.id);
                    ui.toggle(f.name, f.enabled, v => f.setEnabled(v, ctx), { description: f.description });
                    if (f.tooltip) ui.tooltip(f.tooltip);
                    if (f.hasSettings) {
                        const open = openSettings.has(f.id);
                        ui.setNextWidth(110); ui.sameLine();
                        if (ui.button(open ? "hide##fs" : "settings##fs", { small: true, variant: "ghost" })) {
                            if (open) openSettings.delete(f.id); else openSettings.add(f.id);
                        }
                        if (open) {
                            ui.beginCard();
                            f.drawSettings(ui, ctx);
                            ui.endCard();
                        }
                    }
                    ui.popId();
                }
                ui.unindent(6);
            }
            ui.popId();
        }
        ui.separator();
        ui.beginColumns(2);
        if (ui.button("Disable all", { variant: "danger" })) featureRegistry.disableAll(ctx);
        ui.nextColumn();
        ui.label(`${featureRegistry.enabledCount()} enabled`, { color: theme.textDim, align: "right" });
        ui.endColumns();
    },
});
