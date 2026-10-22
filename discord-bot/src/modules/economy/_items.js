'use strict';
/**
 * Item catalog. `price` = shop price (null = not sold in the shop), `sell` = what the shop pays you.
 * Types: tool (needed by an activity, can break), consumable (has a `use` effect),
 * seed (planted with `plant`), collectible (loot you sell), special (passive effects).
 */
const { randInt, pick, formatNumber } = require('../../core/utils');
const lib = require('./_lib');

const userError = (msg) => Object.assign(new Error(msg), { userMessage: msg });

const ITEMS = {
  // ---- tools ----
  rod: { name: 'Fishing Rod', emoji: '🎣', type: 'tool', price: 2500, sell: 1000, aliases: ['fishingrod', 'fishing'], description: 'Needed for `fish`. Has a small chance to break.' },
  bow: { name: 'Hunting Bow', emoji: '🏹', type: 'tool', price: 3000, sell: 1200, aliases: ['huntingbow', 'rifle'], description: 'Needed for `hunt`. Has a small chance to break.' },
  pickaxe: { name: 'Pickaxe', emoji: '⛏️', type: 'tool', price: 4000, sell: 1600, aliases: ['pick'], description: 'Needed for `mine`. Has a small chance to break.' },
  shovel: { name: 'Shovel', emoji: '🛠️', type: 'tool', price: 2000, sell: 800, aliases: ['spade'], description: 'Needed for `dig`. Has a small chance to break.' },
  axe: { name: 'Axe', emoji: '🪓', type: 'tool', price: 2500, sell: 1000, aliases: ['hatchet'], description: 'Needed for `chop`. Has a small chance to break.' },
  laptop: { name: 'Laptop', emoji: '💻', type: 'tool', price: 5000, sell: 2000, aliases: ['computer', 'pc'], description: 'Needed for `postmeme`. Has a small chance to break.' },

  // ---- special / consumables ----
  padlock: { name: 'Padlock', emoji: '🔒', type: 'special', price: 1500, sell: 500, aliases: ['lock'], description: 'Automatically blocks one robbery against you, then breaks.' },
  bankcard: { name: 'Bank Card', emoji: '💳', type: 'consumable', price: 10000, sell: 3000, aliases: ['card', 'banknote'], description: 'Use to raise your bank capacity by 25,000.' },
  luckycharm: { name: 'Lucky Charm', emoji: '🍀', type: 'consumable', price: 15000, sell: 4000, aliases: ['charm', 'clover', 'luck'], description: '+10% success on beg, crime, rob and search for 1 hour.' },
  energydrink: { name: 'Energy Drink', emoji: '🥤', type: 'consumable', price: 7500, sell: 2000, aliases: ['energy', 'xpboost', 'drink'], description: 'Doubles the XP you earn for 30 minutes.' },
  lootbox: { name: 'Loot Box', emoji: '🎁', type: 'consumable', price: 5000, sell: 1500, aliases: ['box', 'crate'], description: 'Open for coins, items or a rare collectible.' },
  cookie: { name: 'Cookie', emoji: '🍪', type: 'consumable', price: 50, sell: 10, aliases: ['cookies'], description: 'Eat it for 25 XP. Also a nice gift.' },
  alarmclock: { name: 'Alarm Clock', emoji: '⏰', type: 'consumable', price: 20000, sell: 5000, aliases: ['alarm', 'clock'], description: 'Resets your `work` cooldown.' },
  ring: { name: 'Wedding Ring', emoji: '💍', type: 'special', price: 25000, sell: 10000, aliases: ['weddingring'], description: 'Required to `marry` someone. Used up when they say yes.' },
  trophy: { name: 'Trophy', emoji: '🏆', type: 'collectible', price: 1000000, sell: 400000, aliases: [], description: 'Pure flex. Shows on your profile.' },
  crown: { name: 'Crown', emoji: '👑', type: 'collectible', price: 5000000, sell: 2000000, aliases: [], description: 'The ultimate flex. Shows on your profile.' },

  // ---- seeds & crops ----
  wheatseeds: { name: 'Wheat Seeds', emoji: '🌱', type: 'seed', price: 50, sell: 10, aliases: ['wheatseed'], crop: 'wheat', growMs: 30 * 60 * 1000, description: 'Plant with `plant`. Grows wheat in 30 minutes.' },
  carrotseeds: { name: 'Carrot Seeds', emoji: '🌱', type: 'seed', price: 120, sell: 25, aliases: ['carrotseed'], crop: 'carrot', growMs: 60 * 60 * 1000, description: 'Plant with `plant`. Grows a carrot in 1 hour.' },
  pumpkinseeds: { name: 'Pumpkin Seeds', emoji: '🌱', type: 'seed', price: 300, sell: 60, aliases: ['pumpkinseed'], crop: 'pumpkin', growMs: 3 * 60 * 60 * 1000, description: 'Plant with `plant`. Grows a pumpkin in 3 hours.' },
  goldenseeds: { name: 'Golden Seeds', emoji: '✨', type: 'seed', price: 5000, sell: 1000, aliases: ['goldenseed'], crop: 'goldencarrot', growMs: 12 * 60 * 60 * 1000, description: 'Plant with `plant`. Grows a golden carrot in 12 hours.' },
  wheat: { name: 'Wheat', emoji: '🌾', type: 'collectible', price: null, sell: 150, aliases: [], description: 'Harvested crop.' },
  carrot: { name: 'Carrot', emoji: '🥕', type: 'collectible', price: null, sell: 330, aliases: ['carrots'], description: 'Harvested crop.' },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', type: 'collectible', price: null, sell: 900, aliases: ['pumpkins'], description: 'Harvested crop.' },
  goldencarrot: { name: 'Golden Carrot', emoji: '🥇', type: 'collectible', price: null, sell: 15000, aliases: [], description: 'A very rare harvested crop.' },

  // ---- fish ----
  fish: { name: 'Common Fish', emoji: '🐟', type: 'collectible', price: null, sell: 40, aliases: ['commonfish'], description: 'Caught while fishing.' },
  tropicalfish: { name: 'Tropical Fish', emoji: '🐠', type: 'collectible', price: null, sell: 120, aliases: [], description: 'Caught while fishing.' },
  pufferfish: { name: 'Pufferfish', emoji: '🐡', type: 'collectible', price: null, sell: 200, aliases: ['puffer'], description: 'Caught while fishing.' },
  crab: { name: 'Crab', emoji: '🦀', type: 'collectible', price: null, sell: 80, aliases: [], description: 'Caught while fishing.' },
  shrimp: { name: 'Shrimp', emoji: '🦐', type: 'collectible', price: null, sell: 60, aliases: [], description: 'Caught while fishing.' },
  squid: { name: 'Squid', emoji: '🦑', type: 'collectible', price: null, sell: 300, aliases: [], description: 'Caught while fishing.' },
  octopus: { name: 'Octopus', emoji: '🐙', type: 'collectible', price: null, sell: 450, aliases: [], description: 'Caught while fishing.' },
  shark: { name: 'Shark', emoji: '🦈', type: 'collectible', price: null, sell: 900, aliases: [], description: 'A rare catch.' },
  whale: { name: 'Whale', emoji: '🐋', type: 'collectible', price: null, sell: 3000, aliases: [], description: 'A legendary catch.' },
  boot: { name: 'Old Boot', emoji: '👢', type: 'collectible', price: null, sell: 5, aliases: ['oldboot'], description: 'Junk. Someone lost this.' },

  // ---- hunting ----
  rabbit: { name: 'Rabbit', emoji: '🐇', type: 'collectible', price: null, sell: 100, aliases: ['bunny'], description: 'Hunted game.' },
  duck: { name: 'Duck', emoji: '🦆', type: 'collectible', price: null, sell: 150, aliases: [], description: 'Hunted game.' },
  deer: { name: 'Deer', emoji: '🦌', type: 'collectible', price: null, sell: 500, aliases: [], description: 'Hunted game.' },
  boar: { name: 'Boar', emoji: '🐗', type: 'collectible', price: null, sell: 650, aliases: [], description: 'Hunted game.' },
  bear: { name: 'Bear', emoji: '🐻', type: 'collectible', price: null, sell: 1800, aliases: [], description: 'A rare hunt.' },
  skunk: { name: 'Skunk', emoji: '🦨', type: 'collectible', price: null, sell: 20, aliases: [], description: 'Smelly. Barely worth anything.' },
  dragon: { name: 'Dragon', emoji: '🐉', type: 'collectible', price: null, sell: 25000, aliases: [], description: 'A legendary hunt. How?!' },

  // ---- mining ----
  stone: { name: 'Stone', emoji: '🪨', type: 'collectible', price: null, sell: 10, aliases: ['rock'], description: 'Mined material.' },
  coal: { name: 'Coal', emoji: '⚫', type: 'collectible', price: null, sell: 30, aliases: [], description: 'Mined material.' },
  iron: { name: 'Iron Ore', emoji: '🔩', type: 'collectible', price: null, sell: 80, aliases: ['ironore'], description: 'Mined material.' },
  gold: { name: 'Gold Nugget', emoji: '🟡', type: 'collectible', price: null, sell: 300, aliases: ['goldnugget'], description: 'Mined material.' },
  emerald: { name: 'Emerald', emoji: '🟩', type: 'collectible', price: null, sell: 900, aliases: [], description: 'A precious gem.' },
  ruby: { name: 'Ruby', emoji: '🔴', type: 'collectible', price: null, sell: 1100, aliases: [], description: 'A precious gem.' },
  diamond: { name: 'Diamond', emoji: '💎', type: 'collectible', price: null, sell: 1500, aliases: ['diamonds'], description: 'A rare gem.' },

  // ---- digging ----
  worm: { name: 'Worm', emoji: '🪱', type: 'collectible', price: null, sell: 5, aliases: [], description: 'Dug up. Wiggly.' },
  bone: { name: 'Bone', emoji: '🦴', type: 'collectible', price: null, sell: 40, aliases: [], description: 'Dug up.' },
  vase: { name: 'Ancient Vase', emoji: '🏺', type: 'collectible', price: null, sell: 600, aliases: ['amphora'], description: 'A dug-up artifact.' },
  fossil: { name: 'Fossil', emoji: '🦕', type: 'collectible', price: null, sell: 2000, aliases: [], description: 'A rare dug-up artifact.' },
  moneybag: { name: 'Buried Money Bag', emoji: '💰', type: 'collectible', price: null, sell: 3000, aliases: ['treasure'], description: 'Buried treasure!' },

  // ---- chopping ----
  wood: { name: 'Wood', emoji: '🪵', type: 'collectible', price: null, sell: 15, aliases: ['log', 'logs'], description: 'Chopped material.' },
  acorn: { name: 'Acorn', emoji: '🌰', type: 'collectible', price: null, sell: 10, aliases: [], description: 'Fell from a tree.' },
  apple: { name: 'Apple', emoji: '🍎', type: 'collectible', price: null, sell: 30, aliases: ['apples'], description: 'Fell from a tree.' },
  honey: { name: 'Honey', emoji: '🍯', type: 'collectible', price: null, sell: 150, aliases: [], description: 'Found in a tree.' },
  maplesyrup: { name: 'Maple Syrup', emoji: '🍁', type: 'collectible', price: null, sell: 220, aliases: ['syrup', 'maple'], description: 'Tapped from a maple.' },
  amber: { name: 'Amber', emoji: '🟠', type: 'collectible', price: null, sell: 2500, aliases: [], description: 'Fossilized tree resin. Rare.' },
};

