# FOMO copy bot

Watches one or more Solana wallets and mirrors their memecoin trades from your own wallet.

- **Detects** buys and sells from each target's balance changes, so it works whatever the target trades through: Pump.fun, Raydium, Jupiter, FOMO, Photon, and so on.
- **Executes** through Jupiter, which routes Pump.fun bonding-curve tokens and every major DEX.
- **Feeds** from a websocket log subscription, with signature polling as a backup. Duplicate signals are dropped.
- **Exits** in three ways: it copies the target's sells at the same fraction, and it closes positions on take-profit, stop-loss and max-hold time.
- **Limits risk** with a per-trade cap, a daily SOL limit, a max number of open positions, a SOL reserve, a price-impact guard, a stale-signal filter and a per-token lock.

## Setup

```bash
cd bot
npm install
cp .env.example .env   # fill in RPC_URL, PRIVATE_KEY, TARGET_WALLETS
npm start
```

Every option is documented in `.env.example`. Set `DRY_RUN=true` to run the full loop without sending transactions. It still takes quotes and tracks positions and exits.

The bot has to run continuously, so run it on a VPS or any always-on machine (for example with `pm2 start "npm start" --name fomo-bot`). Serverless platforms like Vercel won't work because they can't hold a websocket open.

## Files

| File | Purpose |
| --- | --- |
| `src/index.ts` | Startup, websocket and polling feeds |
| `src/detector.ts` | Turns a parsed transaction into a buy/sell signal |
| `src/trader.ts` | Sizing, risk checks, copy buy/sell, TP/SL monitor |
| `src/jupiter.ts` | Quote and swap via the Jupiter API |
| `src/state.ts` | Positions and daily spend (`data/state.json`), trade log (`data/trades.jsonl`) |

## Warnings

- Use a **dedicated hot wallet** that holds only what you're willing to lose. The private key sits in `.env`.
- Memecoin copy trading loses money more often than not. You buy after the target, at a worse price, and many tokens are rugs or honeypots that can't be sold.
- Use a paid RPC. The public endpoint rate-limits and adds latency, which costs you entry price.

Run `npm test` to run the detector unit tests, and `npm run typecheck` to check types.
