'use strict';
const db = require('../../core/db');
const { formatNumber, chunk } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const lib = require('./_lib');
const { ITEMS, findItem, parseItemAndAmount, label } = require('./_items');

const g = (ctx) => ctx.guild.id;
const TYPE_ORDER = ['tool', 'consumable', 'special', 'seed', 'collectible'];
const TYPE_LABEL = { tool: '🛠️ Tools', consumable: '🧪 Consumables', special: '🔮 Special', seed: '🌱 Seeds', collectible: '🏆 Collectibles' };

function itemEmbed(ctx, item, acc) {
  return ctx.embed({
    title: `${item.emoji} ${item.name}`,
    description: item.description,
    fields: [
      { name: 'ID', value: `\`${item.id}\``, inline: true },
      { name: 'Type', value: item.type, inline: true },
      { name: 'Buy', value: item.price ? lib.money(g(ctx), item.price) : 'Not sold in the shop', inline: true },
      { name: 'Sell', value: lib.money(g(ctx), item.sell), inline: true },
      { name: 'You own', value: formatNumber(acc ? lib.itemCount(acc, item.id) : 0), inline: true },
      { name: 'Aliases', value: item.aliases.length ? item.aliases.map((a) => `\`${a}\``).join(', ') : 'none', inline: true },
    ],
  });
}

/** Parse an amount for an item action; "all"/"max" relative to `max`. */
function itemAmount(raw, max) {
  if (raw === undefined) return 1;
  const n = lib.parseAmount(raw, max);
  return n && n > 0 ? n : null;
}

async function transferItem(ctx, { gift = false } = {}) {
  const user = await ctx.resolveUser(ctx.args[0]);
  if (!user) return ctx.fail('User not found.');
  if (user.id === ctx.author.id) return ctx.fail(`You cannot ${gift ? 'gift' : 'give'} items to yourself.`);
  if (user.bot) return ctx.fail('Bots have no inventory.');
  const { item, amountRaw } = parseItemAndAmount(ctx.args.slice(1));
  if (!item) return ctx.fail('Unknown item. See `shop` or `inventory`.');
  const acc = lib.account(g(ctx), ctx.author.id);
  const owned = lib.itemCount(acc, item.id);
  const n = itemAmount(amountRaw, owned);
  if (!n) return ctx.usage();
  if (owned < n) return ctx.fail(`You only have ${label(item, owned)}.`);
  const other = lib.account(g(ctx), user.id);
  lib.removeItem(acc, item.id, n);
  lib.addItem(other, item.id, n);
  if (gift) acc.stats.giftsGiven += n;
  db.save();
  return ctx.reply({
    embeds: [ctx.embed({ description: gift ? `🎀 <@${ctx.author.id}> gifted <@${user.id}> ${label(item, n)}! How sweet.` : `📦 You gave <@${user.id}> ${label(item, n)}.` })],
  });
}

