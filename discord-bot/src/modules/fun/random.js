'use strict';
const { ComponentType } = require('discord.js');
const db = require('../../core/db');
const { randInt, pick, sleep } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const content = require('./_content');
const { hashNum, bar, nameOf } = require('./_helpers');

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** Parse "2d6+3", "d20", "4d6-1", or a plain number "100" (=1d100). */
function parseDice(expr) {
  const s = String(expr || 'd6').toLowerCase().replace(/\s+/g, '');
  if (/^\d+$/.test(s)) return { count: 1, sides: Number(s), mod: 0 };
  const m = s.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  return { count: m[1] ? Number(m[1]) : 1, sides: Number(m[2]), mod: m[3] ? Number(m[3]) : 0 };
}

function rollDice({ count, sides, mod }) {
  const rolls = Array.from({ length: count }, () => randInt(1, sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + mod };
}

const diceCommands = [2, 4, 6, 8, 10, 12, 20, 100].map((sides) => ({
  name: `d${sides}`,
  description: `Roll a ${sides}-sided die (optionally several: d${sides} 3)`,
  usage: '[count]',
  examples: ['', '3'],
  async execute(ctx) {
    const count = Math.min(MAX_DICE, Math.max(1, parseInt(ctx.args[0], 10) || 1));
    const { rolls, total } = rollDice({ count, sides, mod: 0 });
    const detail = count > 1 ? `\n${rolls.join(' + ')} = **${total}**` : '';
    await ctx.reply({ embeds: [ctx.embed({ description: `🎲 **d${sides}** → **${total}**${detail}`.slice(0, 4000) })] });
  },
}));

const RPS = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
function rpsAlias(v) {
  const s = String(v || '').toLowerCase();
  if (['rock', 'r', 'stone', '🪨'].includes(s)) return 'rock';
  if (['paper', 'p', '📄'].includes(s)) return 'paper';
  if (['scissors', 's', 'scissor', '✂️'].includes(s)) return 'scissors';
  return null;
}
function rpsOutcome(a, b) {
  if (a === b) return 'draw';
  return BEATS[a] === b ? 'win' : 'loss';
}

function zodiacFor(sign) {
  const s = String(sign || '').toLowerCase();
  return Object.keys(content.horoscope.signs).find((k) => k === s || k.startsWith(s.slice(0, 3))) || null;
}

module.exports = [
  {
    name: '8ball',
    aliases: ['eightball', '8b'],
    description: 'Ask the magic 8-ball a question',
    usage: '<question>',
    examples: ['Will I win today?'],
    minArgs: 1,
    slash: true,
    args: [{ name: 'question', type: 'string', description: 'Your yes/no question', required: true, rest: true }],
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 250);
      await ctx.reply({ embeds: [ctx.embed({ title: '🎱 Magic 8-Ball', fields: [{ name: 'Question', value: q }, { name: 'Answer', value: pick(content.eightBall) }] })] });
    },
  },
  {
    name: 'conch',
    aliases: ['magicconch'],
    description: 'Ask the Magic Conch shell for wisdom',
    usage: '<question>',
    examples: ['Should we eat now?'],
    minArgs: 1,
    async execute(ctx) {
      await ctx.reply({ embeds: [ctx.embed({ title: '🐚 The Magic Conch says…', description: `> ${ctx.rest(0).slice(0, 200)}\n\n**${pick(content.conch)}**` })] });
    },
  },
  {
    name: 'coinflip',
    aliases: ['flip'],
    description: 'Flip a coin (optionally guess heads or tails)',
    usage: '[heads|tails]',
    examples: ['', 'heads'],
    slash: true,
    args: [{ name: 'guess', type: 'string', description: 'Your guess', required: false, choices: ['heads', 'tails'] }],
    async execute(ctx) {
      const side = Math.random() < 0.5 ? 'heads' : 'tails';
      const guess = String(ctx.args[0] || '').toLowerCase();
      const g = guess.startsWith('h') ? 'heads' : guess.startsWith('t') ? 'tails' : null;
      let text = `🪙 The coin landed on **${side}**!`;
      if (g) text += g === side ? '\n🎉 You guessed right!' : '\n😢 Wrong guess.';
      await ctx.reply({ embeds: [ctx.embed({ description: text })] });
    },
  },
  {
    name: 'roll',
    aliases: ['diceroll'],
    description: 'Roll dice with RPG notation: 2d6+3, d20, 4d6-1, or a number',
    usage: '[NdM±K | max]',
    examples: ['', '2d6+3', 'd20', '100'],
    slash: true,
    args: [{ name: 'dice', type: 'string', description: 'e.g. 2d6+3, d20, 100', required: false }],
    async execute(ctx) {
      const spec = parseDice(ctx.args[0]);
      if (!spec || spec.count < 1 || spec.sides < 2) return ctx.usage('That is not valid dice notation.');
      if (spec.count > MAX_DICE || spec.sides > MAX_SIDES) return ctx.fail(`Max ${MAX_DICE} dice with up to ${MAX_SIDES} sides.`);
      const { rolls, total } = rollDice(spec);
      const label = `${spec.count}d${spec.sides}${spec.mod ? (spec.mod > 0 ? `+${spec.mod}` : spec.mod) : ''}`;
      const shown = rolls.length > 1 || spec.mod ? `\n[${rolls.join(', ')}]${spec.mod ? ` ${spec.mod > 0 ? '+' : '-'} ${Math.abs(spec.mod)}` : ''}` : '';
      await ctx.reply({ embeds: [ctx.embed({ description: `🎲 **${label}** → **${total}**${shown}`.slice(0, 4000) })] });
    },
  },
  ...diceCommands,
  {
    name: 'rps',
    aliases: ['rockpaperscissors'],
    description: 'Play rock-paper-scissors against the bot',
    usage: '[rock|paper|scissors]',
    examples: ['rock', 'paper'],
    async execute(ctx) {
      const finish = (choice) => {
        const botChoice = pick(Object.keys(RPS));
        const r = rpsOutcome(choice, botChoice);
        const verdict = r === 'draw' ? "🤝 It's a draw!" : r === 'win' ? '🎉 You win!' : '😈 I win!';
        return ctx.embed({ title: 'Rock · Paper · Scissors', description: `You: ${RPS[choice]} **${choice}**\nMe: ${RPS[botChoice]} **${botChoice}**\n\n${verdict}` });
      };
      const choice = rpsAlias(ctx.args[0]);
      if (choice) return ctx.reply({ embeds: [finish(choice)] });

      const buttons = row(...Object.entries(RPS).map(([k, e]) => button(`rpsbot:${k}`, k, 'Primary', e)));
      const msg = await ctx.reply({ embeds: [ctx.embed({ description: 'Pick your move!' })], components: [buttons] });
      if (!msg?.awaitMessageComponent) return;
      try {
        const b = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter: (i) => i.user.id === ctx.author.id && i.customId.startsWith('rpsbot:') });
        await b.update({ embeds: [finish(b.customId.split(':')[1])], components: [] });
      } catch {
        await msg.edit({ embeds: [ctx.embed({ description: '⌛ You took too long.' })], components: [] }).catch(() => {});
      }
    },
  },
  {
    name: 'choose',
    aliases: ['choice', 'decide'],
    description: 'Let the bot choose between options (separate with | or ,)',
    usage: '<option1 | option2 | …>',
    examples: ['pizza | tacos | sushi', 'yes, no'],
    minArgs: 1,
    async execute(ctx) {
      const text = ctx.rest(0);
      let opts = text.split(/\s*\|\s*|\s*,\s*|\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) opts = ctx.args;
      if (opts.length < 2) return ctx.usage('Give me at least two options.');
      await ctx.reply({ embeds: [ctx.embed({ description: `🤔 I choose… **${pick(opts).slice(0, 200)}**` })] });
    },
  },
  {
    name: 'rate',
    aliases: ['rateit'],
    description: 'Rate anything out of 10',
    usage: '<thing>',
    examples: ['pineapple pizza'],
    minArgs: 1,
    async execute(ctx) {
      const thing = ctx.rest(0).slice(0, 150);
      const score = hashNum(11, 'rate', thing);
      await ctx.reply({ embeds: [ctx.embed({ description: `⭐ I rate **${thing}** a **${score}/10**\n${'⭐'.repeat(score)}${'▫️'.repeat(10 - score)}` })] });
    },
  },
  {
    name: 'ship',
    aliases: ['lovecalc', 'compatibility'],
    description: 'Calculate the compatibility between two people or things',
    usage: '<@user|thing> [@user|thing]',
    examples: ['pizza pineapple', 'Alice Bob'],
    minArgs: 1,
    async execute(ctx) {
      const label = async (arg) => {
        const u = await ctx.resolveUser(arg);
        return u ? { key: u.id, name: nameOf(u) } : { key: arg.toLowerCase(), name: arg.slice(0, 50) };
      };
      const a = ctx.args.length >= 2 ? await label(ctx.args[0]) : { key: ctx.author.id, name: nameOf(ctx.author) };
      const b = await label(ctx.args.length >= 2 ? ctx.args[1] : ctx.args[0]);
      const pct = hashNum(101, 'ship', ...[a.key, b.key].sort());
      const half = (s, first) => (first ? s.slice(0, Math.ceil(s.length / 2)) : s.slice(Math.floor(s.length / 2)));
      const shipName = half(a.name, true) + half(b.name, false);
      const verdict = pct > 90 ? 'Soulmates! 💞' : pct > 70 ? 'A great match! 💖' : pct > 50 ? 'There is potential! 💗' : pct > 30 ? 'Just friends 🤝' : 'Not meant to be 💔';
      await ctx.reply({ embeds: [ctx.embed({ title: `💘 ${a.name} × ${b.name}`, description: `**Ship name:** ${shipName}\n**${pct}%** \`${bar(pct)}\`\n${verdict}` })] });
    },
  },
  ...[
    ['iq', 'Calculate someone\'s totally scientific IQ', (n) => `🧠 **${n.name}** has an IQ of **${60 + n.v}**.`, 141],
    ['coolrate', 'How cool is someone? (100% accurate, 0% science)', (n) => `😎 **${n.name}** is **${n.v}%** cool.\n\`${bar(n.v)}\``, 101],
    ['vibecheck', 'Check someone\'s vibe for today', (n) => `✨ Vibe check for **${n.name}**: **${n.v}%** ${n.v > 70 ? '— immaculate vibes 🌈' : n.v > 40 ? '— decent vibes 👍' : '— vibes need a nap 😴'}\n\`${bar(n.v)}\``, 101, true],
    ['luckmeter', 'How lucky is someone today?', (n) => `🍀 **${n.name}**'s luck today: **${n.v}%**\n\`${bar(n.v)}\``, 101, true],
    ['smartrate', 'How big-brained is someone?', (n) => `🤓 **${n.name}** is **${n.v}%** big-brained.\n\`${bar(n.v)}\``, 101],
    ['gamerrate', 'Rate someone\'s gamer skills', (n) => `🎮 **${n.name}** has a gamer rating of **${n.v}%**.\n\`${bar(n.v)}\``, 101],
  ].map(([name, description, render, mod, daily]) => ({
    name,
    description,
    usage: '[@user]',
    examples: [''],
    async execute(ctx) {
      const u = await ctx.targetUser(0);
      const day = daily ? new Date().toISOString().slice(0, 10) : '';
      const v = hashNum(mod, name, u.id, day);
      await ctx.reply({ embeds: [ctx.embed({ description: render({ name: nameOf(u), v }) })] });
    },
  })),
  {
    name: 'yesno',
    aliases: ['yn'],
    description: 'Get a quick yes or no answer',
    usage: '[question]',
    examples: ['', 'Should I sleep?'],
    async execute(ctx) {
      const r = Math.random();
      const ans = r < 0.48 ? '✅ **Yes!**' : r < 0.96 ? '❌ **No!**' : '🤷 **Maybe…**';
      await ctx.reply({ embeds: [ctx.embed({ description: ctx.args.length ? `> ${ctx.rest(0).slice(0, 200)}\n${ans}` : ans })] });
    },
  },
  {
    name: 'f',
    aliases: ['respects', 'payrespects'],
    description: 'Press F to pay respects (others can join with the button)',
    usage: '[for something]',
    examples: ['', 'my homework'],
    async execute(ctx) {
      const what = ctx.rest(0).slice(0, 100);
      const payers = new Set([ctx.author.id]);
      const text = () => `🇫 **${payers.size}** ${payers.size === 1 ? 'person has' : 'people have'} paid their respects${what ? ` for **${what}**` : ''}.`;
      const msg = await ctx.reply({ embeds: [ctx.embed({ description: text() })], components: [row(button('payf', 'Press F', 'Secondary', '🇫'))] });
      if (!msg?.createMessageComponentCollector) return;
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000, filter: (i) => i.customId === 'payf' });
      col.on('collect', async (i) => {
        if (payers.has(i.user.id)) return i.reply({ content: 'You already paid your respects. 🙏', flags: 64 }).catch(() => {});
        payers.add(i.user.id);
        await i.update({ embeds: [ctx.embed({ description: text() })] }).catch(() => {});
      });
      col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
  },
  {
    name: 'cookie',
    aliases: ['givecookie'],
    description: 'Give someone a cookie 🍪',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    minArgs: 1,
    async execute(ctx) {
      const u = await ctx.resolveUser(ctx.args[0]);
      if (!u) return ctx.fail('I could not find that user.');
      if (u.id === ctx.author.id) return ctx.reply({ embeds: [ctx.embed({ description: '🍪 You eat your own cookie. Delicious, but a little lonely.' })] });
      const total = db.update('actions', `cookie:${u.id}`, (n) => (n || 0) + 1, 0);
      await ctx.reply({ embeds: [ctx.embed({ description: `🍪 **${nameOf(ctx.author)}** gave **${nameOf(u)}** a cookie! They now have **${total}** cookie${total === 1 ? '' : 's'}.` })] });
    },
  },
  {
    name: 'horoscope',
    aliases: ['zodiac'],
    description: "Today's (just for fun) horoscope for a zodiac sign",
    usage: '<sign>',
    examples: ['leo', 'pisces'],
    minArgs: 1,
    async execute(ctx) {
      const sign = zodiacFor(ctx.args[0]);
      if (!sign) return ctx.usage(`Signs: ${Object.keys(content.horoscope.signs).join(', ')}`);
      const day = new Date().toISOString().slice(0, 10);
      const h = content.horoscope;
      const n = (mod, salt) => hashNum(mod, sign, day, salt);
      const closer = h.closers[n(h.closers.length, 'c')]
        .replace('{color}', h.colors[n(h.colors.length, 'col')])
        .replace('{num}', n(99, 'num') + 1)
        .replace('{hour}', n(12, 'hr') + 8)
        .replace('{emoji}', h.emojis[n(h.emojis.length, 'e')]);
      const text = `${h.openers[n(h.openers.length, 'o')]} ${h.middles[n(h.middles.length, 'm')]}\n\n${closer}`;
      await ctx.reply({ embeds: [ctx.embed({ title: `${h.signs[sign]} ${sign[0].toUpperCase()}${sign.slice(1)} — ${day}`, description: text, footer: 'For entertainment only ✨' })] });
    },
  },
  {
    name: 'spiritanimal',
    description: 'Discover your (or someone\'s) spirit animal',
    usage: '[@user]',
    examples: [''],
    async execute(ctx) {
      const u = await ctx.targetUser(0);
      const [animal, desc] = content.spiritAnimals[hashNum(content.spiritAnimals.length, 'spirit', u.id)];
      await ctx.reply({ embeds: [ctx.embed({ description: `**${nameOf(u)}**'s spirit animal is the **${animal}** — ${desc}.` })] });
    },
  },
  {
    name: 'superpower',
    description: 'Get a random superpower',
    examples: [''],
    async execute(ctx) {
      await ctx.reply({ embeds: [ctx.embed({ description: `🦸 **${nameOf(ctx.author)}**, your new superpower is: **${pick(content.superpowers)}**` })] });
    },
  },
  {
    name: 'bubblewrap',
    aliases: ['popwrap'],
    description: 'A sheet of bubble wrap to pop',
    usage: '[rows 1-10]',
    examples: ['', '5'],
    async execute(ctx) {
      const rows = Math.min(10, Math.max(1, parseInt(ctx.args[0], 10) || 8));
      const sheet = Array.from({ length: rows }, () => Array(8).fill('||pop||').join(' ')).join('\n');
      await ctx.reply({ content: sheet });
    },
  },
  {
    name: 'fakehack',
    aliases: ['prankhack'],
    description: 'Run an obviously fake, silly "hack" on someone (it does nothing!)',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    minArgs: 1,
    cooldown: 10,
    async execute(ctx) {
      const u = await ctx.resolveUser(ctx.args[0]);
      const name = u ? nameOf(u) : ctx.args[0].slice(0, 32);
      const steps = [
        `💻 Hacking **${name}**… (this is a joke)`,
        '🔍 Searching for the Discord password… found: `ilovepotatoes123` (definitely not real)',
        '📧 Email: `totally.real@not-a-real-domain.fake`',
        `🌐 IP address: \`127.0.0.1\` (that's literally your own computer 🤡)`,
        `🍕 Most common word: "pizza"`,
        '🧑‍💻 Uploading fake virus `cuddles.exe`…',
        `✅ Hack on **${name}** complete. Nothing actually happened — stay safe and never share real passwords! 😄`,
      ];
      const msg = await ctx.reply({ embeds: [ctx.embed({ description: steps[0] })] });
      // Play the rest in the background so the command returns immediately.
      (async () => {
        for (let i = 1; i < steps.length; i++) {
          await sleep(1500);
          if (ctx.isSlash) await ctx.interaction.editReply({ embeds: [ctx.embed({ description: steps.slice(0, i + 1).join('\n') })] }).catch(() => {});
          else await msg?.edit?.({ embeds: [ctx.embed({ description: steps.slice(0, i + 1).join('\n') })] }).catch(() => {});
        }
      })().catch(() => {});
    },
  },
];

module.exports.parseDice = parseDice;
module.exports.rpsAlias = rpsAlias;
module.exports.rpsOutcome = rpsOutcome;
module.exports.RPS = RPS;
