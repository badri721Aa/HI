import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { detectSwap } from "./detector.js";
import { log, short } from "./log.js";
import { state } from "./state.js";
import { handleSignal, startExitMonitor } from "./trader.js";

const connection = new Connection(config.rpcUrl, { wsEndpoint: config.wsUrl, commitment: "confirmed" });
const seen = new Set<string>();

async function processSignature(sig: string, target: PublicKey) {
  if (seen.has(sig)) return;
  seen.add(sig);
  if (seen.size > 5000) seen.delete(seen.values().next().value!);

  try {
    const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return;
    if (tx.blockTime && Date.now() / 1000 - tx.blockTime > config.maxTxAgeSec) return;
    const signal = detectSwap(tx, target);
    if (signal) await handleSignal(connection, signal, target.toBase58(), sig);
  } catch (e) {
    log.err(`Failed to process ${short(sig)}: ${(e as Error).message}`);
  }
}

/** Realtime feed: websocket log subscription per target wallet. */
function subscribe(target: PublicKey) {
  connection.onLogs(target, ({ signature, err }) => {
    if (!err) void processSignature(signature, target);
  }, "confirmed");
}

/** Backup feed: polls recent signatures in case the websocket drops events. */
async function poll(target: PublicKey) {
  let last: string | undefined = (await connection.getSignaturesForAddress(target, { limit: 1 }))[0]?.signature;
  const tick = async () => {
    try {
      const sigs = await connection.getSignaturesForAddress(target, { until: last, limit: 25 });
      if (sigs.length) last = sigs[0].signature;
      for (const s of sigs.reverse()) if (!s.err) await processSignature(s.signature, target);
    } catch (e) {
      log.warn(`Poll failed for ${short(target.toBase58())}: ${(e as Error).message}`);
    }
    setTimeout(tick, config.pollIntervalSec * 1000);
  };
  setTimeout(tick, config.pollIntervalSec * 1000);
}

async function main() {
  const balance = (await connection.getBalance(config.wallet.publicKey)) / LAMPORTS_PER_SOL;
  log.ok(`FOMO copy bot starting ${config.dryRun ? "(DRY RUN)" : "(LIVE — real funds)"}`);
  log.info(`Wallet ${config.wallet.publicKey.toBase58()} — ${balance.toFixed(4)} SOL`);
  log.info(
    `Sizing: ${config.buyMode === "fixed" ? `${config.buyAmountSol} SOL fixed` : `${config.copyRatio}x target`}` +
      `, max ${config.maxSolPerTrade} SOL/trade, ${config.dailySolLimit} SOL/day, ${config.maxOpenPositions} positions`,
  );
  log.info(`Exits: TP +${config.takeProfitPct}%, SL -${config.stopLossPct}%, copy sells ${config.copySells ? "on" : "off"}`);
  log.info(`Open positions: ${Object.keys(state.positions).length}`);

  for (const t of config.targets) {
    subscribe(t);
    if (config.pollIntervalSec > 0) await poll(t);
    log.ok(`Watching ${t.toBase58()}`);
  }
  startExitMonitor(connection);
}

main().catch((e) => {
  log.err("Fatal", e);
  process.exit(1);
});

process.on("unhandledRejection", (e) => log.err("Unhandled rejection", e));
