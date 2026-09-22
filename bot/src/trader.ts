import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { SwapSignal, WSOL_MINT } from "./detector.js";
import { executeSwap, getQuote } from "./jupiter.js";
import { log, short } from "./log.js";
import { addSpend, recordTrade, save, spentToday, state } from "./state.js";

const me = config.wallet.publicKey;
const busy = new Set<string>(); // per-mint lock so overlapping signals can't double-trade

async function withLock(mint: string, fn: () => Promise<void>) {
  if (busy.has(mint)) return log.warn(`${short(mint)} already has a trade in flight, skipping`);
  busy.add(mint);
  try {
    await fn();
  } finally {
    busy.delete(mint);
  }
}

async function tokenBalance(connection: Connection, mint: string): Promise<bigint> {
  const res = await connection.getParsedTokenAccountsByOwner(me, { mint: new PublicKey(mint) }, "confirmed");
  return res.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
}

function buySize(targetSol: number): number {
  const raw = config.buyMode === "ratio" ? targetSol * config.copyRatio : config.buyAmountSol;
  return Math.min(raw, config.maxSolPerTrade);
}

export async function handleSignal(connection: Connection, signal: SwapSignal, source: string, sig: string) {
  const tag = `${short(source)} ${signal.side.toUpperCase()} ${short(signal.mint)} for ${signal.solAmount.toFixed(3)} SOL`;
  log.info(`Signal: ${tag} (tx ${short(sig)})`);
  if (signal.side === "buy") await withLock(signal.mint, () => copyBuy(connection, signal, source));
  else if (config.copySells) await withLock(signal.mint, () => copySell(connection, signal.mint, signal.fractionSold, "copy-sell"));
}

async function copyBuy(connection: Connection, signal: Extract<SwapSignal, { side: "buy" }>, source: string) {
  const { mint } = signal;
  if (signal.solAmount < config.minTargetBuySol)
    return log.info(`Skip: target buy ${signal.solAmount.toFixed(3)} SOL < MIN_TARGET_BUY_SOL`);
  if (state.positions[mint] && !config.allowRebuy) return log.info(`Skip: already holding ${short(mint)}`);
  if (!state.positions[mint] && Object.keys(state.positions).length >= config.maxOpenPositions)
    return log.warn(`Skip: MAX_OPEN_POSITIONS (${config.maxOpenPositions}) reached`);

  const size = buySize(signal.solAmount);
  if (spentToday() + size > config.dailySolLimit)
    return log.warn(`Skip: DAILY_SOL_LIMIT reached (${spentToday().toFixed(3)}/${config.dailySolLimit} SOL spent)`);

  const balance = (await connection.getBalance(me, "confirmed")) / LAMPORTS_PER_SOL;
  if (balance - size < config.solReserve)
    return log.warn(`Skip: balance ${balance.toFixed(3)} SOL too low for ${size} SOL buy + ${config.solReserve} reserve`);

  const lamports = BigInt(Math.floor(size * LAMPORTS_PER_SOL));
  const quote = await getQuote(WSOL_MINT, mint, lamports, config.buySlippageBps);
  const impact = Number(quote.priceImpactPct) * 100;
  if (impact > config.maxPriceImpactPct) return log.warn(`Skip: price impact ${impact.toFixed(1)}% > MAX_PRICE_IMPACT_PCT`);

  let received = BigInt(quote.outAmount);
  let txSig = "dry-run";
  if (config.dryRun) {
    log.trade(`[DRY RUN] would buy ${short(mint)} with ${size} SOL → ~${quote.outAmount} units`);
  } else {
    const before = await tokenBalance(connection, mint);
    txSig = await executeSwap(connection, config.wallet, quote);
    const actual = (await tokenBalance(connection, mint)) - before;
    if (actual > 0n) received = actual;
    log.trade(`BOUGHT ${short(mint)} for ${size} SOL — https://solscan.io/tx/${txSig}`);
  }
  addSpend(size);

  // Dry runs track simulated positions too, so exits and limits behave the same as live.
  const prev = state.positions[mint];
  state.positions[mint] = {
    mint,
    tokens: ((prev ? BigInt(prev.tokens) : 0n) + received).toString(),
    costSol: (prev?.costSol ?? 0) + size,
    openedAt: prev?.openedAt ?? Date.now(),
    copiedFrom: source,
  };
  save();
  recordTrade({ side: "buy", mint, sol: size, tokens: received.toString(), tx: txSig, source, dryRun: config.dryRun });
}

