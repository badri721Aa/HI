/**
 * examples.ts — placeholder features that show the pattern. They do NOT touch
 * the game. Copy one, rename it, put your logic in onEnable/onDisable/onUpdate.
 */
import { Feature, featureRegistry } from "./feature.js";
import type { Gui } from "../ui/gui.js";
import type { PageContext } from "../pages/page.js";
import { log } from "../core/log.js";
import { theme } from "../ui/theme.js";

/** 1) Simplest possible feature: on/off with callbacks. */
class ExampleToggle extends Feature {
    readonly id = "example.toggle";
    readonly name = "Example toggle";
    override readonly description = "Logs + shows a toast when switched";
    override readonly category = "Examples";
    override onEnable(ctx: PageContext): void { ctx.notify.success("Example enabled", "put your code in onEnable()"); log.info("ExampleToggle → on"); }
    override onDisable(ctx: PageContext): void { ctx.notify.info("Example disabled"); log.info("ExampleToggle → off"); }
}

/** 2) Feature with persisted settings drawn by the feature itself. */
class ExampleWithSettings extends Feature {
    readonly id = "example.settings";
    readonly name = "Example with settings";
    override readonly description = "Has a slider, a dropdown and a toggle";
    override readonly category = "Examples";
    override readonly hasSettings = true;
    override drawSettings(ui: Gui, _ctx: PageContext): void {
        const amount = this.get("amount", 5);
        ui.slider("Amount", amount, 0, 10, { step: 0.5, onChange: v => this.set("amount", v) });
        const modes = ["Slow", "Normal", "Fast"];
        ui.dropdown("Mode", this.get("mode", 1), modes, i => this.set("mode", i));
        ui.toggle("Sub-option", this.get("sub", false), v => this.set("sub", v));
        ui.textDim(`amount=${amount}  mode=${modes[this.get("mode", 1)]}`);
    }
}

/** 3) Feature that runs every frame while enabled (even when the menu is closed). */
class ExampleTicker extends Feature {
    readonly id = "example.ticker";
    readonly name = "Example per-frame";
    override readonly description = "Counts time while enabled (onUpdate)";
    override readonly category = "Examples";
    override readonly hasSettings = true;
    override readonly persist = false;
    private seconds = 0;
    override onEnable(): void { this.seconds = 0; }
    override onUpdate(dt: number): void { this.seconds += dt; }
    override drawSettings(ui: Gui): void {
        ui.keyValue("Running for", `${this.seconds.toFixed(1)} s`, theme.accent2);
        ui.progress((this.seconds % 10) / 10, "10 s cycle");
        if (ui.button("Reset counter", { small: true })) this.seconds = 0;
    }
}

/** 4) Empty skeleton to copy. */
class MyFeature extends Feature {
    readonly id = "my.feature";                 // unique, stable
    readonly name = "My feature";               // shown in the list
    override readonly description = "Describe what it does";
    override readonly category = "Your category";        // groups the list
    override onEnable(_ctx: PageContext): void {
        // TODO: your code — runs once when switched on
    }
    override onDisable(_ctx: PageContext): void {
        // TODO: undo everything you changed in onEnable
    }
    override onUpdate(_dt: number, _ctx: PageContext): void {
        // TODO: runs every frame while enabled (keep it cheap)
    }
}

featureRegistry.register(new ExampleToggle());
featureRegistry.register(new ExampleWithSettings());
featureRegistry.register(new ExampleTicker());
featureRegistry.register(new MyFeature());