for (const [id, item] of Object.entries(ITEMS)) item.id = id;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Find an item by id, name or alias (exact first, then partial). */
function findItem(query) {
  const q = norm(query);
  if (!q) return null;
  const all = Object.values(ITEMS);
  return (
    all.find((i) => i.id === q || norm(i.name) === q || i.aliases.includes(q)) ||
    all.find((i) => norm(i.name).startsWith(q) || i.id.startsWith(q)) ||
    (q.length >= 3 ? all.find((i) => norm(i.name).includes(q)) : null) ||
    null
  );
}

/**
 * Split "fishing rod 3" / "rod all" into { item, amountRaw }.
 * Tries the longest item name first so multi-word names work.
 */
function parseItemAndAmount(args) {
  for (let cut = args.length; cut > 0; cut--) {
    const item = findItem(args.slice(0, cut).join(' '));
    if (item) return { item, amountRaw: args[cut] };
  }
  return { item: null, amountRaw: null };
}

const label = (item, n) => `${item.emoji} **${item.name}**${n !== undefined ? ` ×${formatNumber(n)}` : ''}`;

/** Weighted random pick: [[weight, value], ...] */
function weighted(table) {
  const total = table.reduce((n, [w]) => n + w, 0);
  let r = Math.random() * total;
  for (const [w, v] of table) {
    if ((r -= w) < 0) return v;
  }
  return table[table.length - 1][1];
}

