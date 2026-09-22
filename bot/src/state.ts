import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

export interface Position {
  mint: string;
  tokens: string; // raw units, stringified bigint
  costSol: number;
  openedAt: number;
  copiedFrom: string;
}

interface State {
  positions: Record<string, Position>;
  daily: { date: string; spentSol: number };
}

const file = join(config.dataDir, "state.json");
const tradeLog = join(config.dataDir, "trades.jsonl");
mkdirSync(config.dataDir, { recursive: true });

const today = () => new Date().toISOString().slice(0, 10);

export const state: State = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : { positions: {}, daily: { date: today(), spentSol: 0 } };

export function save() {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}

export function spentToday(): number {
  if (state.daily.date !== today()) state.daily = { date: today(), spentSol: 0 };
  return state.daily.spentSol;
}

export function addSpend(sol: number) {
  spentToday();
  state.daily.spentSol += sol;
  save();
}

export function recordTrade(entry: Record<string, unknown>) {
  appendFileSync(tradeLog, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}
