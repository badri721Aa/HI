'use strict';
/**
 * Betting helpers. The bet is taken from the wallet *before* the game starts, so a
 * player can never spend the same coins twice; interactive games also hold a per-user lock.
 */
const db = require('../../core/db');
const { formatNumber } = require('../../core/utils');
const eco = require('../economy/_lib');

const busy = new Set(); // `${guildId}:${userId}` with an interactive game running

/**
 * Validates and deducts a bet. Returns { acc, bet, s, release } or null (after replying).
 * `interactive` games must call release() when they end.
 */
async function placeBet(ctx, raw, { interactive = false } = {}) {
  const k = eco.key(ctx.guild.id, ctx.author.id);
  if (interactive && busy.has(k)) {
    await ctx.fail('Finish your current game first!');
    return null;
  }
  if (raw === undefined) {
    await ctx.usage();
    return null;
  }
  const s = eco.settings(ctx.guild.id);
  const acc = eco.account(ctx.guild.id, ctx.author.id);
  const bet = eco.parseAmount(raw, Math.min(acc.wallet, s.maxBet));
  if (bet === null) {
    await ctx.usage();
    return null;
  }
  if (bet <= 0 || acc.wallet <= 0) {
    await ctx.fail(`You have no money to bet. Try \`daily\` or \`work\`.`);
    return null;
  }
  if (bet < s.minBet) {
    await ctx.fail(`The minimum bet is ${eco.money(ctx.guild.id, s.minBet)}.`);
    return null;
  }
  if (bet > s.maxBet) {
    await ctx.fail(`The maximum bet is ${eco.money(ctx.guild.id, s.maxBet)}.`);
    return null;
  }
  if (bet > acc.wallet) {
    await ctx.fail(`You only have ${eco.money(ctx.guild.id, acc.wallet)} in your wallet.`);
    return null;
  }
  acc.wallet -= bet;
  acc.stats.gambled += bet;
  acc.stats.gamesPlayed += 1;
  db.save();
  if (interactive) busy.add(k);
  return { acc, bet, s, release: () => busy.delete(k) };
}

/** Pays `amount` back (0 for a loss) and records win/loss stats. Returns the integer paid. */
function settle(acc, bet, amount) {
  const paid = Math.max(0, Math.floor(amount));
  acc.wallet += paid;
  const profit = paid - bet;
  if (profit > 0) {
    acc.stats.gambleWon += profit;
    acc.stats.biggestWin = Math.max(acc.stats.biggestWin || 0, profit);
  } else if (profit < 0) acc.stats.gambleLost += -profit;
  db.save();
  return paid;
}

/** Standard result line: "You won 🪙 500 (×2.00)" / "You lost 🪙 100". */
function outcome(guildId, bet, paid) {
  const m = (n) => eco.money(guildId, n);
  if (paid > bet) return `🎉 You won ${m(paid - bet)} profit (paid ${m(paid)}, ×${(paid / bet).toFixed(2)})`;
  if (paid === bet) return `🤝 Push — your ${m(bet)} bet was returned`;
  if (paid > 0) return `😬 You got back ${m(paid)} of your ${m(bet)} bet`;
  return `💸 You lost ${m(bet)}`;
}

const color = (bet, paid) => (paid > bet ? 0x57f287 : paid === bet ? 0xfee75c : 0xed4245);
const balanceFooter = (acc) => `Wallet: ${formatNumber(acc.wallet)}`;

module.exports = { placeBet, settle, outcome, color, balanceFooter, busy };
