'use strict';
const { ComponentType } = require('discord.js');
const { pick } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const content = require('./_content');
const { nameOf } = require('./_helpers');

/** Commands that show one random entry from a list, optionally aimed at a user. */
function listCommand({ name, aliases = [], description, list, title, render, targeted = false }) {
  return {
    name,
    aliases,
    description,
    usage: targeted ? '[@user]' : '',
    examples: [''],
    async execute(ctx) {
      let target = null;
      if (targeted && ctx.args[0]) target = await ctx.resolveUser(ctx.args[0]);
      const item = pick(list);
      const text = render ? render(item, target, ctx) : item;
      await ctx.reply({ embeds: [ctx.embed({ title, description: text })] });
    },
  };
}

/** A "party game" prompt with a "Next" button so a group can keep going. */
function partyCommand({ name, aliases = [], description, list, title, format = (x) => x }) {
  return {
    name,
    aliases,
    description,
    examples: [''],
    async execute(ctx) {
      const view = () => ({ embeds: [ctx.embed({ title, description: format(pick(list)) })], components: [row(button(`next:${name}`, 'Next', 'Secondary', '🔁'))] });
      const msg = await ctx.reply(view());
      if (!msg?.createMessageComponentCollector) return;
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60000, filter: (i) => i.customId === `next:${name}` });
      col.on('collect', (i) => i.update(view()).catch(() => {}));
      col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
  };
}

module.exports = [
  listCommand({
    name: 'roast',
    description: 'Playfully roast someone (all in good fun)',
    list: content.roasts,
    title: '🔥 Roasted',
    targeted: true,
    render: (r, t, ctx) => `${t ? `**${nameOf(t)}**, ` : `**${nameOf(ctx.author)}**, `}${r}`,
  }),
  listCommand({
    name: 'compliment',
    aliases: ['praise'],
    description: 'Give someone a nice compliment',
    list: content.compliments,
    title: '💐 Compliment',
    targeted: true,
    render: (c, t, ctx) => `**${nameOf(t || ctx.author)}**, ${c.charAt(0).toLowerCase()}${c.slice(1)}`,
  }),
  listCommand({ name: 'pickupline', aliases: ['pickup'], description: 'A cheesy (clean) pickup line', list: content.pickupLines, title: '😏 Pickup line' }),
  listCommand({ name: 'fortune', aliases: ['fortunecookie'], description: 'Crack open a fortune cookie', list: content.fortunes, title: '🥠 Your fortune', render: (f) => `*${f}*` }),
  listCommand({ name: 'pun', description: 'A groan-worthy pun', list: content.puns, title: '😅 Pun' }),
  listCommand({ name: 'excuse', description: 'Need an excuse? Here you go', list: content.excuses, title: '🙃 Excuse' }),
  listCommand({ name: 'showerthought', aliases: ['thought'], description: 'A random shower thought', list: content.showerThoughts, title: '🚿 Shower thought' }),
  listCommand({ name: 'motivate', aliases: ['motivation', 'inspire'], description: 'Some motivation for you', list: content.motivation, title: '💪 Motivation', targeted: true, render: (m, t) => (t ? `**${nameOf(t)}**, ${m}` : m) }),
  listCommand({ name: 'tonguetwister', aliases: ['twister'], description: 'Try to say this five times fast', list: content.tongueTwisters, title: '👅 Tongue twister' }),
  partyCommand({ name: 'wyr', aliases: ['wouldyourather'], description: 'Would you rather…?', list: content.wyr, title: '🤔 Would you rather…', format: ([a, b]) => `🅰️ ${a}\n\n**— or —**\n\n🅱️ ${b}` }),
  partyCommand({ name: 'thisorthat', aliases: ['tot'], description: 'This or that? Pick one', list: content.thisOrThat, title: '⚖️ This or that?', format: ([a, b]) => `**${a}**  or  **${b}**` }),
  partyCommand({ name: 'truth', description: 'A truth question for truth or dare', list: content.truths, title: '🫣 Truth' }),
  partyCommand({ name: 'dare', description: 'A (safe) dare for truth or dare', list: content.dares, title: '😈 Dare' }),
  partyCommand({ name: 'nhie', aliases: ['neverhaveiever'], description: 'Never have I ever…', list: content.nhie, title: '🙊 Never have I ever' }),
  partyCommand({ name: 'topic', aliases: ['icebreaker'], description: 'A conversation starter for the chat', list: content.topics, title: '💬 Topic' }),
  {
    name: 'truthordare',
    aliases: ['tod'],
    description: 'Pick truth or dare with buttons',
    examples: [''],
    async execute(ctx) {
      const view = (text, title = '🎲 Truth or Dare?') => ({
        embeds: [ctx.embed({ title, description: text })],
        components: [row(button('tod:truth', 'Truth', 'Success', '🫣'), button('tod:dare', 'Dare', 'Danger', '😈'), button('tod:random', 'Random', 'Secondary', '🎲'))],
      });
      const msg = await ctx.reply(view('Choose wisely…'));
      if (!msg?.createMessageComponentCollector) return;
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60000, filter: (i) => i.customId.startsWith('tod:') });
      col.on('collect', (i) => {
        let kind = i.customId.split(':')[1];
        if (kind === 'random') kind = Math.random() < 0.5 ? 'truth' : 'dare';
        const text = kind === 'truth' ? pick(content.truths) : pick(content.dares);
        i.update(view(`**${nameOf(i.member || i.user)}** got a ${kind}:\n\n${text}`, kind === 'truth' ? '🫣 Truth' : '😈 Dare')).catch(() => {});
      });
      col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
    },
  },
  {
    name: 'riddle',
    description: 'A riddle — the answer is hidden in a spoiler',
    examples: [''],
    async execute(ctx) {
      const r = pick(content.riddles);
      await ctx.reply({ embeds: [ctx.embed({ title: '🧩 Riddle', description: `${r.q}\n\n**Answer:** ||${r.a}||` })] });
    },
  },
];
