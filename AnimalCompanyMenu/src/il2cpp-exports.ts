/**
 * il2cpp-exports.ts — makes frida-il2cpp-bridge work with Animal Company's
 * obfuscated IL2CPP exports.
 *
 * Resolution order (first that applies wins):
 *   1. "plain"  – the module still exports real `il2cpp_*` names → nothing to do.
 *   2. "manual" – MANUAL_EXPORT_MAP below has entries (paste a community map, or
 *                 the output of `tools/dump-exports.js`).
 *   3. "auto"   – exports sorted by address are zipped with the canonical name
 *                 list (works when the obfuscator only renamed symbols).
 *
 * Call `installExportResolver()` BEFORE `Il2Cpp.perform(...)`.
 */
import { CANONICAL_IL2CPP_EXPORTS } from "./il2cpp-export-names.js";
import { log } from "./core/log.js";

/**
 * Optional hand-written map:  canonical name → obfuscated export name.
 * Example (from a community map):
 *   il2cpp_init: "diSBvpqCEPZ",
 *   il2cpp_domain_get: "StpvSUBduEI",
 * Every entry you add overrides the automatic guess for that name.
 */
export const MANUAL_EXPORT_MAP: Record<string, string> = {
    // il2cpp_init: "xxxxxxxxxxx",
};

export type ExportStrategy = "plain" | "manual" | "auto" | "unresolved";

let strategy: ExportStrategy | null = null;
let resolved: Map<string, NativePointer> = new Map();

export function currentExportStrategy(): ExportStrategy { return strategy ?? "unresolved"; }

/** Builds the (canonical name → address) table. Idempotent. */
export function buildExportTable(module: Module): { strategy: ExportStrategy; table: Map<string, NativePointer>; notes: string[] } {
    const notes: string[] = [];
    const table = new Map<string, NativePointer>();
    const exports = module.enumerateExports().filter(e => e.type === "function");

    // 1) plain names
    const plain = exports.filter(e => e.name.startsWith("il2cpp_"));
    if (plain.length > 20) {
        for (const e of plain) table.set(e.name, e.address);
        notes.push(`module exports ${plain.length} real il2cpp_* symbols`);
        return { strategy: "plain", table, notes };
    }

    // 2) manual map
    const manualNames = Object.keys(MANUAL_EXPORT_MAP);
    if (manualNames.length > 0) {
        let hit = 0;
        for (const name of manualNames) {
            const p = module.findExportByName(MANUAL_EXPORT_MAP[name]);
            if (p) { table.set(name, p); hit++; }
        }
        notes.push(`manual map: ${hit}/${manualNames.length} names found`);
        if (hit > 20) return { strategy: "manual", table, notes };
        notes.push("manual map too sparse, falling back to auto");
    }

    // 3) auto: address order == declaration order
    const sorted = exports.slice().sort((a, b) => a.address.compare(b.address));
    const n = Math.min(sorted.length, CANONICAL_IL2CPP_EXPORTS.length);
    notes.push(`auto map: module has ${sorted.length} function exports, canonical list has ${CANONICAL_IL2CPP_EXPORTS.length}`);
    if (sorted.length !== CANONICAL_IL2CPP_EXPORTS.length) {
        notes.push("export count differs from canonical list — mapping is a best-effort guess. If the bridge crashes, generate a map with tools/dump-exports.js");
    }
    for (let i = 0; i < n; i++) table.set(CANONICAL_IL2CPP_EXPORTS[i], sorted[i].address);
    for (const name of manualNames) {
        const p = module.findExportByName(MANUAL_EXPORT_MAP[name]);
        if (p) table.set(name, p);
    }
    return { strategy: "auto", table, notes };
}

function ensureTable(): void {
    if (strategy !== null) return;
    const mod = Il2Cpp.module;
    const r = buildExportTable(mod);
    strategy = r.strategy;
    resolved = r.table;
    for (const n of r.notes) log.info(`exports: ${n}`);
    log.info(`exports: strategy = ${strategy}`);
}

/**
 * Installs a lazy resolver into `Il2Cpp.$config.exports`. The bridge queries it
 * by canonical name whenever it needs an IL2CPP function.
 */
export function installExportResolver(): void {
    const proxy = new Proxy({}, {
        get(_target, prop: string | symbol) {
            if (typeof prop !== "string" || !prop.startsWith("il2cpp_")) return undefined;
            return (): NativePointer | null => {
                ensureTable();
                if (strategy === "plain") return Il2Cpp.module.findExportByName(prop);
                return resolved.get(prop) ?? null;
            };
        },
    });
    // The bridge's type is Record<`il2cpp_${string}`, () => NativePointer>; a Proxy satisfies it at runtime.
    Il2Cpp.$config.exports = proxy as unknown as Record<`il2cpp_${string}`, () => NativePointer>;
}
