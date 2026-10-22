'use strict';
const db = require('../../core/db');
const { randInt, pick, discordTimestamp, formatDuration } = require('../../core/utils');
const lib = require('./_lib');
const { ITEMS, parseItemAndAmount, label } = require('./_items');

const g = (ctx) => ctx.guild.id;

/**
 * Tool-based gathering activities. Each table entry: [weight, itemId | null (nothing), [min, max] count].
 */
const ACTIVITIES = {
  fish: {
    tool: 'rod',
    breakChance: 0.03,
    verb: 'went fishing',
    emoji: '🎣',
    nothing: ['The fish are not biting today.', 'You caught some seaweed and threw it back.', 'A seagull stole your bait.'],
    table: [[14, null], [30, 'fish', [1, 3]], [12, 'tropicalfish', [1, 2]], [10, 'shrimp', [1, 3]], [10, 'crab', [1, 2]], [8, 'boot', [1, 1]], [6, 'pufferfish', [1, 1]], [5, 'squid', [1, 1]], [3, 'octopus', [1, 1]], [1.5, 'shark', [1, 1]], [0.4, 'whale', [1, 1]]],
  },
  hunt: {
    tool: 'bow',
    breakChance: 0.03,
    verb: 'went hunting',
    emoji: '🏹',
    nothing: ['You stepped on a twig and scared everything away.', 'You only found footprints.', 'It started raining, so you went home.'],
    table: [[18, null], [30, 'rabbit', [1, 2]], [20, 'duck', [1, 2]], [12, 'skunk', [1, 1]], [10, 'deer', [1, 1]], [6, 'boar', [1, 1]], [2, 'bear', [1, 1]], [0.15, 'dragon', [1, 1]]],
  },
  mine: {
    tool: 'pickaxe',
    breakChance: 0.02,
    verb: 'went mining',
    emoji: '⛏️',
    nothing: ['The tunnel collapsed and you ran out.', 'You only found dust.', 'A bat scared you off.'],
    table: [[8, null], [35, 'stone', [2, 6]], [25, 'coal', [1, 4]], [15, 'iron', [1, 3]], [8, 'gold', [1, 2]], [3, 'emerald', [1, 1]], [2.5, 'ruby', [1, 1]], [1.5, 'diamond', [1, 1]]],
  },
  dig: {
    tool: 'shovel',
    breakChance: 0.03,
    verb: 'went digging',
    emoji: '🛠️',
    nothing: ['You dug a very nice hole. It is empty.', 'You hit a water pipe and had to stop.', 'Just dirt. Lots of dirt.'],
    table: [[15, null], [35, 'worm', [1, 4]], [25, 'bone', [1, 2]], [10, 'stone', [1, 3]], [5, 'vase', [1, 1]], [1.5, 'fossil', [1, 1]], [1, 'moneybag', [1, 1]]],
  },
  chop: {
    tool: 'axe',
    breakChance: 0.03,
    verb: 'went chopping trees',
    emoji: '🪓',
    nothing: ['The tree was too tough today.', 'A squirrel defended its home bravely.', 'You got lost in the forest.'],
    table: [[8, null], [45, 'wood', [2, 6]], [15, 'acorn', [1, 4]], [15, 'apple', [1, 3]], [6, 'honey', [1, 1]], [4, 'maplesyrup', [1, 1]], [0.8, 'amber', [1, 1]]],
  },
};

function gather(name) {
  const a = ACTIVITIES[name];
  const tool = ITEMS[a.tool];
  return async (ctx) => {
    const acc = lib.account(g(ctx), ctx.author.id);
    if (!lib.itemCount(acc, a.tool)) return ctx.fail(`You need a ${label(tool)} to ${name}. Buy one with \`buy ${a.tool}\` (${lib.money(g(ctx), tool.price)}).`);
    if (await lib.onCooldown(ctx, acc, name)) return;
    lib.setCooldown(acc, name);
    const [itemId, range] = (() => {
      const total = a.table.reduce((n, [w]) => n + w, 0);
      let r = Math.random() * total;
      for (const [w, id, rg] of a.table) if ((r -= w) < 0) return [id, rg];
      return [null];
    })();
    let text;
    if (!itemId) text = `${a.emoji} You ${a.verb}… ${pick(a.nothing)}`;
    else {
      const n = randInt(range[0], range[1]);
      lib.addItem(acc, itemId, n);
      acc.stats.caught += n;
      const item = ITEMS[itemId];
      const rare = item.sell >= 1500;
      text = `${a.emoji} You ${a.verb} and got ${label(item, n)}${rare ? ' — **RARE!** ✨' : ''}\n└ worth ${lib.money(g(ctx), item.sell * n)} (\`sell ${itemId}\`)`;
    }
    if (Math.random() < a.breakChance && lib.removeItem(acc, a.tool)) text += `\n💥 Your ${label(tool)} broke!`;
    db.save();
    await ctx.reply({ embeds: [ctx.embed({ description: text })] });
  };
}