// ---- consumable effects. Return a message; the `use` command removes the items afterwards. ----
const USE = {
  async bankcard(ctx, acc, n) {
    lib.growBank(acc, 25000 * n);
    return `Your bank capacity grew by ${lib.money(ctx.guild.id, 25000 * n)} to ${lib.money(ctx.guild.id, acc.bankCap)}.`;
  },
  async luckycharm(ctx, acc, n) {
    acc.effects.luck = Math.max(Date.now(), acc.effects.luck || 0) + n * 60 * 60 * 1000;
    return `🍀 You feel lucky! +10% success on beg, crime, rob and search until <t:${Math.floor(acc.effects.luck / 1000)}:t>.`;
  },
  async energydrink(ctx, acc, n) {
    acc.effects.xpboost = Math.max(Date.now(), acc.effects.xpboost || 0) + n * 30 * 60 * 1000;
    return `⚡ Double XP active until <t:${Math.floor(acc.effects.xpboost / 1000)}:t>.`;
  },
  async alarmclock(ctx, acc, n) {
    if (n > 1) throw userError('You can only use one alarm clock at a time.');
    if (!lib.cooldownLeft(acc, 'work')) throw userError('Your `work` cooldown is already ready — save the alarm clock.');
    delete acc.cooldowns.work;
    return '⏰ *RIIING!* Your `work` cooldown has been reset.';
  },
  async cookie(ctx, acc, n) {
    const leveling = require('../leveling/_lib');
    const member = ctx.member;
    const s = leveling.settings(ctx.guild.id);
    if (!s.enabled || !member?.roles) return `🍪 You ate ${n} cookie${n > 1 ? 's' : ''}. Delicious! (Leveling is off here, so no XP.)`;
    const res = await leveling.addXp(ctx.client, member, 25 * n, { channel: ctx.channel });
    return `🍪 You ate ${n} cookie${n > 1 ? 's' : ''} and gained **${25 * n} XP**${res.newLevel > res.oldLevel ? ` — level **${res.newLevel}**!` : '.'}`;
  },
  async lootbox(ctx, acc, n) {
    if (n > 25) throw userError('You can open at most 25 loot boxes at once.');
    const lines = [];
    let coins = 0;
    const rares = ['whale', 'diamond', 'fossil', 'bear', 'amber', 'moneybag', 'goldencarrot'];
    const commons = ['cookie', 'padlock', 'wheatseeds', 'carrotseeds', 'energydrink', 'luckycharm', 'pumpkinseeds'];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.6) coins += randInt(1000, 8000);
      else if (r < 0.9) {
        const id = pick(commons);
        lib.addItem(acc, id, 1);
        lines.push(label(ITEMS[id], 1));
      } else {
        const id = pick(rares);
        lib.addItem(acc, id, 1);
        lines.push(`✨ ${label(ITEMS[id], 1)}`);
      }
    }
    if (coins) lines.unshift(`${lib.money(ctx.guild.id, lib.earn(acc, coins))}`);
    return `🎁 You opened **${n}** loot box${n > 1 ? 'es' : ''} and got:\n${lines.join('\n')}`;
  },
};

for (const [id, fn] of Object.entries(USE)) ITEMS[id].use = fn;

module.exports = { ITEMS, findItem, parseItemAndAmount, label, weighted, userError };
