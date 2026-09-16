/**
 * log.ts — tiny logger. Everything goes to the Frida console AND to an in-memory
 * ring buffer that the in-game "Console" page displays.
 */
export type LogLevel = "info" | "warn" | "error" | "debug" | "ok";

export interface LogEntry {
    time: number;      // Date.now()
    level: LogLevel;
    msg: string;
}

const PREFIX = "[ACMenu]";
const MAX = 250;

export const logBuffer: LogEntry[] = [];
export const logListeners: Array<(e: LogEntry) => void> = [];

function push(level: LogLevel, msg: string): void {
    const e: LogEntry = { time: Date.now(), level, msg };
    logBuffer.push(e);
    if (logBuffer.length > MAX) logBuffer.shift();
    try {
        const line = `${PREFIX} ${msg}`;
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
    } catch { /* console might not exist */ }
    for (const l of logListeners) { try { l(e); } catch { /* ignore */ } }
}

export const log = {
    info: (msg: string) => push("info", msg),
    ok: (msg: string) => push("ok", msg),
    warn: (msg: string) => push("warn", msg),
    error: (msg: string, err?: unknown) => push("error", err ? `${msg}: ${describe(err)}` : msg),
    debug: (msg: string) => push("debug", msg),
    clear: () => { logBuffer.length = 0; },
};

export function describe(err: unknown): string {
    if (err instanceof Error) return `${err.message}${err.stack ? "\n" + err.stack : ""}`;
    return String(err);
}

/** Runs fn; on exception logs it (once per `key` if given) and returns fallback. */
const onceKeys = new Set<string>();
export function guard<T>(fn: () => T, fallback: T, key?: string): T {
    try {
        return fn();
    } catch (e) {
        if (key) {
            if (!onceKeys.has(key)) { onceKeys.add(key); log.error(`guard(${key})`, e); }
        } else {
            log.error("guard", e);
        }
        return fallback;
    }
}
