'use strict';
const { chunk } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const { getJson, userError, enc, cache } = require('../search/_http');

const HOSTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];
const MAJORS = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'CAD', 'AUD', 'CHF', 'BRL', 'TRY', 'MXN'];
const rateCache = cache(30 * 60 * 1000);
const listCache = cache(24 * 60 * 60 * 1000);

/** Frankfurter (ECB reference rates), trying the current domain first and the legacy one second. */
async function frankfurter(path, notFound) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      return await getJson(`${host}${path}`, { notFound });
    } catch (err) {
      if (err.userMessage) throw err; // real "unknown currency" answer — don't retry
      lastErr = err;
    }
  }
  throw lastErr;
}

const fmt = (n, cur) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: n < 1 ? 6 : 2 }).format(n);
  } catch {
    return `${n.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${cur}`;
  }
};

module.exports = [
  {
    name: 'currency',
    aliases: ['fx', 'exchange', 'forex', 'convertcurrency'],
    description: 'Convert money between currencies (ECB rates), e.g. 100 usd eur',
    usage: '[amount] <from> [to …]',
    examples: ['100 usd eur', '50 gbp to jpy', 'eur', '1 usd eur gbp inr'],
    minArgs: 1,
    cooldown: 3,
    slash: true,
    args: [
      { name: 'amount', type: 'number', description: 'How much', required: true, min: 0 },
      { name: 'from', type: 'string', description: 'From currency, e.g. USD', required: true, maxLength: 3 },
      { name: 'to', type: 'string', description: 'To currency (or several: EUR GBP JPY)', required: false, rest: true },
    ],
    async execute(ctx) {
      const args = ctx.args.flatMap((a) => a.split(/[\s,]+/)).filter((a) => a && a.toLowerCase() !== 'to' && a.toLowerCase() !== 'in');
      let amount = 1;
      if (/^[\d.,]+$/.test(args[0] || '')) amount = parseFloat(args.shift().replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount < 0) return ctx.usage('The amount must be a positive number.');
      const [from, ...targets] = args.map((a) => a.toUpperCase());
      if (!/^[A-Z]{3}$/.test(from || '') || !targets.every((t) => /^[A-Z]{3}$/.test(t))) {
        return ctx.usage(`Use 3-letter codes like USD, EUR, GBP (\`${ctx.prefix}currencies\` lists them). For crypto use \`${ctx.prefix}cryptoconvert\`.`);
      }
      const to = (targets.length ? targets : MAJORS.filter((c) => c !== from).slice(0, 8)).filter((t) => t !== from).slice(0, 15);
      if (!to.length) return ctx.info(`${fmt(amount, from)} is… ${fmt(amount, from)}. 🙂`);
      await ctx.defer();
      const data = await rateCache(`${from}:${to.join(',')}`, () =>
        frankfurter(`/latest?from=${enc(from)}&to=${enc(to.join(','))}`, `Unknown currency in **${[from, ...to].join(', ')}**. See \`${ctx.prefix}currencies\` (crypto: \`${ctx.prefix}cryptoconvert\`).`),
      );
      const rates = data?.rates || {};
      if (!Object.keys(rates).length) throw userError('No exchange rates came back.');
      const lines = Object.entries(rates).map(([cur, rate]) => `**${fmt(amount * rate, cur)}** ${cur}  \`1 ${from} = ${rate} ${cur}\``);
      await ctx.reply({ embeds: [ctx.embed({ title: `💱 ${fmt(amount, from)} ${from}`, description: lines.join('\n'), footer: `ECB reference rates via Frankfurter • ${data.date}` })] });
    },
  },
  {
    name: 'currencies',
    aliases: ['currencylist', 'fxlist'],
    description: 'List the currency codes supported by currency',
    cooldown: 5,
    async execute(ctx) {
      await ctx.defer();
      const list = await listCache('all', () => frankfurter('/currencies', 'Currency list unavailable.'));
      const entries = Object.entries(list || {});
      if (!entries.length) throw userError('Currency list unavailable.');
      const pages = chunk(entries, 20).map((part, i, all) =>
        ctx.embed({ title: `💱 Supported currencies (${entries.length})`, description: part.map(([code, name]) => `\`${code}\` ${name}`).join('\n'), footer: `Page ${i + 1}/${all.length} • crypto: ${ctx.prefix}crypto` }),
      );
      await paginate(ctx, pages);
    },
  },
];
