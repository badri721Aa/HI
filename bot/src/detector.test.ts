import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { detectSwap, WSOL_MINT } from "./detector.js";

const target = Keypair.generate().publicKey;
const other = Keypair.generate().publicKey;
const MEME = "MemeMint111111111111111111111111111111111111";

type Bal = { mint: string; owner: string; amount: string };
function tx(opts: { targetIdx?: number; pre: number; post: number; fee?: number; preTok?: Bal[]; postTok?: Bal[]; err?: unknown }) {
  const idx = opts.targetIdx ?? 0;
  const keys = idx === 0 ? [target, other] : [other, target];
  const balances = (v: number) => (idx === 0 ? [v, 0] : [0, v]);
  const tok = (b: Bal[] = []) => b.map((x, i) => ({ accountIndex: i, mint: x.mint, owner: x.owner, uiTokenAmount: { amount: x.amount } }));
  return {
    transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey })) } },
    meta: {
      err: opts.err ?? null,
      fee: opts.fee ?? 5000,
      preBalances: balances(opts.pre),
      postBalances: balances(opts.post),
      preTokenBalances: tok(opts.preTok),
      postTokenBalances: tok(opts.postTok),
    },
  } as unknown as ParsedTransactionWithMeta;
}
const t = target.toBase58();

test("detects a SOL -> token buy, excluding the fee", () => {
  const s = detectSwap(tx({ pre: 2e9, post: 1.5e9 - 5000, postTok: [{ mint: MEME, owner: t, amount: "1000" }] }), target);
  assert.deepEqual(s, { side: "buy", mint: MEME, solAmount: 0.5, tokenAmount: 1000n });
});

test("detects a partial token -> SOL sell with fraction", () => {
  const s = detectSwap(
    tx({ pre: 1e9, post: 1.3e9, preTok: [{ mint: MEME, owner: t, amount: "1000" }], postTok: [{ mint: MEME, owner: t, amount: "750" }] }),
    target,
  );
  assert.equal(s?.side, "sell");
  assert.equal(s?.side === "sell" && s.fractionSold, 0.25);
});

test("treats WSOL legs as SOL", () => {
  const s = detectSwap(
    tx({
      pre: 1e9, post: 1e9 - 5000,
      preTok: [{ mint: WSOL_MINT, owner: t, amount: "400000000" }],
      postTok: [{ mint: WSOL_MINT, owner: t, amount: "0" }, { mint: MEME, owner: t, amount: "5" }],
    }),
    target,
  );
  assert.equal(s?.side, "buy");
  assert.equal(s?.solAmount, 0.4);
});

test("ignores other owners' balances, failed txs, token-to-token swaps and transfers", () => {
  const otherOwner = tx({ pre: 2e9, post: 1e9, postTok: [{ mint: MEME, owner: other.toBase58(), amount: "9" }] });
  assert.equal(detectSwap(otherOwner, target), null);
  const failed = tx({ pre: 2e9, post: 1e9, postTok: [{ mint: MEME, owner: t, amount: "9" }], err: { x: 1 } });
  assert.equal(detectSwap(failed, target), null);
  const tokenToToken = tx({
    pre: 1e9, post: 1e9 - 5000,
    preTok: [{ mint: "A".repeat(44), owner: t, amount: "10" }],
    postTok: [{ mint: "A".repeat(44), owner: t, amount: "0" }, { mint: MEME, owner: t, amount: "9" }],
  });
  assert.equal(detectSwap(tokenToToken, target), null);
  const receivedAirdrop = tx({ pre: 1e9, post: 1e9, postTok: [{ mint: MEME, owner: t, amount: "9" }] });
  assert.equal(detectSwap(receivedAirdrop, target), null);
});

test("does not subtract the fee when the target is not the fee payer", () => {
  const s = detectSwap(tx({ targetIdx: 1, pre: 2e9, post: 1e9, postTok: [{ mint: MEME, owner: t, amount: "1" }] }), target);
  assert.equal(s?.solAmount, 1);
});
