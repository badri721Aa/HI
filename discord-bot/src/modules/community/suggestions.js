'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { truncate, discordTimestamp } = require('../../core/utils');
const { claim, postableChannel, fetchMsg } = require('./_lib');

/**
 * Settings: guild section "suggestions" { enabled, channel, counter, botId }.
 * Suggestions: collection "suggestions" `${guildId}:${number}` ->
 *   { number, guildId, channelId, messageId, authorId, content, status, reason, moderatorId, createdAt }
 */
const DEFAULTS = { enabled: false, channel: null, counter: 0, botId: null };
const COL = 'suggestions';
const STATUS = {
  pending: { label: '🕐 Pending', color: 0x5865f2 },
  approved: { label: '✅ Approved', color: 0x57f287 },
  denied: { label: '❌ Denied', color: 0xed4245 },
  considered: { label: '🤔 Under consideration', color: 0xfee75c },
  implemented: { label: '🚀 Implemented', color: 0x3498db },
};
const section = (ctx) => db.section(ctx.guild.id, 'suggestions', DEFAULTS);

function view(s, author) {
  const st = STATUS[s.status];
  return embed({
    color: st.color,
    author: author ? { name: author.username, iconURL: author.displayAvatarURL() } : undefined,
    title: `💡 Suggestion #${s.number}`,
    description: s.content,
    fields: [
      { name: 'Status', value: st.label, inline: true },
      { name: 'Submitted', value: discordTimestamp(s.createdAt, 'R'), inline: true },
      s.moderatorId ? { name: s.status === 'pending' ? 'Note' : `Reviewed by`, value: `<@${s.moderatorId}>`, inline: true } : null,
      s.reason ? { name: 'Reason', value: truncate(s.reason, 1000) } : null,
    ],
    footer: `Vote with 👍 / 👎 • ID ${s.number}`,
  });
}

function reviewCommand(status, name, aliases) {
  return {
    name,
    aliases,
    description: `Mark a suggestion as ${status}`,
    usage: '<suggestion number> [reason]',
    examples: ['1 Great idea, adding it this week'],
    guildOnly: true,
    userPerms: ['ManageMessages'],
    minArgs: 1,
    async execute(ctx) {
      const n = parseInt(ctx.args[0].replace('#', ''), 10);
      const s = Number.isInteger(n) && db.get(COL, `${ctx.guild.id}:${n}`, null);
      if (!s) return ctx.fail(`Suggestion #${ctx.args[0]} not found.`);
      s.status = status;
      s.reason = truncate(ctx.rest(1), 1000) || null;
      s.moderatorId = ctx.author.id;
      db.save();
      const ch = ctx.guild.channels.cache.get(s.channelId);
      const msg = await fetchMsg(ch, s.messageId);
      const author = await ctx.client.users.fetch(s.authorId).catch(() => null);
      if (msg) await msg.edit({ embeds: [view(s, author)] }).catch(() => {});
      // Let the author know what happened to their own suggestion.
      await author
        ?.send?.({ embeds: [embed({ color: STATUS[status].color, description: `Your suggestion **#${s.number}** in **${ctx.guild.name}** was marked **${STATUS[status].label}**.${s.reason ? `\n> ${s.reason}` : ''}` })] })
        .catch(() => {});
      await ctx.ok(`Suggestion **#${s.number}** marked ${STATUS[status].label}.`);
    },
  };
}

module.exports = [
  {
    name: 'setsuggestions',
    aliases: ['suggestionchannel'],
    description: 'Set the channel where suggestions are posted',
    usage: '<#channel>',
    examples: ['#general'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const { channel, error } = postableChannel(ctx, ctx.args[0]);
      if (error) return ctx.fail(error);
      const cfg = section(ctx);
      cfg.channel = channel.id;
      cfg.enabled = true;
      claim(cfg, ctx.client);
      await ctx.ok(`Suggestions will be posted in ${channel}. Members can use \`${ctx.prefix}suggest <idea>\`.`);
    },
  },
  {
    name: 'suggestionsoff',
    description: 'Turn the suggestion system off',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      section(ctx).enabled = false;
      db.save();
      await ctx.ok('Suggestions turned off.');
    },
  },
  {
    name: 'suggest',
    aliases: ['suggestion'],
    description: 'Submit a suggestion for the server',
    usage: '<your idea>',
    examples: ['Add a music channel'],
    guildOnly: true,
    cooldown: 60,
    minArgs: 1,
    slash: true,
    args: [{ name: 'suggestion', type: 'string', description: 'Your idea', required: true, rest: true }],
    async execute(ctx) {
      const cfg = section(ctx);
      const ch = cfg.enabled && ctx.guild.channels.cache.get(cfg.channel);
      if (!ch?.send) return ctx.fail(`Suggestions are not set up here. An admin can run \`${ctx.prefix}setsuggestions #channel\`.`);
      const content = ctx.rest(0);
      if (content.length > 2000) return ctx.fail('Keep suggestions under 2000 characters.');
      cfg.counter += 1;
      const s = { number: cfg.counter, guildId: ctx.guild.id, channelId: ch.id, messageId: null, authorId: ctx.author.id, content, status: 'pending', reason: null, moderatorId: null, createdAt: Date.now() };
      const msg = await ch.send({ embeds: [view(s, ctx.author)] });
      s.messageId = msg.id;
      db.set(COL, `${ctx.guild.id}:${s.number}`, s);
      await msg.react('👍').catch(() => {});
      await msg.react('👎').catch(() => {});
      if (ctx.message && ctx.channel.id === ch.id) await ctx.message.delete().catch(() => {});
      await ctx.reply({ embeds: [ctx.embeds.success(`Suggestion **#${s.number}** submitted in ${ch}!`)], ephemeral: true });
    },
  },
  reviewCommand('approved', 'suggestapprove', ['sapprove']),
  reviewCommand('denied', 'suggestdeny', ['sdeny']),
  reviewCommand('considered', 'suggestconsider', ['sconsider']),
  reviewCommand('implemented', 'suggestimplemented', ['simplemented']),
  {
    name: 'suggestinfo',
    aliases: ['sinfo'],
    description: 'Show a suggestion and its current vote count',
    usage: '<suggestion number>',
    examples: ['1'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const n = parseInt(ctx.args[0].replace('#', ''), 10);
      const s = Number.isInteger(n) && db.get(COL, `${ctx.guild.id}:${n}`, null);
      if (!s) return ctx.fail('Suggestion not found.');
      const ch = ctx.guild.channels.cache.get(s.channelId);
      const msg = await fetchMsg(ch, s.messageId);
      const up = (msg?.reactions?.cache?.get('👍')?.count || 1) - 1;
      const down = (msg?.reactions?.cache?.get('👎')?.count || 1) - 1;
      const author = await ctx.client.users.fetch(s.authorId).catch(() => null);
      const e = view(s, author);
      e.addFields({ name: 'Votes', value: `👍 ${up} • 👎 ${down}`, inline: true });
      if (msg?.url) e.addFields({ name: 'Link', value: `[Jump](${msg.url})`, inline: true });
      await ctx.reply({ embeds: [e] });
    },
  },
];
