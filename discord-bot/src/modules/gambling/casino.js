'use strict';
/** Instant (one-message) casino games. Every game takes the bet up front, then settles. */
const { randInt, pick, sleep, formatNumber } = require('../../core/utils');
const eco = require('../economy/_lib');
const { placeBet, settle, outcome, color, balanceFooter } = require('./_lib');

const g = (ctx) => ctx.guild.id;

function weightedPick(table) {
  const total = table.reduce((n, t) => n + t.w, 0);
  let r = Math.random() * total;
  for (const t of table) if ((r -= t.w) < 0) return t;
  return table[table.length - 1];
}

async function show(ctx, { title, lines, bet, paid, acc, msg }) {
  const e = ctx.embed({ title, description: `${lines.filter(Boolean).join('\n')}\n\n${outcome(g(ctx), bet, paid)}`, color: color(bet, paid), footer: balanceFooter(acc) });
  if (msg?.edit && !ctx.isSlash) return msg.edit({ embeds: [e] }).catch(() => ctx.reply({ embeds: [e] }));
  if (msg && ctx.isSlash) return ctx.interaction.editReply({ embeds: [e] }).catch(() => ctx.reply({ embeds: [e] }));
  return ctx.reply({ embeds: [e] });
}

// ---------- slots (RTP ≈ 98%) ----------
const REELS = [
  { s: '🍒', w: 30, three: 7, two: 1 },
  { s: '🍋', w: 25, three: 9, two: 1 },
  { s: '🍊', w: 20, three: 12, two: 1 },
  { s: '🍇', w: 12, three: 15, two: 1.5 },
  { s: '🔔', w: 7, three: 25, two: 1.5 },
  { s: '⭐', w: 4, three: 50, two: 3 },
  { s: '💎', w: 1.5, three: 100, two: 3 },
  { s: '7️⃣', w: 0.5, three: 250, two: 3 },
];

// ---------- roulette (European, RTP 97.3%) ----------
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
function rouletteSpace(raw) {
  const s = String(raw || '').toLowerCase();
  const n = Number(s);
  if (s !== '' && Number.isInteger(n) && n >= 0 && n <= 36) return { label: `number ${n}`, mult: 36, test: (x) => x === n };
  const spaces = {
    red: { label: 'red', mult: 2, test: (x) => RED.has(x) },
    black: { label: 'black', mult: 2, test: (x) => x !== 0 && !RED.has(x) },
    odd: { label: 'odd', mult: 2, test: (x) => x % 2 === 1 },
    even: { label: 'even', mult: 2, test: (x) => x !== 0 && x % 2 === 0 },
    low: { label: '1–18', mult: 2, test: (x) => x >= 1 && x <= 18 },
    high: { label: '19–36', mult: 2, test: (x) => x >= 19 },
    green: { label: 'green (0)', mult: 36, test: (x) => x === 0 },
    '1st': { label: '1st dozen (1–12)', mult: 3, test: (x) => x >= 1 && x <= 12 },
    '2nd': { label: '2nd dozen (13–24)', mult: 3, test: (x) => x >= 13 && x <= 24 },
    '3rd': { label: '3rd dozen (25–36)', mult: 3, test: (x) => x >= 25 },
  };
  const alias = { r: 'red', b: 'black', o: 'odd', e: 'even', zero: 'green', '0': 'green', g: 'green', first: '1st', second: '2nd', third: '3rd', dozen1: '1st', dozen2: '2nd', dozen3: '3rd', '1-18': 'low', '19-36': 'high' };
  return spaces[alias[s] || s] || null;
}

// ---------- wheel (RTP 97%) ----------
const WHEEL = [0.1, 0.3, 0.5, 0.8, 1, 1.2, 1.5, 1.7, 0.4, 2.2];

// ---------- scratch card (RTP ≈ 93%) ----------
const SCRATCH = [
  { s: '🍀', w: 28, m: 1.5 },
  { s: '🍒', w: 24, m: 2.5 },
  { s: '🔔', w: 20, m: 4 },
  { s: '💰', w: 14, m: 7 },
  { s: '💎', w: 9, m: 14 },
  { s: '👑', w: 5, m: 35 },
];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