module.exports = [
  {
    name: 'shop',
    aliases: ['store', 'market'],
    description: 'Browse items you can buy',
    usage: '[item]',
    examples: ['', 'rod'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'item', type: 'string', description: 'Show details for one item', required: false, rest: true }],
    async execute(ctx) {
      if (ctx.args[0]) {
        const item = findItem(ctx.rest(0));
        if (!item) return ctx.fail('Unknown item.');
        return ctx.reply({ embeds: [itemEmbed(ctx, item, lib.peek(g(ctx), ctx.author.id))] });
      }
      const forSale = Object.values(ITEMS).filter((i) => i.price).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.price - b.price);
      const pages = chunk(forSale, 8).map((page) =>
        ctx.embed({
          title: '🛒 Shop',
          description: page.map((i) => `${i.emoji} **${i.name}** — ${lib.money(g(ctx), i.price)} • \`${i.id}\`\n└ ${TYPE_LABEL[i.type]} • ${i.description}`).join('\n'),
          footer: 'Buy with: buy <item> [amount] • Details: shop <item>',
        }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'buy',
    aliases: ['purchase'],
    description: 'Buy an item from the shop',
    usage: '<item> [amount|max]',
    examples: ['cookie', 'cookie 3', 'fishing rod', 'padlock max'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [
      { name: 'item', type: 'string', description: 'Item name or id', required: true },
      { name: 'amount', type: 'string', description: 'How many (number or "max")', required: false },
    ],
    async execute(ctx) {
      const { item, amountRaw } = parseItemAndAmount(ctx.args);
      if (!item) return ctx.fail('Unknown item. See `shop`.');
      if (!item.price) return ctx.fail(`${label(item)} is not sold in the shop — you have to find it.`);
      const acc = lib.account(g(ctx), ctx.author.id);
      const n = itemAmount(amountRaw, Math.floor(acc.wallet / item.price));
      if (!n) return amountRaw && /^(all|max)$/i.test(amountRaw) ? ctx.fail(`You cannot afford even one ${label(item)}.`) : ctx.usage();
      if (n > 10000) return ctx.fail('You can buy at most 10,000 at a time.');
      const cost = item.price * n;
      if (cost > acc.wallet) return ctx.fail(`${label(item, n)} costs ${lib.money(g(ctx), cost)} — you have ${lib.money(g(ctx), acc.wallet)} in your wallet.`);
      acc.wallet -= cost;
      acc.stats.spent += cost;
      lib.addItem(acc, item.id, n);
      await ctx.ok(`You bought ${label(item, n)} for ${lib.money(g(ctx), cost)}.`);
    },
  },
  {
    name: 'sell',
    description: 'Sell items for coins',
    usage: '<item> [amount|all]',
    examples: ['fish', 'fish all', 'diamond 2'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const { item, amountRaw } = parseItemAndAmount(ctx.args);
      if (!item) return ctx.fail('Unknown item. See `inventory`.');
      const acc = lib.account(g(ctx), ctx.author.id);
      const owned = lib.itemCount(acc, item.id);
      if (!owned) return ctx.fail(`You do not have any ${label(item)}.`);
      const n = itemAmount(amountRaw, owned);
      if (!n) return ctx.usage();
      if (n > owned) return ctx.fail(`You only have ${label(item, owned)}.`);
      lib.removeItem(acc, item.id, n);
      const total = lib.earn(acc, item.sell * n);
      await ctx.ok(`You sold ${label(item, n)} for ${lib.money(g(ctx), total)}.`);
    },
  },
  {
    name: 'sellall',
    aliases: ['sellcollectibles'],
    description: 'Sell all your collectibles (fish, ores, crops…) at once',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      // Never auto-sell flex items bought from the shop.
      const sellable = Object.entries(acc.inventory).filter(([id]) => ITEMS[id]?.type === 'collectible' && !ITEMS[id].price);
      if (!sellable.length) return ctx.fail('You have no collectibles to sell.');
      let total = 0;
      const lines = [];
      for (const [id, n] of sellable) {
        lib.removeItem(acc, id, n);
        total += ITEMS[id].sell * n;
        lines.push(label(ITEMS[id], n));
      }
      lib.earn(acc, total);
      await ctx.reply({ embeds: [ctx.embed({ title: '💸 Sold everything', description: `${lines.join(', ')}\n\nTotal: ${lib.money(g(ctx), total)}` })] });
    },
  },
  {
    name: 'inventory',
    aliases: ['inv', 'items', 'backpack'],
    description: 'See your (or someone\'s) items',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Whose inventory', required: false }],
    async execute(ctx) {
      const user = ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : ctx.author;
      if (!user || user.bot) return ctx.fail('User not found.');
      const acc = lib.account(g(ctx), user.id);
      const owned = Object.entries(acc.inventory).filter(([id, n]) => ITEMS[id] && n > 0);
      if (!owned.length) return ctx.info(`${user.id === ctx.author.id ? 'Your' : `${user.username}'s`} inventory is empty. Visit the \`shop\`!`);
      owned.sort((a, b) => TYPE_ORDER.indexOf(ITEMS[a[0]].type) - TYPE_ORDER.indexOf(ITEMS[b[0]].type) || ITEMS[b[0]].sell - ITEMS[a[0]].sell);
      const worth = owned.reduce((n, [id, c]) => n + ITEMS[id].sell * c, 0);
      const pages = chunk(owned, 15).map((page) =>
        ctx.embed({
          title: `🎒 ${user.username}'s inventory`,
          description: page.map(([id, n]) => `${label(ITEMS[id], n)} — \`${id}\``).join('\n'),
          footer: `${owned.length} kinds of items • worth ${formatNumber(worth)} when sold`,
        }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'use',
    aliases: ['consume'],
    description: 'Use a consumable item (loot boxes, charms, energy drinks…)',
    usage: '<item> [amount]',
    examples: ['cookie', 'lootbox 2'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const { item, amountRaw } = parseItemAndAmount(ctx.args);
      if (!item) return ctx.fail('Unknown item.');
      const acc = lib.account(g(ctx), ctx.author.id);
      const owned = lib.itemCount(acc, item.id);
      if (!owned) return ctx.fail(`You do not have any ${label(item)}.${item.price ? ` Buy one with \`buy ${item.id}\`.` : ''}`);
      if (!item.use) {
        const hints = {
          tool: `Tools are used automatically by their activity (\`fish\`, \`hunt\`, \`mine\`, \`dig\`, \`chop\`, \`postmeme\`).`,
          seed: `Plant seeds with \`plant ${item.id}\`.`,
          special: item.id === 'ring' ? 'Use `marry @user` — the ring is used when they say yes.' : 'This item works automatically while it is in your inventory.',
          collectible: `Collectibles are for selling (\`sell ${item.id}\`) or showing off.`,
        };
        return ctx.fail(hints[item.type] || 'That item cannot be used.');
      }
      const n = itemAmount(amountRaw, owned);
      if (!n) return ctx.usage();
      if (n > owned) return ctx.fail(`You only have ${label(item, owned)}.`);
      // Remove first so the same items can't be used twice concurrently; refund if the effect refuses.
      lib.removeItem(acc, item.id, n);
      let text;
      try {
        text = await item.use(ctx, acc, n);
      } catch (err) {
        lib.addItem(acc, item.id, n);
        throw err;
      }
      db.save();
      await ctx.reply({ embeds: [ctx.embed({ description: text })] });
    },
  },
  {
    name: 'iteminfo',
    aliases: ['item'],
    description: 'Details about an item',
    usage: '<item>',
    examples: ['diamond', 'lucky charm'],
    minArgs: 1,
    guildOnly: true,
    async execute(ctx) {
      const item = findItem(ctx.rest(0));
      if (!item) return ctx.fail('Unknown item.');
      await ctx.reply({ embeds: [itemEmbed(ctx, item, lib.peek(g(ctx), ctx.author.id))] });
    },
  },
  {
    name: 'giveitem',
    aliases: ['shareitem'],
    description: 'Give items from your inventory to someone',
    usage: '<@user> <item> [amount|all]',
    examples: ['<@111111111111111111> cookie 2'],
    guildOnly: true,
    minArgs: 2,
    cooldown: 3,
    execute: (ctx) => transferItem(ctx),
  },
];

module.exports.transferItem = transferItem;
