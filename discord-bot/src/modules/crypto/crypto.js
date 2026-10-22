'use strict';
const { discordTimestamp, formatNumber, truncate } = require('../../core/utils');
const { colors } = require('../../core/embeds');
const { button, row } = require('../../core/ui');
const { getJson, userError, stripHtml } = require('../search/_http');
const cg = require('./_coingecko');

// Currencies CoinGecko can quote prices in (subset of /simple/supported_vs_currencies).
const VS = new Set(
  ('usd eur gbp jpy inr cad aud chf cny krw brl rub try pkr idr php mxn sek nok dkk pln zar sgd hkd nzd thb aed sar ils czk huf ' +
    'myr vnd uah ngn twd clp ars bdt kwd bhd lkr mmk gel btc eth ltc bch bnb xrp xlm dot link sats bits').split(' '),
);
const isVs = (s) => VS.has(String(s || '').toLowerCase());
const amountText = (n) => (n !== 0 && Math.abs(n) < 1e-8 ? n.toExponential(4) : n.toLocaleString('en-US', { maximumFractionDigits: 8 }));

async function priceReply(ctx, coin, vs) {
  const cur = (vs || 'usd').toLowerCase();
  if (!isVs(cur)) return ctx.fail(`I can't quote prices in **${cur.toUpperCase()}**. Try usd, eur, gbp, jpy, inr, pkr, btc, eth…`);
  await ctx.defer();
  const p = await cg.price(coin.id, cur);
  await ctx.reply({
    embeds: [
      ctx.embed({
        title: `🪙 ${coin.name} (${(coin.symbol || '').toUpperCase()})`,
        url: `https://www.coingecko.com/en/coins/${coin.id}`,
        thumbnail: coin.thumb,
        color: p.change >= 0 ? colors.success : colors.error,
        description: `## ${cg.money(p.price, cur)}`,
        fields: [
          { name: '24h change', value: cg.pct(p.change), inline: true },
          { name: 'Market cap', value: cg.compact(p.marketCap, cur), inline: true },
          { name: '24h volume', value: cg.compact(p.volume, cur), inline: true },
        ],
        footer: `Data: CoinGecko • updated ${p.updated ? new Date(p.updated * 1000).toISOString().slice(11, 16) + ' UTC' : 'just now'}`,
      }),
    ],
  });
}

const shortcutCommands = Object.entries(cg.SHORTCUTS).map(([sym, [id, name]]) => ({
  name: sym,
  description: `Live ${name} (${sym.toUpperCase()}) price`,
  usage: '[currency]',
  examples: ['', 'eur'],
  cooldown: 3,
  async execute(ctx) {
    await priceReply(ctx, { id, name, symbol: sym }, ctx.args[0]);
  },
}));

