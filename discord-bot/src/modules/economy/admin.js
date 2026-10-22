'use strict';
const db = require('../../core/db');
const { formatNumber } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const lib = require('./_lib');
const { parseItemAndAmount, label } = require('./_items');

const g = (ctx) => ctx.guild.id;
const MAX_BALANCE = 1e15;

/** Settings that `ecosettings <key> <value>` may change. */
const EDITABLE = {
  startbalance: { field: 'startBalance', type: 'int', min: 0, help: 'Wallet new members start with' },
  bankcap: { field: 'baseBankCap', type: 'int', min: 0, help: 'Starting bank capacity for new members' },
  daily: { field: 'dailyAmount', type: 'int', min: 0, help: 'Base daily reward' },
  weekly: { field: 'weeklyAmount', type: 'int', min: 0, help: 'Weekly reward' },
  monthly: { field: 'monthlyAmount', type: 'int', min: 0, help: 'Monthly reward' },
  minbet: { field: 'minBet', type: 'int', min: 1, help: 'Smallest allowed bet' },
  maxbet: { field: 'maxBet', type: 'int', min: 1, help: 'Largest allowed bet' },
  rob: { field: 'robEnabled', type: 'bool', help: 'Allow `rob` (on/off)' },
  robmin: { field: 'robMin', type: 'int', min: 0, help: 'Minimum wallet needed to rob / be robbed' },
  ticketprice: { field: 'lotteryTicketPrice', type: 'int', min: 1, help: 'Lottery ticket price' },
};

/** "<@user> <amount> [wallet|bank]" shared by add/remove/set money. */
async function parseMoneyArgs(ctx) {
  const user = await ctx.resolveUser(ctx.args[0]);
  if (!user || user.bot) {
    await ctx.fail('User not found.');
    return null;
  }
  const where = String(ctx.args[2] || 'wallet').toLowerCase() === 'bank' ? 'bank' : 'wallet';
  const acc = lib.account(g(ctx), user.id);
  const amount = lib.parseAmount(ctx.args[1], acc[where]);
  if (amount === null || amount < 0 || amount > MAX_BALANCE) {
    await ctx.usage();
    return null;
  }
  return { user, acc, where, amount };
}

