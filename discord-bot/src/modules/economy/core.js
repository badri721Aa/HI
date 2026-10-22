'use strict';
const db = require('../../core/db');
const { formatNumber, chunk, discordTimestamp } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const lib = require('./_lib');
const { ITEMS } = require('./_items');

const g = (ctx) => ctx.guild.id;

async function targetOrSelf(ctx, i = 0) {
  if (!ctx.args[i]) return ctx.author;
  const u = await ctx.resolveUser(ctx.args[i]);
  return u || null;
}

/** Shared by daily/weekly/monthly. */
async function claim(ctx, kind) {
  const s = lib.settings(g(ctx));
  const acc = lib.account(g(ctx), ctx.author.id);
  if (await lib.onCooldown(ctx, acc, kind)) return;
  let amount = { daily: s.dailyAmount, weekly: s.weeklyAmount, monthly: s.monthlyAmount }[kind];
  let extra = '';
  if (kind === 'daily') {
    const last = acc.cooldowns.daily || 0;
    acc.streak = last && Date.now() - last < 2 * lib.DAY ? acc.streak + 1 : 1;
    const bonus = Math.floor(amount * Math.min(acc.streak - 1, 30) * 0.05);
    amount += bonus;
    extra = `\n🔥 Streak: **${acc.streak}** day${acc.streak === 1 ? '' : 's'}${bonus ? ` (+${formatNumber(bonus)} bonus)` : ''}`;
  }
  lib.setCooldown(acc, kind);
  lib.earn(acc, amount);
  lib.growBank(acc, Math.floor(amount / 10));
  await ctx.reply({
    embeds: [ctx.embed({ title: `🎁 ${kind[0].toUpperCase()}${kind.slice(1)} reward`, description: `You received ${lib.money(g(ctx), amount)}!${extra}\nNext claim ${discordTimestamp(Date.now() + lib.COOLDOWNS[kind], 'R')}.` })],
  });
}

async function move(ctx, dir) {
  const acc = lib.account(g(ctx), ctx.author.id);
  const space = Math.max(0, acc.bankCap - acc.bank);
  const available = dir === 'dep' ? Math.min(acc.wallet, space) : acc.bank;
  if (dir === 'dep' && !acc.wallet) return ctx.fail('Your wallet is empty.');
  if (dir === 'dep' && !space) return ctx.fail(`Your bank is full (${formatNumber(acc.bankCap)}). Grow it with \`work\`, \`daily\`, a 💳 Bank Card or \`upgradebank\`.`);
  if (dir !== 'dep' && !acc.bank) return ctx.fail('Your bank is empty.');
  const amount = lib.parseAmount(ctx.args[0], available);
  if (amount === null || amount <= 0) return ctx.usage();
  if (dir === 'dep') {
    if (amount > acc.wallet) return ctx.fail(`You only have ${lib.money(g(ctx), acc.wallet)} in your wallet.`);
    if (amount > space) return ctx.fail(`Your bank can only hold ${lib.money(g(ctx), space)} more (capacity ${formatNumber(acc.bankCap)}). Grow it with \`work\`, \`daily\`, a 💳 Bank Card or \`upgradebank\`.`);
    acc.wallet -= amount;
    acc.bank += amount;
  } else {
    if (amount > acc.bank) return ctx.fail(`You only have ${lib.money(g(ctx), acc.bank)} in the bank.`);
    acc.bank -= amount;
    acc.wallet += amount;
  }
  db.save();
  return ctx.ok(`${dir === 'dep' ? 'Deposited' : 'Withdrew'} ${lib.money(g(ctx), amount)}. Wallet: ${lib.money(g(ctx), acc.wallet)} • Bank: ${lib.money(g(ctx), acc.bank)}/${formatNumber(acc.bankCap)}`);
}

