const colors = { info: "\x1b[36m", ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", trade: "\x1b[35m" };
type Level = keyof typeof colors;

function write(level: Level, msg: string, extra?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `\x1b[90m${ts}\x1b[0m ${colors[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${msg}`;
  (level === "err" ? console.error : console.log)(line, ...(extra !== undefined ? [extra] : []));
}

export const log = {
  info: (m: string, e?: unknown) => write("info", m, e),
  ok: (m: string, e?: unknown) => write("ok", m, e),
  warn: (m: string, e?: unknown) => write("warn", m, e),
  err: (m: string, e?: unknown) => write("err", m, e),
  trade: (m: string, e?: unknown) => write("trade", m, e),
};

export const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