const MAX_PLOTS = 6;

function farmView(ctx, acc) {
  const now = Date.now();
  const lines = acc.farm.map((p, i) => {
    const crop = ITEMS[p.crop];
    return p.readyAt <= now ? `**${i + 1}.** ${crop.emoji} ${crop.name} — ✅ ready to harvest` : `**${i + 1}.** 🌱 ${crop.name} — ready ${discordTimestamp(p.readyAt, 'R')}`;
  });
  for (let i = acc.farm.length; i < MAX_PLOTS; i++) lines.push(`**${i + 1}.** 🟫 empty plot`);
  return ctx.embed({ title: `🚜 ${ctx.author.username}'s farm`, description: lines.join('\n'), footer: 'plant <seed> [amount] • harvest • seeds are in the shop' });
}

module.exports = [
  ...Object.keys(ACTIVITIES).map((name) => ({
    name,
    description: `${{ fish: 'Go fishing', hunt: 'Go hunting', mine: 'Go mining', dig: 'Dig for treasure', chop: 'Chop trees' }[name]} for sellable loot (needs a ${ITEMS[ACTIVITIES[name].tool].name})`,
    guildOnly: true,
    execute: gather(name),
  })),
  {
    name: 'farm',
    aliases: ['plots', 'garden'],
    description: 'View your farm plots and what is growing',
    guildOnly: true,
    async execute(ctx) {
      await ctx.reply({ embeds: [farmView(ctx, lib.account(g(ctx), ctx.author.id))] });
    },
  },
  {
    name: 'plant',
    aliases: ['sow'],
    description: 'Plant seeds in your farm plots',
    usage: '<seed> [amount|all]',
    examples: ['wheat seeds', 'carrotseeds 2'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const { item, amountRaw } = parseItemAndAmount(ctx.args);
      if (!item || item.type !== 'seed') return ctx.fail('That is not a seed. Seeds: `wheatseeds`, `carrotseeds`, `pumpkinseeds`, `goldenseeds`.');
      const acc = lib.account(g(ctx), ctx.author.id);
      const free = MAX_PLOTS - acc.farm.length;
      if (free <= 0) return ctx.fail('All your plots are full. `harvest` first!');
      const owned = lib.itemCount(acc, item.id);
      if (!owned) return ctx.fail(`You have no ${label(item)}. Buy some with \`buy ${item.id}\`.`);
      let n = amountRaw === undefined ? 1 : lib.parseAmount(amountRaw, Math.min(owned, free));
      if (!n || n < 1) return ctx.usage();
      n = Math.min(n, owned, free);
      lib.removeItem(acc, item.id, n);
      for (let i = 0; i < n; i++) acc.farm.push({ crop: item.crop, readyAt: Date.now() + item.growMs });
      db.save();
      const view = farmView(ctx, acc);
      view.setDescription(`🌱 Planted **${n}** × ${item.name}. Ready in ${formatDuration(item.growMs)}.\n\n${view.data.description}`);
      await ctx.reply({ embeds: [view] });
    },
  },
  {
    name: 'harvest',
    aliases: ['reap'],
    description: 'Harvest all crops that are ready',
    guildOnly: true,
    async execute(ctx) {
      const acc = lib.account(g(ctx), ctx.author.id);
      const now = Date.now();
      const ready = acc.farm.filter((p) => p.readyAt <= now);
      if (!ready.length) return ctx.fail(acc.farm.length ? 'Nothing is ready yet — check `farm`.' : 'Your farm is empty. `plant` some seeds!');
      acc.farm = acc.farm.filter((p) => p.readyAt > now);
      const got = {};
      for (const p of ready) {
        const n = Math.random() < 0.25 ? 2 : 1; // bumper crop
        got[p.crop] = (got[p.crop] || 0) + n;
      }
      for (const [id, n] of Object.entries(got)) lib.addItem(acc, id, n);
      db.save();
      await ctx.ok(`You harvested ${Object.entries(got).map(([id, n]) => label(ITEMS[id], n)).join(', ')}. Sell them with \`sellall\`.`);
    },
  },
];