export async function copySell(connection: Connection, mint: string, fraction: number, reason: string) {
  const pos = state.positions[mint];
  if (!pos) return log.info(`Skip sell: no position in ${short(mint)}`);

  // Round near-full exits up so we don't leave dust behind.
  const sellAll = fraction >= 0.95;
  const held = config.dryRun ? BigInt(pos.tokens) : await tokenBalance(connection, mint);
  if (held === 0n) {
    delete state.positions[mint];
    save();
    return log.warn(`Position ${short(mint)} has zero balance on-chain, dropping it`);
  }
  const amount = sellAll ? held : (held * BigInt(Math.round(fraction * 10_000))) / 10_000n;
  if (amount === 0n) return;

  const quote = await getQuote(mint, WSOL_MINT, amount, config.sellSlippageBps);
  const solOut = Number(quote.outAmount) / LAMPORTS_PER_SOL;
  const pct = `${(sellAll ? 100 : fraction * 100).toFixed(0)}%`;

  if (config.dryRun) {
    log.trade(`[DRY RUN] would sell ${pct} of ${short(mint)} (${reason}) → ~${solOut.toFixed(4)} SOL`);
    recordTrade({ side: "sell", mint, reason, fraction: sellAll ? 1 : fraction, solOut, dryRun: true });
  } else {
    const txSig = await executeSwap(connection, config.wallet, quote);
    recordTrade({ side: "sell", mint, reason, fraction: sellAll ? 1 : fraction, solOut, tx: txSig });
    log.trade(`SOLD ${pct} of ${short(mint)} (${reason}) → ~${solOut.toFixed(4)} SOL — https://solscan.io/tx/${txSig}`);
  }

  if (sellAll) delete state.positions[mint];
  else {
    const soldFrac = Number(amount) / Number(held);
    pos.tokens = (held - amount).toString();
    pos.costSol *= 1 - soldFrac;
  }
  save();
}

/** Periodically values every open position and exits on take-profit, stop-loss or max hold time. */
export function startExitMonitor(connection: Connection) {
  const tick = async () => {
    for (const pos of Object.values(state.positions)) {
      if (busy.has(pos.mint)) continue;
      try {
        const quote = await getQuote(pos.mint, WSOL_MINT, BigInt(pos.tokens), config.sellSlippageBps);
        const value = Number(quote.outAmount) / LAMPORTS_PER_SOL;
        const pnl = ((value - pos.costSol) / pos.costSol) * 100;
        const heldMin = (Date.now() - pos.openedAt) / 60_000;

        let reason: string | null = null;
        if (config.takeProfitPct > 0 && pnl >= config.takeProfitPct) reason = `take-profit +${pnl.toFixed(0)}%`;
        else if (config.stopLossPct > 0 && pnl <= -config.stopLossPct) reason = `stop-loss ${pnl.toFixed(0)}%`;
        else if (config.maxHoldMinutes > 0 && heldMin >= config.maxHoldMinutes) reason = `max-hold ${heldMin.toFixed(0)}m`;

        if (reason) await withLock(pos.mint, () => copySell(connection, pos.mint, 1, reason));
      } catch (e) {
        log.warn(`Price check failed for ${short(pos.mint)}: ${(e as Error).message}`);
      }
    }
    setTimeout(tick, config.priceCheckIntervalSec * 1000);
  };
  setTimeout(tick, config.priceCheckIntervalSec * 1000);
}