module.exports = [
  {
    name: 'balance',
    aliases: ['bal', 'wallet', 'money'],
    description: 'Show your (or someone\'s) wallet and bank balance',
    usage: '[@user]',
    examples: ['', '<@111111111111111111>'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Whose balance to show', required: false }],
    async execute(ctx) {
      const user = await targetOrSelf(ctx);
      if (!user) return ctx.fail('User not found.');
      if (user.bot) return ctx.fail('Bots do not have wallets.');
      const acc = lib.account(g(ctx), user.id);
      const nw = lib.networth(acc, ITEMS);
      await ctx.reply({
        embeds: [
          ctx.embed({
            author: { name: `${user.username}'s balance`, iconURL: user.displayAvatarURL?.() },
            fields: [
              { name: 'Wallet', value: lib.money(g(ctx), acc.wallet), inline: true },
              { name: 'Bank', value: `${lib.money(g(ctx), acc.bank)} / ${formatNumber(acc.bankCap)}`, inline: true },
              { name: 'Net worth', value: lib.money(g(ctx), nw.total), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'daily',
    description: 'Claim your daily reward (keep a streak for a bonus)',
    guildOnly: true,
    slash: true,
    args: [],
    cooldown: 3,
    execute: (ctx) => claim(ctx, 'daily'),
  },
  { name: 'weekly', description: 'Claim your weekly reward', guildOnly: true, cooldown: 3, execute: (ctx) => claim(ctx, 'weekly') },
  { name: 'monthly', description: 'Claim your monthly reward', guildOnly: true, cooldown: 3, execute: (ctx) => claim(ctx, 'monthly') },
  {
    name: 'deposit',
    aliases: ['dep'],
    description: 'Move coins from your wallet to your bank',
    usage: '<amount|all|half>',
    examples: ['100', 'all', 'half'],
    guildOnly: true,
    minArgs: 1,
    execute: (ctx) => move(ctx, 'dep'),
  },
  {
    name: 'withdraw',
    aliases: ['with', 'wd'],
    description: 'Move coins from your bank to your wallet',
    usage: '<amount|all|half>',
    examples: ['100', 'all'],
    guildOnly: true,
    minArgs: 1,
    execute: (ctx) => move(ctx, 'with'),
  },
  {
    name: 'pay',
    aliases: ['transfer', 'sendmoney'],
    description: 'Give coins from your wallet to another member',
    usage: '<@user> <amount>',
    examples: ['<@111111111111111111> 100'],
    guildOnly: true,
    minArgs: 2,
    cooldown: 5,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Who to pay', required: true },
      { name: 'amount', type: 'string', description: 'Amount (e.g. 500, 10k, all)', required: true },
    ],
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (user.id === ctx.author.id) return ctx.fail('You cannot pay yourself.');
      if (user.bot) return ctx.fail('Bots do not need money.');
      const acc = lib.account(g(ctx), ctx.author.id);
      const amount = lib.parseAmount(ctx.args[1], acc.wallet);
      if (amount === null || amount <= 0) return ctx.usage();
      if (amount > acc.wallet) return ctx.fail(`You only have ${lib.money(g(ctx), acc.wallet)} in your wallet.`);
      const other = lib.account(g(ctx), user.id);
      acc.wallet -= amount;
      acc.stats.spent += amount;
      other.wallet += amount;
      db.save();
      await ctx.ok(`You paid <@${user.id}> ${lib.money(g(ctx), amount)}.`);
    },
  },
  {
    name: 'leaderboard',
    aliases: ['lb', 'rich', 'baltop'],
    description: 'Richest members in this server',
    usage: '[total|wallet|bank]',
    examples: ['', 'wallet', 'bank'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'sort', type: 'string', description: 'What to rank by', required: false, choices: ['total', 'wallet', 'bank'] }],
    async execute(ctx) {
      const mode = ['wallet', 'bank'].includes(ctx.args[0]?.toLowerCase()) ? ctx.args[0].toLowerCase() : 'total';
      const value = (a) => (mode === 'wallet' ? a.wallet : mode === 'bank' ? a.bank : a.wallet + a.bank);
      const rows = lib.guildAccounts(g(ctx)).filter(([, a]) => value(a) > 0).sort((a, b) => value(b[1]) - value(a[1]));
      if (!rows.length) return ctx.info('Nobody has any money yet. Try `daily` or `work`!');
      const me = rows.findIndex(([id]) => id === ctx.author.id);
      const medals = ['🥇', '🥈', '🥉'];
      const pages = chunk(rows, 10).map((page, p) =>
        ctx.embed({
          title: `💰 ${ctx.guild.name} — ${mode} leaderboard`,
          description: page.map(([id, a], i) => `${medals[p * 10 + i] || `**${p * 10 + i + 1}.**`} <@${id}> — ${lib.money(g(ctx), value(a))}`).join('\n'),
          footer: me >= 0 ? `Your rank: #${me + 1} of ${rows.length}` : `${rows.length} ranked members`,
        }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'networth',
    aliases: ['nw'],
    description: 'Wallet + bank + the sell value of your items',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = await targetOrSelf(ctx);
      if (!user || user.bot) return ctx.fail('User not found.');
      const nw = lib.networth(lib.account(g(ctx), user.id), ITEMS);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📊 ${user.username}'s net worth`,
            description: `Wallet: ${lib.money(g(ctx), nw.wallet)}\nBank: ${lib.money(g(ctx), nw.bank)}\nItems: ${lib.money(g(ctx), nw.items)}\n━━━━━━━━━━\n**Total:** ${lib.money(g(ctx), nw.total)}`,
          }),
        ],
      });
    },
  },
  {
    name: 'cooldowns',
    aliases: ['cd'],
    description: 'See when your economy commands are ready again',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      const lines = Object.keys(lib.COOLDOWNS).map((name) => {
        const left = lib.cooldownLeft(acc, name);
        return `${left ? '⏳' : '✅'} \`${name}\` — ${left ? `ready ${discordTimestamp(Date.now() + left, 'R')}` : 'ready'}`;
      });
      await ctx.reply({ embeds: [ctx.embed({ title: '⏱️ Your cooldowns', description: lines.join('\n') })] });
    },
  },
  {
    name: 'interest',
    description: 'Collect daily bank interest (1% of your bank, max 10,000)',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      if (await lib.onCooldown(ctx, acc, 'interest')) return;
      const amount = Math.min(10000, Math.floor(acc.bank * 0.01));
      if (amount <= 0) return ctx.fail('You need coins in your bank to earn interest. Try `deposit`.');
      const room = Math.max(0, acc.bankCap - acc.bank);
      const toBank = Math.min(amount, room);
      acc.bank += toBank;
      acc.wallet += amount - toBank;
      acc.stats.earned += amount;
      lib.setCooldown(acc, 'interest');
      await ctx.ok(`🏦 You earned ${lib.money(g(ctx), amount)} in interest${amount - toBank ? ' (bank full — the rest went to your wallet)' : ''}.`);
    },
  },
  {
    name: 'upgradebank',
    aliases: ['bankupgrade'],
    description: 'Buy +10,000 bank capacity (price rises with your capacity)',
    usage: '[times]',
    examples: ['', '2'],
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      const times = Math.min(50, Math.max(1, parseInt(ctx.args[0] || '1', 10) || 1));
      let cost = 0;
      for (let i = 0; i < times; i++) cost += Math.floor((acc.bankCap + i * 10000) * 0.25);
      if (acc.wallet < cost) return ctx.fail(`That costs ${lib.money(g(ctx), cost)} but you have ${lib.money(g(ctx), acc.wallet)} in your wallet.`);
      acc.wallet -= cost;
      acc.stats.spent += cost;
      lib.growBank(acc, 10000 * times);
      await ctx.ok(`Bank capacity +${formatNumber(10000 * times)} → **${formatNumber(acc.bankCap)}** for ${lib.money(g(ctx), cost)}.`);
    },
  },
  {
    name: 'ecostats',
    aliases: ['economystats', 'moneystats'],
    description: 'Your lifetime economy statistics',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = await targetOrSelf(ctx);
      if (!user || user.bot) return ctx.fail('User not found.');
      const acc = lib.account(g(ctx), user.id);
      const s = acc.stats;
      const m = (n) => lib.money(g(ctx), n);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📈 ${user.username}'s economy stats`,
            fields: [
              { name: 'Earned', value: m(s.earned), inline: true },
              { name: 'Spent', value: m(s.spent), inline: true },
              { name: 'Daily streak', value: `🔥 ${acc.streak}`, inline: true },
              { name: 'Job', value: acc.job ? `${acc.job} (${acc.shifts} shifts)` : `Freelancer (${acc.shifts} shifts)`, inline: true },
              { name: 'Stolen from others', value: m(s.robbed), inline: true },
              { name: 'Times robbed', value: formatNumber(s.timesRobbed), inline: true },
              { name: 'Gambled', value: `${m(s.gambled)} over ${formatNumber(s.gamesPlayed)} games`, inline: true },
              { name: 'Gambling profit', value: `${s.gambleWon - s.gambleLost >= 0 ? '+' : '-'}${m(Math.abs(s.gambleWon - s.gambleLost))}`, inline: true },
              { name: 'Things caught', value: formatNumber(s.caught), inline: true },
            ],
          }),
        ],
      });
    },
  },
];

