import type { ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS = 1_000_000_000;

export type SwapSignal =
  | { side: "buy"; mint: string; solAmount: number; tokenAmount: bigint }
  | { side: "sell"; mint: string; solAmount: number; tokenAmount: bigint; fractionSold: number };

/**
 * Infers what the target wallet did in a transaction from its balance changes, which works
 * regardless of which DEX/aggregator/bot (Pump.fun, Raydium, Jupiter, Photon, FOMO…) it used.
 * Returns null for anything that isn't a single SOL <-> token swap.
 */
export function detectSwap(tx: ParsedTransactionWithMeta, target: PublicKey): SwapSignal | null {
  const meta = tx.meta;
  if (!meta || meta.err) return null;

  const owner = target.toBase58();
  const keys = tx.transaction.message.accountKeys;
  const idx = keys.findIndex((k) => k.pubkey.toBase58() === owner);
  if (idx < 0) return null;

  // Native SOL delta, excluding the network fee if the target paid it.
  let solDelta = meta.postBalances[idx] - meta.preBalances[idx];
  if (idx === 0) solDelta += meta.fee;

  // Aggregate token balance deltas owned by the target, per mint (raw units).
  const pre = new Map<string, bigint>();
  const post = new Map<string, bigint>();
  for (const b of meta.preTokenBalances ?? [])
    if (b.owner === owner) pre.set(b.mint, (pre.get(b.mint) ?? 0n) + BigInt(b.uiTokenAmount.amount));
  for (const b of meta.postTokenBalances ?? [])
    if (b.owner === owner) post.set(b.mint, (post.get(b.mint) ?? 0n) + BigInt(b.uiTokenAmount.amount));

  const deltas = new Map<string, bigint>();
  for (const mint of new Set([...pre.keys(), ...post.keys()])) {
    const d = (post.get(mint) ?? 0n) - (pre.get(mint) ?? 0n);
    if (d !== 0n) deltas.set(mint, d);
  }

  // Wrapped SOL counts as SOL.
  const wsol = deltas.get(WSOL_MINT);
  if (wsol !== undefined) {
    solDelta += Number(wsol);
    deltas.delete(WSOL_MINT);
  }

  if (deltas.size !== 1) return null;
  const [mint, tokenDelta] = [...deltas.entries()][0];
  const sol = Math.abs(solDelta) / LAMPORTS;
  // Ignore dust SOL movements (rent, tips) that aren't really the swap leg.
  if (sol < 0.001) return null;

  if (tokenDelta > 0n && solDelta < 0) return { side: "buy", mint, solAmount: sol, tokenAmount: tokenDelta };

  if (tokenDelta < 0n && solDelta > 0) {
    const sold = -tokenDelta;
    const before = pre.get(mint) ?? sold;
    const fractionSold = before > 0n ? Number((sold * 10_000n) / before) / 10_000 : 1;
    return { side: "sell", mint, solAmount: sol, tokenAmount: sold, fractionSold };
  }

  return null;
}
