/**
 * page.ts — a page is one entry in the sidebar. Register yours with registerPage().
 */
import type { Gui } from "../ui/gui.js";
import type { Settings } from "../config.js";
import type { XRInput } from "../core/input.js";
import type { Rig } from "../core/hands.js";
import type { Notify } from "../ui/notifications.js";

export interface MenuActions {
    close(): void;
    goTo(pageId: string): void;
    unload(): void;
    rebuild(): void;
    readonly pageCount: number;
    readonly openedAt: number;
    readonly fps: number;
    readonly frameHook: string;
    readonly exportStrategy: string;
    readonly textBackend: string;
    readonly pointerDepth: number;
    readonly startedAt: number;
}

export interface PageContext {
    ui: Gui;
    settings: Settings;
    input: XRInput;
    rig: Rig;
    notify: typeof Notify;
    menu: MenuActions;
    now: number;
    dt: number;
}

export interface Page {
    id: string;
    title: string;
    /** one or two characters shown in the sidebar */
    icon: string;
    order: number;
    draw(ctx: PageContext): void;
}

const pages: Page[] = [];
export function registerPage(p: Page): void {
    const i = pages.findIndex(x => x.id === p.id);
    if (i >= 0) pages[i] = p; else pages.push(p);
    pages.sort((a, b) => a.order - b.order);
}
export function allPages(): Page[] { return pages; }