module.exports = [
  {
    name: 'crypto',
    aliases: ['cprice', 'cryptoprice'],
    description: 'Live price of any cryptocurrency (by symbol or name)',
    usage: '<coin> [currency]',
    examples: ['btc', 'ethereum eur', 'shiba inu'],
    minArgs: 1,
    cooldown: 3,
    slash: true,
    args: [
      { name: 'coin', type: 'string', description: 'Symbol or name, e.g. btc, ethereum', required: true },
      { name: 'currency', type: 'string', description: 'usd (default), eur, gbp, jpy, inr, btc…', required: false },
    ],
    async execute(ctx) {
      let vs = null;
      let words = [...ctx.args];
      if (words.length > 1 && isVs(words[words.length - 1])) vs = words.pop();
      const coin = await cg.resolveCoin(words.join(' '));
      await priceReply(ctx, coin, vs);
    },
  },
  {
    name: 'coininfo',
    aliases: ['cryptoinfo', 'tokeninfo'],
    description: 'Detailed stats for a coin: ATH, supply, 7d/30d change',
    usage: '<coin>',
    examples: ['eth'],
    minArgs: 1,
    cooldown: 5,
    async execute(ctx) {
      const coin = await cg.resolveCoin(ctx.rest(0));
      await ctx.defer();
      const d = await cg.coinDetails(coin.id);
      const m = d.market_data || {};
      const usd = (o) => o?.usd;
      const home = d.links?.homepage?.find(Boolean);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🪙 ${d.name} (${d.symbol?.toUpperCase()})${d.market_cap_rank ? ` — #${d.market_cap_rank}` : ''}`,
            url: `https://www.coingecko.com/en/coins/${d.id}`,
            thumbnail: d.image?.large,
            description: truncate(stripHtml(d.description?.en || '').split('\n')[0], 600) || null,
            fields: [
              { name: 'Price', value: cg.money(usd(m.current_price)), inline: true },
              { name: '24h', value: cg.pct(m.price_change_percentage_24h), inline: true },
              { name: '7d', value: cg.pct(m.price_change_percentage_7d), inline: true },
              { name: '30d', value: cg.pct(m.price_change_percentage_30d), inline: true },
              { name: '1y', value: cg.pct(m.price_change_percentage_1y), inline: true },
              { name: '24h range', value: `${cg.money(usd(m.low_24h))} – ${cg.money(usd(m.high_24h))}`, inline: true },
              { name: 'Market cap', value: cg.compact(usd(m.market_cap)), inline: true },
              { name: 'Volume (24h)', value: cg.compact(usd(m.total_volume)), inline: true },
              { name: 'All-time high', value: usd(m.ath) ? `${cg.money(usd(m.ath))} (${discordTimestamp(m.ath_date?.usd, 'D')})` : '—', inline: true },
              { name: 'Circulating', value: m.circulating_supply ? formatNumber(Math.round(m.circulating_supply)) : '—', inline: true },
              { name: 'Max supply', value: m.max_supply ? formatNumber(Math.round(m.max_supply)) : '∞ / unknown', inline: true },
            ],
            footer: 'Data: CoinGecko',
          }),
        ],
        components: home ? [row(button(home, 'Website', 'Link'))] : [],
      });
    },
  },
  {
    name: 'cryptotop',
    aliases: ['topcoins', 'cryptomarket'],
    description: 'Top cryptocurrencies by market cap',
    usage: '[count up to 25] [currency]',
    examples: ['', '20', '10 eur'],
    cooldown: 5,
    async execute(ctx) {
      const n = Math.min(Math.max(parseInt(ctx.args[0], 10) || 10, 1), 25);
      const cur = (ctx.args.find((a) => isVs(a)) || 'usd').toLowerCase();
      await ctx.defer();
      const list = await cg.markets(cur, 25);
      if (!Array.isArray(list) || !list.length) throw userError('No market data came back.');
      const lines = list.slice(0, n).map((c) => `\`${String(c.market_cap_rank ?? '?').padStart(2)}\` **${c.name}** (${c.symbol.toUpperCase()}) — ${cg.money(c.current_price, cur)} ${cg.pct(c.price_change_percentage_24h)}`);
      await ctx.reply({ embeds: [ctx.embed({ title: `📈 Top ${n} coins (${cur.toUpperCase()})`, description: lines.join('\n'), footer: 'Data: CoinGecko • 24h change' })] });
    },
  },
  {
    name: 'cryptotrending',
    aliases: ['trendingcoins', 'hotcoins'],
    description: 'Coins trending on CoinGecko right now',
    cooldown: 5,
    async execute(ctx) {
      await ctx.defer();
      const data = await cg.trending();
      const coins = (data?.coins || []).map((c) => c.item).slice(0, 15);
      if (!coins.length) throw userError('No trending data right now.');
      const lines = coins.map((c, i) => {
        const p = c.data?.price;
        const change = c.data?.price_change_percentage_24h?.usd;
        const priceText = typeof p === 'number' ? cg.money(p) : p ? String(p) : '';
        return `**${i + 1}.** ${c.name} (${c.symbol}) ${c.market_cap_rank ? `#${c.market_cap_rank}` : ''} ${priceText} ${change !== undefined ? cg.pct(change) : ''}`.trim();
      });
      await ctx.reply({ embeds: [ctx.embed({ title: '🔥 Trending coins', description: lines.join('\n'), footer: 'Data: CoinGecko (based on searches)' })] });
    },
  },
  {
    name: 'cryptoconvert',
    aliases: ['cconvert', 'coinconvert'],
    description: 'Convert between crypto and fiat, e.g. 0.5 btc usd or 100 usd eth',
    usage: '<amount> <from> <to>',
    examples: ['0.5 btc usd', '100 usd eth', '2 eth btc'],
    minArgs: 3,
    cooldown: 4,
    async execute(ctx) {
      const amount = parseFloat(String(ctx.args[0]).replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) return ctx.usage('The amount must be a positive number.');
      const from = ctx.args[1].toLowerCase();
      const to = (ctx.args[2] === 'to' ? ctx.args[3] : ctx.args[2])?.toLowerCase();
      if (!to) return ctx.usage();
      await ctx.defer();
      // Anything we can quote in that isn't itself a coin ticker counts as "fiat" here.
      const isFiat = (code) => isVs(code) && !cg.SHORTCUTS[code] && !['sats', 'bits'].includes(code);
      const [fromFiat, toFiat] = [isFiat(from), isFiat(to)];
      let result;
      let rateText;
      if (!fromFiat && toFiat) {
        const coin = await cg.resolveCoin(from);
        const p = await cg.price(coin.id, to);
        result = amount * p.price;
        rateText = `1 ${coin.symbol.toUpperCase()} = ${cg.money(p.price, to)}`;
        return ctx.info(`💱 **${amountText(amount)} ${coin.symbol.toUpperCase()}** = **${cg.money(result, to)}**\n${rateText}`);
      }
      if (fromFiat && !toFiat) {
        const coin = await cg.resolveCoin(to);
        const p = await cg.price(coin.id, from);
        result = amount / p.price;
        return ctx.info(`💱 **${cg.money(amount, from)}** = **${amountText(result)} ${coin.symbol.toUpperCase()}**\n1 ${coin.symbol.toUpperCase()} = ${cg.money(p.price, from)}`);
      }
      if (!fromFiat && !toFiat) {
        const [a, b] = [await cg.resolveCoin(from), await cg.resolveCoin(to)];
        const [pa, pb] = [await cg.price(a.id, 'usd'), await cg.price(b.id, 'usd')];
        result = (amount * pa.price) / pb.price;
        return ctx.info(`💱 **${amountText(amount)} ${a.symbol.toUpperCase()}** = **${amountText(result)} ${b.symbol.toUpperCase()}**\n(via USD: ${cg.money(amount * pa.price)})`);
      }
      return ctx.fail(`Both are regular currencies — use \`${ctx.prefix}currency ${ctx.args.join(' ')}\`.`);
    },
  },
  {
    name: 'feargreed',
    aliases: ['fng', 'fearandgreed'],
    description: 'Crypto Fear & Greed Index',
    cooldown: 5,
    async execute(ctx) {
      await ctx.defer();
      const data = await getJson('https://api.alternative.me/fng/?limit=2');
      const [now, prev] = data?.data || [];
      if (!now) throw userError('The index is unavailable right now.');
      const v = +now.value;
      const bar = '█'.repeat(Math.round(v / 5)).padEnd(20, '░');
      const emoji = v < 25 ? '😱' : v < 45 ? '😟' : v < 55 ? '😐' : v < 75 ? '😀' : '🤑';
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `${emoji} Fear & Greed: ${v} — ${now.value_classification}`,
            color: v < 45 ? colors.error : v < 55 ? colors.warn : colors.success,
            description: `\`Fear ${bar} Greed\``,
            fields: [prev && { name: 'Yesterday', value: `${prev.value} — ${prev.value_classification}`, inline: true }],
            footer: 'Data: alternative.me',
          }),
        ],
      });
    },
  },
  ...shortcutCommands,
];
