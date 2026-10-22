'use strict';
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { button, row } = require('../../core/ui');
const { parseDuration, truncate, discordTimestamp, chunk } = require('../../core/utils');
const { messageIdFrom, fetchMsg, withLock } = require('../community/_lib');

/**
 * Collection "polls" keyed by messageId ->
 *   { guildId, channelId, messageId, question, options: [text], emojis: [emoji|null], votes: { userId: optionIndex },
 *     authorId, endsAt|null, ended, botId, createdAt }
 * Buttons: "poll:v:<index>" — click to vote, click the same option again to remove your vote.
 */
const COL = 'polls';
const EPHEMERAL = MessageFlags.Ephemeral;
const NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_DURATION = 30 * 24 * 3600 * 1000;

function tally(p) {
  const counts = p.options.map(() => 0);
  for (const i of Object.values(p.votes)) if (counts[i] !== undefined) counts[i]++;
  return counts;
}

function bar(pct) {
  const filled = Math.round(pct / 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function view(p, color) {
  const counts = tally(p);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const lines = p.options.map((o, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    const crown = p.ended && total && counts[i] === max ? ' 🏆' : '';
    return `${p.emojis[i] || NUMBERS[i]} **${o}**${crown}\n\`${bar(pct)}\` ${pct}% (${counts[i]})`;
  });
  const footer = p.ended ? `Poll closed • ${total} vote${total === 1 ? '' : 's'}` : `${total} vote${total === 1 ? '' : 's'} • click again to remove your vote`;
  const extra = p.ended ? '\n\n**This poll is closed.**' : p.endsAt ? `\n\nCloses ${discordTimestamp(p.endsAt)}` : '';
  const buttons = p.options.map((o, i) =>
    button(`poll:v:${i}`, truncate(o, 70), p.ended ? 'Secondary' : 'Primary', p.emojis[i] || NUMBERS[i]).setDisabled(!!p.ended),
  );
  return {
    embeds: [embed({ color: p.ended ? 0x2b2d31 : color, title: `📊 ${p.question}`, description: lines.join('\n\n') + extra, footer, author: undefined })],
    components: chunk(buttons, 5).map((b) => row(...b)),
    allowedMentions: { parse: [] },
  };
}

async function endPoll(client, p) {
  return withLock(`poll:${p.messageId}`, async () => {
    if (p.ended) return;
    p.ended = true;
    db.save();
    const ch = client.channels.cache.get(p.channelId) || (await client.channels.fetch(p.channelId).catch(() => null));
    const msg = await fetchMsg(ch, p.messageId);
    if (msg) await msg.edit(view(p, client.botProfile.color)).catch(() => {});
  });
}

async function createPoll(ctx, question, options, emojis, durationMs) {
  const p = {
    guildId: ctx.guild.id,
    channelId: ctx.channel.id,
    messageId: null,
    question: truncate(question, 250),
    options: options.map((o) => truncate(o, 200)),
    emojis,
    votes: {},
    authorId: ctx.author.id,
    endsAt: durationMs ? Date.now() + durationMs : null,
    ended: false,
    botId: ctx.client.user.id,
    createdAt: Date.now(),
  };
  const msg = await ctx.channel.send(view(p, ctx.color));
  p.messageId = msg.id;
  db.set(COL, msg.id, p);
  if (ctx.message) await ctx.message.delete().catch(() => {});
  if (ctx.isSlash) await ctx.reply({ content: `📊 Poll posted! ID: \`${msg.id}\``, ephemeral: true });
  return p;
}

/** Pull "time:30m" (or "--time 30m") out of the text. */
function extractDuration(text) {
  let ms = null;
  const out = text.replace(/(?:^|\s)(?:time:|--time\s+)(\S+)/i, (_, d) => {
    ms = parseDuration(d);
    return ' ';
  });
  return { text: out.trim(), ms };
}

function findPoll(ctx, ref) {
  const id = messageIdFrom(ref);
  const p = id && db.get(COL, id, null);
  return p && p.guildId === ctx.guild.id ? p : null;
}

function canManage(ctx, p) {
  return p.authorId === ctx.author.id || ctx.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
}

module.exports = {
  commands: [
    {
      name: 'poll',
      aliases: ['createpoll'],
      description: 'Button poll with 2-10 options: question | option 1 | option 2 …',
      usage: '<question> | <option 1> | <option 2> [| …] [time:1h]',
      examples: ['Best pizza? | Pepperoni | Margherita | Hawaiian', 'Movie night? | Friday | Saturday time:1d'],
      guildOnly: true,
      botPerms: ['SendMessages', 'EmbedLinks'],
      cooldown: 10,
      minArgs: 1,
      slash: true,
      args: [{ name: 'input', type: 'string', description: 'Question | Option 1 | Option 2 … (add time:1h to auto-close)', required: true, rest: true }],
      async execute(ctx) {
        const { text, ms } = extractDuration(ctx.rest(0));
        const parts = text.split('|').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        const [question, ...options] = parts;
        if (!question || options.length < 2) return ctx.usage('Give a question and at least 2 options separated by `|`.');
        if (options.length > 10) return ctx.fail('A poll can have at most 10 options.');
        if (ms !== null && (ms < 30000 || ms > MAX_DURATION)) return ctx.fail('Poll duration must be between 30s and 30d.');
        await createPoll(ctx, question, options, options.map(() => null), ms);
      },
    },
    {
      name: 'yesno',
      aliases: ['ynpoll'],
      description: 'Quick Yes / No button poll',
      usage: '<question> [time:1h]',
      examples: ['Should we add a gaming channel?'],
      guildOnly: true,
      botPerms: ['SendMessages', 'EmbedLinks'],
      cooldown: 10,
      minArgs: 1,
      slash: true,
      args: [{ name: 'question', type: 'string', description: 'The question (add time:1h to auto-close)', required: true, rest: true }],
      async execute(ctx) {
        const { text, ms } = extractDuration(ctx.rest(0));
        if (!text) return ctx.usage();
        if (ms !== null && (ms < 30000 || ms > MAX_DURATION)) return ctx.fail('Poll duration must be between 30s and 30d.');
        await createPoll(ctx, text, ['Yes', 'No'], ['✅', '❌'], ms);
      },
    },
    {
      name: 'quickpoll',
      aliases: ['qpoll', 'vote'],
      description: 'Reaction poll with 👍 👎 🤷',
      usage: '<question>',
      examples: ['Pizza tonight?'],
      guildOnly: true,
      botPerms: ['AddReactions', 'EmbedLinks'],
      cooldown: 5,
      minArgs: 1,
      async execute(ctx) {
        const msg = await ctx.channel.send({
          embeds: [embed({ color: ctx.color, title: `📊 ${truncate(ctx.rest(0), 250)}`, description: 'React to vote: 👍 yes • 👎 no • 🤷 not sure', footer: `Asked by ${ctx.author.username}` })],
          allowedMentions: { parse: [] },
        });
        for (const e of ['👍', '👎', '🤷']) await msg.react(e).catch(() => {});
        if (ctx.message) await ctx.message.delete().catch(() => {});
        if (ctx.isSlash) await ctx.reply({ content: 'Poll posted!', ephemeral: true });
      },
    },
    {
      name: 'endpoll',
      aliases: ['closepoll'],
      description: 'Close a poll now and show the final results',
      usage: '<poll message ID or link>',
      examples: ['123456789012345678'],
      guildOnly: true,
      minArgs: 1,
      slash: true,
      args: [{ name: 'message_id', type: 'string', description: 'Poll message ID or link', required: true }],
      async execute(ctx) {
        const p = findPoll(ctx, ctx.args[0]);
        if (!p) return ctx.fail('Poll not found.');
        if (!canManage(ctx, p)) return ctx.fail('Only the poll creator or someone with Manage Messages can close it.');
        if (p.ended) return ctx.fail('That poll is already closed.');
        await endPoll(ctx.client, p);
        await ctx.ok('Poll closed.');
      },
    },
    {
      name: 'pollresults',
      aliases: ['presults'],
      description: 'Show the current results of a poll',
      usage: '<poll message ID or link>',
      examples: ['123456789012345678'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const p = findPoll(ctx, ctx.args[0]);
        if (!p) return ctx.fail('Poll not found.');
        const v = view(p, ctx.color);
        await ctx.reply({ embeds: v.embeds, allowedMentions: { parse: [] } });
      },
    },
    {
      name: 'pollvoters',
      description: 'See who voted for an option (poll creator or moderators)',
      usage: '<poll message ID or link> <option number>',
      examples: ['123456789012345678 1'],
      guildOnly: true,
      minArgs: 2,
      async execute(ctx) {
        const p = findPoll(ctx, ctx.args[0]);
        if (!p) return ctx.fail('Poll not found.');
        if (!canManage(ctx, p)) return ctx.fail('Only the poll creator or someone with Manage Messages can see voters.');
        const n = parseInt(ctx.args[1], 10) - 1;
        if (!(n >= 0 && n < p.options.length)) return ctx.fail(`Pick an option from 1 to ${p.options.length}.`);
        const voters = Object.entries(p.votes).filter(([, i]) => i === n).map(([id]) => `<@${id}>`);
        await ctx.reply({
          embeds: [ctx.embed({ title: `${p.emojis[n] || NUMBERS[n]} ${p.options[n]}`, description: voters.length ? voters.slice(0, 80).join(' ') + (voters.length > 80 ? ` …and ${voters.length - 80} more` : '') : 'No votes yet.' })],
          allowedMentions: { parse: [] },
          ephemeral: true,
        });
      },
    },
    {
      name: 'polls',
      aliases: ['activepolls'],
      description: 'List open button polls in this server',
      guildOnly: true,
      async execute(ctx) {
        const open = db
          .entries(COL)
          .map(([, p]) => p)
          .filter((p) => p.guildId === ctx.guild.id && !p.ended)
          .slice(-20);
        if (!open.length) return ctx.info('No open polls.');
        const lines = open.map((p) => `📊 [${truncate(p.question, 60)}](https://discord.com/channels/${p.guildId}/${p.channelId}/${p.messageId}) • ${Object.keys(p.votes).length} votes${p.endsAt ? ` • closes ${discordTimestamp(p.endsAt)}` : ''} • \`${p.messageId}\``);
        await ctx.info(lines.join('\n'), '📊 Open polls');
      },
    },
    {
      name: 'deletepoll',
      aliases: ['delpoll'],
      description: 'Delete a poll and its message',
      usage: '<poll message ID or link>',
      examples: ['123456789012345678'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const p = findPoll(ctx, ctx.args[0]);
        if (!p) return ctx.fail('Poll not found.');
        if (!canManage(ctx, p)) return ctx.fail('Only the poll creator or someone with Manage Messages can delete it.');
        db.delete(COL, p.messageId);
        const msg = await fetchMsg(ctx.guild.channels.cache.get(p.channelId), p.messageId);
        await msg?.delete().catch(() => {});
        await ctx.ok('Poll deleted.');
      },
    },
  ],
  components: {
    async poll(interaction, parts, client) {
      if (parts[0] !== 'v') return;
      const p = db.get(COL, interaction.message.id, null);
      if (!p) return interaction.reply({ content: 'This poll no longer exists.', flags: EPHEMERAL });
      const idx = parseInt(parts[1], 10);
      if (!(idx >= 0 && idx < p.options.length)) return;
      return withLock(`poll:${p.messageId}`, async () => {
        if (p.ended || (p.endsAt && p.endsAt <= Date.now())) return interaction.reply({ content: 'This poll is closed.', flags: EPHEMERAL });
        const prev = p.votes[interaction.user.id];
        let note;
        if (prev === idx) {
          delete p.votes[interaction.user.id];
          note = `🗑️ Removed your vote for **${p.options[idx]}**.`;
        } else {
          p.votes[interaction.user.id] = idx;
          note = prev === undefined ? `✅ You voted for **${p.options[idx]}**.` : `🔁 Changed your vote to **${p.options[idx]}**.`;
        }
        db.save();
        await interaction.update(view(p, client.botProfile.color)).catch(() => {});
        await interaction.followUp({ content: note, flags: EPHEMERAL, allowedMentions: { parse: [] } }).catch(() => {});
      });
    },
  },
  tasks: [
    {
      name: 'polls',
      interval: 15000,
      async run(client) {
        const now = Date.now();
        for (const [id, p] of db.entries(COL)) {
          if (p.botId !== client.user.id) continue;
          if (!p.ended && p.endsAt && p.endsAt <= now) await endPoll(client, p).catch(() => {});
          else if (p.ended && now - (p.endsAt || p.createdAt) > 30 * 86400000) db.delete(COL, id);
        }
      },
    },
  ],
};
