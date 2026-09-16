/**
 * index.ts — entry point.  Build with `npm run build`, run with
 *   frida -l dist/_agent.js AnimalCompany.exe        (PC)
 *   frida -U -l dist/_agent.js -n "Animal Company"    (Quest, see README)
 */
import "frida-il2cpp-bridge";
import "./types/bridge-augment.js";
import { installExportResolver } from "./il2cpp-exports.js";
import { log, describe } from "./core/log.js";
import { MENU_INFO } from "./config.js";
import { Menu } from "./ui/menu.js";
import "./pages/index.js";
import "./features/index.js";

installExportResolver();

let menu: Menu | null = null;

Il2Cpp.perform(() => {
    let unity = "?", app = "?";
    try { unity = Il2Cpp.unityVersion; } catch { /* ignore */ }
    try { app = `${Il2Cpp.application.identifier} ${Il2Cpp.application.version}`; } catch { /* ignore */ }
    log.info(`${MENU_INFO.name} v${MENU_INFO.version} — Unity ${unity} · ${app}`);
    menu = new Menu();
    menu.start();
    log.info("waiting for the first frame… (load fully into the game if nothing happens)");
}).catch((e: unknown) => log.error(`startup failed: ${describe(e)}`));

// `frida` REPL helpers:  rpc.exports.unload()  /  rpc.exports.rebuild()
rpc.exports = {
    unload: () => { menu?.unload(); },
    rebuild: () => { menu?.rebuild(); },
    open: () => { menu?.setVisible(true); },
    close: () => { menu?.setVisible(false); },
};