// ---------- plinko: 8 rows, 9 bins (RTP ≈ 99%) ----------
const PLINKO = {
  low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
  medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
  high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
};

const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const rpsChoice = (s) => ({ r: 'rock', rock: 'rock', p: 'paper', paper: 'paper', s: 'scissors', scissor: 'scissors', scissors: 'scissors' })[String(s || '').toLowerCase()];

module.exports = [
  {
    name: 'slots',
    aliases: ['slot', 'slotmachine'],
    description: 'Spin the slot machine (3 of a kind pays up to ×250)',
    usage: '<bet>',
    examples: ['100', 'all', '1k'],
    guildOnly: true,
    minArgs: 1,
    cooldown: 3,
    slash: true,
    args: [{ name: 'bet', type: 'string', description: 'Amount to bet (e.g. 100, 1k, all)', required: true }],
    async execute(ctx) {
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const reels = [weightedPick(REELS), weightedPick(REELS), weightedPick(REELS)];
      const [a, x, c] = reels;
      let mult = 0;
      if (a === x && x === c) mult = a.three;
      else if (a === x || a === c) mult = a.two;
      else if (x === c) mult = x.two;
      const paid = settle(b.acc, b.bet, b.bet * mult);
      const msg = await ctx.reply({ embeds: [ctx.embed({ title: '🎰 Slots', description: `**[ 🎲 | 🎲 | 🎲 ]**\nSpinning…` })] });
      await sleep(1200);
      await show(ctx, { title: '🎰 Slots', lines: [`**[ ${reels.map((r) => r.s).join(' | ')} ]**`, mult >= 25 ? '🚨 **JACKPOT!** 🚨' : ''], bet: b.bet, paid, acc: b.acc, msg });
    },
  },
  {
    name: 'coinbet',
    aliases: ['cb', 'betflip', 'coingamble'],
    description: 'Bet on heads or tails (pays ×2)',
    usage: '<bet> <heads|tails>',
    examples: ['100 heads', 'all t'],
    guildOnly: true,
    minArgs: 2,
    slash: true,
    args: [
      { name: 'bet', type: 'string', description: 'Amount to bet', required: true },
      { name: 'side', type: 'string', description: 'Heads or tails', required: true, choices: ['heads', 'tails'] },
    ],
    async execute(ctx) {
      const side = { h: 'heads', heads: 'heads', head: 'heads', t: 'tails', tails: 'tails', tail: 'tails' }[ctx.args[1].toLowerCase()];
      if (!side) return ctx.usage();
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const flip = Math.random() < 0.5 ? 'heads' : 'tails';
      const paid = settle(b.acc, b.bet, flip === side ? b.bet * 2 : 0);
      await show(ctx, { title: '🪙 Coin bet', lines: [`You picked **${side}** — the coin landed on **${flip}** ${flip === 'heads' ? '👑' : '🦅'}`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'dicebet',
    aliases: ['dicegamble', 'betdice'],
    description: 'Roll 2 dice against the bot — higher total wins ×2, ties refund',
    usage: '<bet>',
    examples: ['100', 'half'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const you = [randInt(1, 6), randInt(1, 6)];
      const bot = [randInt(1, 6), randInt(1, 6)];
      const ys = you[0] + you[1];
      const bs = bot[0] + bot[1];
      const paid = settle(b.acc, b.bet, ys > bs ? b.bet * 2 : ys === bs ? b.bet : 0);
      await show(ctx, { title: '🎲 Dice bet', lines: [`You rolled **${you.join(' + ')} = ${ys}**`, `I rolled **${bot.join(' + ')} = ${bs}**`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'roulette',
    aliases: ['rl'],
    description: 'European roulette: red/black/odd/even/low/high ×2, dozens ×3, number/green ×36',
    usage: '<bet> <red|black|odd|even|low|high|1st|2nd|3rd|green|0-36>',
    examples: ['100 red', '50 17', '200 2nd'],
    guildOnly: true,
    minArgs: 2,
    async execute(ctx) {
      const space = rouletteSpace(ctx.args[1]);
      if (!space) return ctx.usage('Unknown space.');
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const n = randInt(0, 36);
      const col = n === 0 ? '🟢' : RED.has(n) ? '🔴' : '⚫';
      const paid = settle(b.acc, b.bet, space.test(n) ? b.bet * space.mult : 0);
      await show(ctx, { title: '🎡 Roulette', lines: [`The ball landed on ${col} **${n}**`, `Your bet: **${space.label}** (×${space.mult})`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'wheel',
    aliases: ['spinwheel', 'fortunewheel'],
    description: 'Spin the wheel of fortune (×0.1 to ×2.2)',
    usage: '<bet>',
    examples: ['100'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const i = randInt(0, WHEEL.length - 1);
      const paid = settle(b.acc, b.bet, b.bet * WHEEL[i]);
      const ring = WHEEL.map((m, j) => (j === i ? `**[×${m}]**` : `×${m}`)).join(' · ');
      await show(ctx, { title: '🎡 Wheel of Fortune', lines: [ring, `\n⬆️ The wheel stopped on **×${WHEEL[i]}**`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'scratch',
    aliases: ['scratchcard', 'scratchoff'],
    description: 'Buy a scratch card — 3 matching symbols in a line wins (up to ×35)',
    usage: '<bet>',
    examples: ['100'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const grid = Array.from({ length: 9 }, () => weightedPick(SCRATCH));
      let best = null;
      for (const l of LINES) {
        const [p, q, r] = l.map((i) => grid[i]);
        if (p === q && q === r && (!best || p.m > best.m)) best = p;
      }
      const paid = settle(b.acc, b.bet, best ? b.bet * best.m : 0);
      const rows = [0, 3, 6].map((i) => grid.slice(i, i + 3).map((c) => `||${c.s}||`).join(' ')).join('\n');
      const e = ctx.embed({
        title: '🎟️ Scratch card',
        description: `Scratch the card (click the spoilers)!\n\n${rows}\n\n||${outcome(g(ctx), b.bet, paid)}${best ? ` — line of ${best.s}` : ''}||`,
        color: color(b.bet, paid),
        footer: `Paytable: ${SCRATCH.map((s) => `${s.s}×${s.m}`).join(' ')} • ${balanceFooter(b.acc)}`,
      });
      await ctx.reply({ embeds: [e] });
    },
  },
  {
    name: 'rpsbet',
    aliases: ['rpsgamble'],
    description: 'Rock-paper-scissors against the bot for money (win ×2, tie refunds)',
    usage: '<bet> <rock|paper|scissors>',
    examples: ['100 rock', '50 s'],
    guildOnly: true,
    minArgs: 2,
    async execute(ctx) {
      const you = rpsChoice(ctx.args[1]);
      if (!you) return ctx.usage();
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const bot = pick(Object.keys(RPS));
      const paid = settle(b.acc, b.bet, you === bot ? b.bet : BEATS[you] === bot ? b.bet * 2 : 0);
      await show(ctx, { title: '✊ Rock Paper Scissors', lines: [`You: ${RPS[you]} **${you}** — Me: ${RPS[bot]} **${bot}**`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'cups',
    aliases: ['shellgame', 'cupgame'],
    description: 'Guess which of 3 cups hides the ball (pays ×2.9)',
    usage: '<bet> <1|2|3>',
    examples: ['100 2'],
    guildOnly: true,
    minArgs: 2,
    async execute(ctx) {
      const choice = parseInt(ctx.args[1], 10);
      if (![1, 2, 3].includes(choice)) return ctx.usage();
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const ball = randInt(1, 3);
      const paid = settle(b.acc, b.bet, ball === choice ? b.bet * 2.9 : 0);
      const cups = [1, 2, 3].map((i) => (i === ball ? '🔴' : '🥤')).join('   ');
      await show(ctx, { title: '🥤 Cup game', lines: [cups, `1️⃣   2️⃣   3️⃣`, `You picked cup **${choice}**, the ball was under cup **${ball}**.`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'plinko',
    description: 'Drop a ball through 8 rows of pegs (low/medium/high risk, up to ×29)',
    usage: '<bet> [low|medium|high]',
    examples: ['100', '100 high'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const risk = { l: 'low', low: 'low', m: 'medium', med: 'medium', medium: 'medium', h: 'high', high: 'high' }[String(ctx.args[1] || 'low').toLowerCase()];
      if (!risk) return ctx.usage();
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const path = Array.from({ length: 8 }, () => (Math.random() < 0.5 ? 0 : 1));
      const bin = path.reduce((n, x) => n + x, 0);
      const mult = PLINKO[risk][bin];
      const paid = settle(b.acc, b.bet, b.bet * mult);
      const bins = PLINKO[risk].map((m, i) => (i === bin ? `**[${m}]**` : `${m}`)).join(' ');
      await show(ctx, { title: `🔵 Plinko (${risk} risk)`, lines: [`Path: ${path.map((x) => (x ? '↘' : '↙')).join('')}`, bins], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'limbo',
    description: 'Pick a target multiplier — win if the roll reaches it (chance = 97% ÷ target)',
    usage: '<bet> <target multiplier>',
    examples: ['100 2', '50 10x'],
    guildOnly: true,
    minArgs: 2,
    async execute(ctx) {
      const target = Number(String(ctx.args[1]).replace(/x$/i, ''));
      if (!Number.isFinite(target) || target < 1.01 || target > 1000) return ctx.usage('Target must be between 1.01 and 1000.');
      const b = await placeBet(ctx, ctx.args[0]);
      if (!b) return;
      const roll = Math.max(1, Math.floor((0.97 / (1 - Math.random())) * 100) / 100);
      const win = roll >= target;
      const paid = settle(b.acc, b.bet, win ? b.bet * target : 0);
      await show(ctx, { title: '🚀 Limbo', lines: [`Target: **×${target.toFixed(2)}** (${Math.min(97, 97 / target).toFixed(2)}% chance)`, `Result: **×${roll.toFixed(2)}**`], bet: b.bet, paid, acc: b.acc });
    },
  },
  {
    name: 'gamblestats',
    aliases: ['gamblingstats', 'casinostats'],
    description: 'Your gambling record: games, wagered, profit, biggest win',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : ctx.author;
      if (!user || user.bot) return ctx.fail('User not found.');
      const s = eco.account(g(ctx), user.id).stats;
      const net = s.gambleWon - s.gambleLost;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🎰 ${user.username}'s gambling stats`,
            fields: [
              { name: 'Games played', value: formatNumber(s.gamesPlayed), inline: true },
              { name: 'Total wagered', value: eco.money(g(ctx), s.gambled), inline: true },
              { name: 'Net profit', value: `${net >= 0 ? '📈 +' : '📉 -'}${eco.money(g(ctx), Math.abs(net))}`, inline: true },
              { name: 'Won', value: eco.money(g(ctx), s.gambleWon), inline: true },
              { name: 'Lost', value: eco.money(g(ctx), s.gambleLost), inline: true },
              { name: 'Biggest win', value: eco.money(g(ctx), s.biggestWin || 0), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'betlimits',
    aliases: ['minbet', 'maxbet'],
    description: 'Show this server\'s minimum and maximum bet',
    guildOnly: true,
    async execute(ctx) {
      const s = eco.settings(g(ctx));
      await ctx.info(`Minimum bet: ${eco.money(g(ctx), s.minBet)}\nMaximum bet: ${eco.money(g(ctx), s.maxBet)}\nAdmins can change these with \`ecosettings minbet|maxbet <amount>\`.`, '🎲 Bet limits');
    },
  },
];