module.exports = [
  {
    name: 'addmoney',
    aliases: ['givemoney'],
    description: 'Admin: add coins to a member\'s wallet or bank',
    usage: '<@user> <amount> [wallet|bank]',
    examples: ['<@111111111111111111> 1000', '<@111111111111111111> 5k bank'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const p = await parseMoneyArgs(ctx);
      if (!p) return;
      p.acc[p.where] = Math.min(MAX_BALANCE, p.acc[p.where] + p.amount);
      db.save();
      await ctx.ok(`Added ${lib.money(g(ctx), p.amount)} to <@${p.user.id}>'s ${p.where}. New ${p.where}: ${lib.money(g(ctx), p.acc[p.where])}.`);
    },
  },
  {
    name: 'removemoney',
    aliases: ['takemoney'],
    description: 'Admin: remove coins from a member\'s wallet or bank',
    usage: '<@user> <amount|all> [wallet|bank]',
    examples: ['<@111111111111111111> 500', '<@111111111111111111> all bank'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const p = await parseMoneyArgs(ctx);
      if (!p) return;
      const taken = Math.min(p.acc[p.where], p.amount);
      p.acc[p.where] -= taken;
      db.save();
      await ctx.ok(`Removed ${lib.money(g(ctx), taken)} from <@${p.user.id}>'s ${p.where}. New ${p.where}: ${lib.money(g(ctx), p.acc[p.where])}.`);
    },
  },
  {
    name: 'setmoney',
    aliases: ['setbalance'],
    description: 'Admin: set a member\'s wallet or bank to an exact amount',
    usage: '<@user> <amount> [wallet|bank]',
    examples: ['<@111111111111111111> 0', '<@111111111111111111> 10000 bank'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const p = await parseMoneyArgs(ctx);
      if (!p) return;
      p.acc[p.where] = p.amount;
      if (p.where === 'bank' && p.acc.bankCap < p.amount) p.acc.bankCap = p.amount;
      db.save();
      await ctx.ok(`Set <@${p.user.id}>'s ${p.where} to ${lib.money(g(ctx), p.amount)}.`);
    },
  },
  {
    name: 'additem',
    aliases: ['spawnitem'],
    description: 'Admin: give a member items out of thin air',
    usage: '<@user> <item> [amount]',
    examples: ['<@111111111111111111> lootbox 3'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user || user.bot) return ctx.fail('User not found.');
      const { item, amountRaw } = parseItemAndAmount(ctx.args.slice(1));
      if (!item) return ctx.fail('Unknown item.');
      const n = amountRaw === undefined ? 1 : lib.parseAmount(amountRaw, 0);
      if (!n || n < 1 || n > 1e6) return ctx.usage();
      lib.addItem(lib.account(g(ctx), user.id), item.id, n);
      await ctx.ok(`Gave <@${user.id}> ${label(item, n)}.`);
    },
  },
  {
    name: 'takeitem',
    aliases: ['deleteitem'],
    description: 'Admin: remove items from a member\'s inventory',
    usage: '<@user> <item> [amount|all]',
    examples: ['<@111111111111111111> cookie all'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user || user.bot) return ctx.fail('User not found.');
      const { item, amountRaw } = parseItemAndAmount(ctx.args.slice(1));
      if (!item) return ctx.fail('Unknown item.');
      const acc = lib.account(g(ctx), user.id);
      const owned = lib.itemCount(acc, item.id);
      const n = Math.min(owned, amountRaw === undefined ? 1 : lib.parseAmount(amountRaw, owned) || 0);
      if (n < 1) return ctx.fail(`<@${user.id}> has no ${label(item)}.`);
      lib.removeItem(acc, item.id, n);
      await ctx.ok(`Removed ${label(item, n)} from <@${user.id}>.`);
    },
  },
  {
    name: 'resetbalance',
    aliases: ['resetwallet'],
    description: 'Admin: wipe one member\'s economy account (money, items, stats)',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (!lib.peek(g(ctx), user.id)) return ctx.fail(`<@${user.id}> has no economy account.`);
      if (!(await confirm(ctx, `Reset <@${user.id}>'s money, items and stats? This cannot be undone.`))) return;
      db.delete('economy', lib.key(g(ctx), user.id));
      await ctx.ok(`<@${user.id}>'s economy account was reset.`);
    },
  },
  {
    name: 'reseteconomy',
    aliases: ['wipeeconomy'],
    description: 'Admin: wipe EVERY economy account in this server',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    cooldown: 10,
    async execute(ctx) {
      const accounts = lib.guildAccounts(g(ctx));
      if (!accounts.length) return ctx.fail('There is nothing to reset.');
      if (!(await confirm(ctx, `⚠️ Delete **${accounts.length}** economy accounts (money, items, jobs, stats)? This cannot be undone.`))) return;
      for (const [id] of accounts) db.delete('economy', lib.key(g(ctx), id));
      db.delete('lottery', g(ctx));
      await ctx.ok(`Wiped ${accounts.length} economy accounts.`);
    },
  },
  {
    name: 'setcurrency',
    aliases: ['currencysymbol'],
    description: 'Admin: change the currency symbol and name',
    usage: '<symbol> [name]',
    examples: ['💎 gems', '$ dollars'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const s = lib.settings(g(ctx));
      const symbol = ctx.args[0];
      if (symbol.length > 64 || /@(everyone|here)|<@&/.test(symbol)) return ctx.fail('That symbol is not allowed.');
      s.currency = symbol;
      if (ctx.args[1]) s.currencyName = ctx.rest(1).slice(0, 32);
      db.save();
      await ctx.ok(`Currency is now ${s.currency} **${s.currencyName}**. Example: ${lib.money(g(ctx), 1234)}`);
    },
  },
  {
    name: 'ecosettings',
    aliases: ['economysettings', 'ecoconfig'],
    description: 'Admin: view or change economy settings (rewards, bets, robbing…)',
    usage: '[setting] [value]',
    examples: ['', 'daily 2000', 'rob off', 'maxbet 1m'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      const s = lib.settings(g(ctx));
      if (!ctx.args[0]) {
        const lines = Object.entries(EDITABLE).map(([k, e]) => `\`${k}\` — **${e.type === 'bool' ? (s[e.field] ? 'on' : 'off') : formatNumber(s[e.field])}** • ${e.help}`);
        return ctx.reply({ embeds: [ctx.embed({ title: '⚙️ Economy settings', description: `Currency: ${s.currency} ${s.currencyName} (\`setcurrency\`)\n${lines.join('\n')}`, footer: 'Change with: ecosettings <setting> <value>' })] });
      }
      const e = EDITABLE[ctx.args[0].toLowerCase()];
      if (!e) return ctx.fail(`Unknown setting. Options: ${Object.keys(EDITABLE).map((k) => `\`${k}\``).join(', ')}`);
      if (!ctx.args[1]) return ctx.usage();
      let value;
      if (e.type === 'bool') {
        const v = ctx.args[1].toLowerCase();
        if (!['on', 'off', 'true', 'false', 'yes', 'no'].includes(v)) return ctx.fail('Use `on` or `off`.');
        value = ['on', 'true', 'yes'].includes(v);
      } else {
        value = lib.parseAmount(ctx.args[1], 0);
        if (value === null || value < e.min || value > MAX_BALANCE) return ctx.fail(`Value must be a whole number ≥ ${e.min}.`);
      }
      if (e.field === 'minBet' && value > s.maxBet) return ctx.fail('Min bet cannot be above max bet.');
      if (e.field === 'maxBet' && value < s.minBet) return ctx.fail('Max bet cannot be below min bet.');
      s[e.field] = value;
      db.save();
      await ctx.ok(`\`${ctx.args[0].toLowerCase()}\` set to **${e.type === 'bool' ? (value ? 'on' : 'off') : formatNumber(value)}**.`);
    },
  },
];
