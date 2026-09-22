import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { config } from "./config.js";

export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  [k: string]: unknown;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.jupiterApiKey) h["x-api-key"] = config.jupiterApiKey;
  return h;
}

export async function getQuote(inputMint: string, outputMint: string, amount: bigint, slippageBps: number): Promise<Quote> {
  const url = new URL(`${config.jupiterApiUrl}/quote`);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amount.toString());
  url.searchParams.set("slippageBps", String(slippageBps));
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${await res.text()}`);
  return (await res.json()) as Quote;
}

/** Builds, signs, sends and confirms the swap for a quote. Returns the transaction signature. */
export async function executeSwap(connection: Connection, wallet: Keypair, quote: Quote): Promise<string> {
  const res = await fetch(`${config.jupiterApiUrl}/swap`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: false,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: config.priorityFeeMaxLamports, priorityLevel: "veryHigh" },
      },
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap ${res.status}: ${await res.text()}`);
  const { swapTransaction, lastValidBlockHeight } = (await res.json()) as {
    swapTransaction: string;
    lastValidBlockHeight: number;
  };

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([wallet]);

  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  const result = await connection.confirmTransaction(
    { signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) throw new Error(`Swap ${signature} failed on-chain: ${JSON.stringify(result.value.err)}`);
  return signature;
}
