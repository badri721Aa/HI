import "dotenv/config";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

function str(name: string, fallback?: string): string {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var ${name} (see .env.example)`);
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be a number, got "${raw}"`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function loadKeypair(secret: string): Keypair {
  // Accept either a base58 secret key (Phantom export) or a JSON byte array (solana-keygen file contents).
  if (secret.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
  return Keypair.fromSecretKey(bs58.decode(secret));
}

const rpcUrl = str("RPC_URL", "https://api.mainnet-beta.solana.com");

export const config = {
  rpcUrl,
  wsUrl: str("WS_URL", rpcUrl.replace(/^http/, "ws")),
  wallet: loadKeypair(str("PRIVATE_KEY")),
  targets: str("TARGET_WALLETS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new PublicKey(s)),

  dryRun: bool("DRY_RUN", false),

  // Sizing
  buyMode: str("BUY_MODE", "fixed") as "fixed" | "ratio",
  buyAmountSol: num("BUY_AMOUNT_SOL", 0.05),
  copyRatio: num("COPY_RATIO", 0.1),
  maxSolPerTrade: num("MAX_SOL_PER_TRADE", 0.25),
  minTargetBuySol: num("MIN_TARGET_BUY_SOL", 0.1),

  // Risk limits
  dailySolLimit: num("DAILY_SOL_LIMIT", 1),
  maxOpenPositions: num("MAX_OPEN_POSITIONS", 5),
  solReserve: num("SOL_RESERVE", 0.02),
  maxPriceImpactPct: num("MAX_PRICE_IMPACT_PCT", 15),
  allowRebuy: bool("ALLOW_REBUY", false),
  maxTxAgeSec: num("MAX_TX_AGE_SEC", 30),

  // Exits
  copySells: bool("COPY_SELLS", true),
  takeProfitPct: num("TAKE_PROFIT_PCT", 100),
  stopLossPct: num("STOP_LOSS_PCT", 40),
  maxHoldMinutes: num("MAX_HOLD_MINUTES", 0),
  priceCheckIntervalSec: num("PRICE_CHECK_INTERVAL_SEC", 10),

  // Execution
  jupiterApiUrl: str("JUPITER_API_URL", "https://lite-api.jup.ag/swap/v1"),
  jupiterApiKey: process.env.JUPITER_API_KEY?.trim() || undefined,
  buySlippageBps: num("BUY_SLIPPAGE_BPS", 1500),
  sellSlippageBps: num("SELL_SLIPPAGE_BPS", 2000),
  priorityFeeMaxLamports: num("PRIORITY_FEE_MAX_LAMPORTS", 1_000_000),
  pollIntervalSec: num("POLL_INTERVAL_SEC", 5),

  dataDir: str("DATA_DIR", "./data"),
};

if (config.targets.length === 0) throw new Error("TARGET_WALLETS must list at least one wallet");
if (config.buyMode !== "fixed" && config.buyMode !== "ratio") throw new Error('BUY_MODE must be "fixed" or "ratio"');

export type Config = typeof config;
