/**
 * features.ts — draws one category of features as the classic mod-menu list:
 * one row per feature, checkbox on the right, optional inline settings.
 * Categories appear in the sidebar automatically (see ui/menu.ts).
 */
import type { PageContext } from "./page.js";
import { featureRegistry } from "../features/feature.js";

const openSettings = new Set<string>();

export function drawFeatureCategory(ctx: PageContext, category: string): void {
    const ui = ctx.ui;
    const list = featureRegistry.byCategory(category);
    ui.header(category);
    if (list.length === 0) { ui.textDim("No features in this category yet."); return; }
    for (const f of list) {
        ui.pushId(f.id);
        const open = openSettings.has(f.id);
        ui.featureRow(f.name, f.enabled, f.hasSettings, open,
            v => f.setEnabled(v, ctx),
            () => { if (open) openSettings.delete(f.id); else openSettings.add(f.id); });
        if (f.description) ui.tooltip(f.description);
        if (f.hasSettings && open) {
            ui.indent(12);
            ui.beginCard();
            f.drawSettings(ui, ctx);
            ui.endCard();
            ui.unindent(12);
        }
        ui.popId();
    }
    ui.spacing(6);
    ui.setNextWidth(150);
    if (ui.button("Disable all##cat", { variant: "danger", small: true })) for (const f of list) f.setEnabled(false, ctx);
}

export function categoryEnabledCount(category: string): number {
    return featureRegistry.byCategory(category).filter(f => f.enabled).length;
}
