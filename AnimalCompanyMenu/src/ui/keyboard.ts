/**
 * keyboard.ts — modal on-panel keyboard used by ui.textField().
 */
import type { Gui } from "./gui.js";
import { theme } from "./theme.js";

const ROWS_ALPHA = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const ROWS_SYM = ["1234567890", "!@#$%^&*()", "-_=+[]{};:", "'\",.<>/?\\|~`"];

export function drawKeyboard(gui: Gui, panelW: number, panelH: number): void {
    const kb = gui.keyboard;
    if (!kb.open) return;
    const boxW = Math.min(panelW - 24, 470), boxH = 300;
    const bx = (panelW - boxW) / 2, by = panelH - boxH - 34;

    gui.dim(0, 0, panelW, panelH, 0.72);
    gui.panelBox("kb", bx, by, boxW, boxH);

    const pad = 12;
    gui.setCursor(bx + pad, by + pad);
    gui.setRightEdge(bx + boxW - pad);
    gui.setNextWidth(boxW - pad * 2 - 40);
    gui.label(kb.title, { color: theme.textMuted, size: theme.smallFontSize, bold: true });
    gui.sameLine();
    if (gui.iconButton("kbclose", "close", 28)) close(gui, false);

    // current text
    gui.setCursor(bx + pad, by + pad + 30);
    gui.setNextWidth(boxW - pad * 2);
    gui.textField("##kbpreview", kb.buffer, "type…");

    const rows = kb.symbols ? ROWS_SYM : ROWS_ALPHA;
    const keyW = (boxW - pad * 2 - 9 * 4) / 10, keyH = 32, gap = 4;
    let y = by + pad + 74;
    for (let r = 0; r < rows.length; r++) {
        const chars = rows[r];
        const rowW = chars.length * keyW + (chars.length - 1) * gap;
        const rowX = bx + (boxW - rowW) / 2;
        gui.setCursor(rowX, y);
        for (let i = 0; i < chars.length; i++) {
            if (i > 0) gui.sameLine();
            const ch = chars[i];
            const label = kb.shift && !kb.symbols ? ch.toUpperCase() : ch;
            if (gui.button(`${label}##k${r}${i}`, { width: keyW, height: keyH })) {
                kb.buffer += label;
                if (kb.shift) kb.shift = false;
            }
        }
        y += keyH + gap;
    }
    // bottom row: shift / symbols / space / backspace / enter
    gui.setCursor(bx + pad, y);
    if (gui.button(kb.symbols ? "abc##kbsym" : "#+=##kbsym", { width: 56, height: keyH })) kb.symbols = !kb.symbols;
    gui.sameLine();
    if (gui.button("shift##kbshift", { width: 64, height: keyH, variant: kb.shift ? "primary" : "default" })) kb.shift = !kb.shift;
    gui.sameLine();
    if (gui.button("space##kbspace", { width: boxW - pad * 2 - 56 - 64 - 60 - 80 - 4 * 4, height: keyH })) kb.buffer += " ";
    gui.sameLine();
    if (gui.button("del##kbdel", { width: 60, height: keyH, variant: "danger" })) kb.buffer = kb.buffer.slice(0, -1);
    gui.sameLine();
    if (gui.button("enter##kbenter", { width: 80, height: keyH, variant: "primary" })) close(gui, true);
}

function close(gui: Gui, commit: boolean): void {
    const kb = gui.keyboard;
    kb.open = false;
    kb.changed = commit;
    kb.closedFrame = gui.frame;
    kb.targetId = 0;
}
