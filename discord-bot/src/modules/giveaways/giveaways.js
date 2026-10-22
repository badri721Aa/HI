'use strict';
const crypto = require('node:crypto');
const { MessageFlags } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { button, row, paginate } = require('../../core/ui');
const { parseDuration, formatDuration, truncate, discordTimestamp, chunk } = require('../../core/utils');
const { messageIdFrom, fetchMsg, withLock } = require('../community/_lib');

/**
 * Collection "giveaways" keyed by messageId ->
 *   { type: 'giveaway'|'drop', guildId, channelId, messageId, prize, winners, endsAt, hostId,
 *     entrants: [userId], requiredRoleId, ended, winnerIds: [], botId, createdAt }
 * Buttons: "gw:e" (enter/leave), "gw:drop" (first click wins).
 */
const COL = 'giveaways';
const EPHEMERAL = MessageFlags.Ephemeral;
const MAX_DURATION = 60 * 24 * 60 * 60 * 1000; // 60 days
const base = { guildOnly: true, userPerms: ['ManageGuild'] };

function pickWinners(entrants, count, exclude = []) {
  const pool = entrants.filter((id) => !exclude.includes(id));
  const out = [];
  while (pool.length && out.length < count) out.push(pool.splice(crypto.randomInt(pool.length), 1)[0]);
  return out;
}

function view(g, color) {
  const ended = g.ended;
  const lines = ended
    ? [
        g.winnerIds.length ? `🏆 **Winner${g.winnerIds.length > 1 ? 's' : ''}:** ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}` : '😢 No valid entrants.',
        `**Ended:** ${discordTimestamp(g.endsAt, 'R')}`,
      ]
    : [`Click **🎉 Enter** to join!`, `**Ends:** ${discordTimestamp(g.endsAt, 'R')} (${discordTimestamp(g.endsAt, 'f')})`];
  lines.push(`**Hosted by:** <@${g.hostId}>`, `**Winners:** ${g.winners}`, `**Entries:** ${g.entrants.length}`);
  if (g.requiredRoleId) lines.push(`**Required role:** <@&${g.requiredRoleId}>`);
  return {
    embeds: [
      embed({
        color: ended ? 0x2b2d31 : color ?? 0xeb459e,
        title: `🎉 ${g.prize}`,
        description: lines.join('\n'),
        footer: ended ? 'Giveaway ended' : `${g.winners} winner${g.winners > 1 ? 's' : ''} • Ends at`,
        timestamp: g.endsAt,
      }),
    ],
    components: [row(button('gw:e', ended ? 'Ended' : `Enter (${g.entrants.length})`, ended ? 'Secondary' : 'Primary', '🎉').setDisabled(ended))],
    allowedMentions: { parse: [] },
  };
}

async function channelOf(client, g) {
  return client.channels.cache.get(g.channelId) || client.channels.fetch(g.channelId).catch(() => null);
}

/** End a giveaway: pick winners, edit the message, announce. */
async function endGiveaway(client, g) {
  return withLock(`gw:${g.messageId}`, async () => {
    if (g.ended) return g;
    g.ended = true;
    g.endsAt = Math.min(g.endsAt, Date.now());
    g.winnerIds = pickWinners(g.entrants, g.winners);
    db.save();
    const channel = await channelOf(client, g);
    const msg = await fetchMsg(channel, g.messageId);
    if (msg) await msg.edit(view(g, client.botProfile.color)).catch(() => {});
    if (channel?.send) {
      const text = g.winnerIds.length
        ? `🎉 Congratulations ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}! You won **${g.prize}**!`
        : `The giveaway for **${g.prize}** ended with no valid entrants.`;
      await channel.send({ content: text, allowedMentions: { users: g.winnerIds }, reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined }).catch(() => {});
    }
    return g;
  });
}

function findGiveaway(ctx, ref) {
  const id = messageIdFrom(ref);
  const g = id && db.get(COL, id, null);
  return g && g.guildId === ctx.guild.id ? g : null;
}

async function start(ctx, { durationArg, winnersArg, role, prize }) {
  const ms = parseDuration(durationArg);
  if (!ms || ms < 10000 || ms > MAX_DURATION) return ctx.usage('Duration must be between 10s and 60d, e.g. `30m`, `1h`, `2d`.');
  const winners = parseInt(String(winnersArg).replace(/w$/i, ''), 10);
  if (!Number.isInteger(winners) || winners < 1 || winners > 20) return ctx.usage('Winners must be a number from 1 to 20.');
  if (!prize) return ctx.usage('Tell me the prize.');
  const g = {
    type: 'giveaway',
    guildId: ctx.guild.id,
    channelId: ctx.channel.id,
    messageId: null,
    prize: truncate(prize, 200),
    winners,
    endsAt: Date.now() + ms,
    hostId: ctx.author.id,
    entrants: [],
    requiredRoleId: role?.id || null,
    ended: false,
    winnerIds: [],
    botId: ctx.client.user.id,
    createdAt: Date.now(),
  };
  const msg = await ctx.channel.send(view(g, ctx.color));
  g.messageId = msg.id;
  db.set(COL, msg.id, g);
  if (ctx.message) await ctx.message.delete().catch(() => {});
  await ctx.reply({ embeds: [ctx.embeds.success(`Giveaway started! It ends ${discordTimestamp(g.endsAt)}. ID: \`${msg.id}\``)], ephemeral: true });
}

module.exports = {
  commands: [
    {
      ...base,
      name: 'gstart',
      aliases: ['giveaway', 'gcreate'],
      description: 'Start a giveaway with an entry button',
      usage: '<duration> <winners> <prize>',
      examples: ['1h 1 Discord Nitro', '30m 3 Steam key'],
      botPerms: ['SendMessages', 'EmbedLinks'],
      minArgs: 3,
      slash: true,
      args: [
        { name: 'duration', type: 'string', description: 'How long, e.g. 30m, 2h, 1d', required: true },
        { name: 'winners', type: 'integer', description: 'Number of winners (1-20)', required: true, min: 1, max: 20 },
        { name: 'prize', type: 'string', description: 'What people can win', required: true, rest: true },
      ],
      async execute(ctx) {
        await start(ctx, { durationArg: ctx.args[0], winnersArg: ctx.args[1], prize: ctx.rest(2) });
      },
    },
    {
      ...base,
      name: 'gstartrole',
      aliases: ['greq'],
      description: 'Start a giveaway that only members with a role can enter',
      usage: '<duration> <winners> <@role> <prize>',
      examples: ['1d 1 @Members Nitro'],
      botPerms: ['SendMessages', 'EmbedLinks'],
      minArgs: 4,
      async execute(ctx) {
        const role = ctx.resolveRole(ctx.args[2]);
        if (!role) return ctx.fail('Role not found — mention it or use its ID.');
        await start(ctx, { durationArg: ctx.args[0], winnersArg: ctx.args[1], role, prize: ctx.rest(3) });
      },
    },
    {
      ...base,
      name: 'gend',
      aliases: ['giveawayend'],
      description: 'End a giveaway now and pick winners',
      usage: '<giveaway message ID>',
      examples: ['123456789012345678'],
      minArgs: 1,
      slash: true,
      args: [{ name: 'message_id', type: 'string', description: 'Giveaway message ID or link', required: true }],
      async execute(ctx) {
        const g = findGiveaway(ctx, ctx.args[0]);
        if (!g || g.type !== 'giveaway') return ctx.fail('Giveaway not found.');
        if (g.ended) return ctx.fail('That giveaway already ended. Use `greroll` to pick new winners.');
        await endGiveaway(ctx.client, g);
        await ctx.ok(`Giveaway ended — ${g.winnerIds.length ? `winner(s): ${g.winnerIds.map((id) => `<@${id}>`).join(', ')}` : 'no valid entrants'}.`);
      },
    },
    {
      ...base,
      name: 'greroll',
      aliases: ['giveawayreroll'],
      description: 'Pick new winner(s) for an ended giveaway',
      usage: '<giveaway message ID> [count]',
      examples: ['123456789012345678 1'],
      minArgs: 1,
      slash: true,
      args: [
        { name: 'message_id', type: 'string', description: 'Giveaway message ID or link', required: true },
        { name: 'count', type: 'integer', description: 'How many new winners (default 1)', required: false, min: 1, max: 20 },
      ],
      async execute(ctx) {
        const g = findGiveaway(ctx, ctx.args[0]);
        if (!g || g.type !== 'giveaway') return ctx.fail('Giveaway not found.');
        if (!g.ended) return ctx.fail('That giveaway is still running — end it first with `gend`.');
        const count = Math.min(20, Math.max(1, parseInt(ctx.args[1], 10) || 1));
        let fresh = pickWinners(g.entrants, count, g.winnerIds);
        if (!fresh.length) fresh = pickWinners(g.entrants, count);
        if (!fresh.length) return ctx.fail('Nobody entered that giveaway.');
        g.winnerIds = fresh;
        db.save();
        const msg = await fetchMsg(ctx.guild.channels.cache.get(g.channelId), g.messageId);
        if (msg) await msg.edit(view(g, ctx.color)).catch(() => {});
        await ctx.reply({ content: `🎉 New winner${fresh.length > 1 ? 's' : ''} for **${g.prize}**: ${fresh.map((id) => `<@${id}>`).join(', ')}!`, allowedMentions: { users: fresh } });
      },
    },
    {
      ...base,
      name: 'gextend',
      description: 'Add time to a running giveaway',
      usage: '<giveaway message ID> <duration>',
      examples: ['123456789012345678 1h'],
      minArgs: 2,
      async execute(ctx) {
        const g = findGiveaway(ctx, ctx.args[0]);
        if (!g || g.type !== 'giveaway' || g.ended) return ctx.fail('Running giveaway not found.');
        const ms = parseDuration(ctx.args[1]);
        if (!ms || g.endsAt + ms - Date.now() > MAX_DURATION) return ctx.usage('Give a valid duration (total under 60 days).');
        g.endsAt += ms;
        db.save();
        const msg = await fetchMsg(ctx.guild.channels.cache.get(g.channelId), g.messageId);
        if (msg) await msg.edit(view(g, ctx.color)).catch(() => {});
        await ctx.ok(`Extended by ${formatDuration(ms)} — now ends ${discordTimestamp(g.endsAt)}.`);
      },
    },
    {
      ...base,
      name: 'gdelete',
      aliases: ['giveawaydelete', 'gcancel'],
      description: 'Cancel and delete a giveaway without picking winners',
      usage: '<giveaway message ID>',
      examples: ['123456789012345678'],
      minArgs: 1,
      async execute(ctx) {
        const g = findGiveaway(ctx, ctx.args[0]);
        if (!g) return ctx.fail('Giveaway not found.');
        db.delete(COL, g.messageId);
        const msg = await fetchMsg(ctx.guild.channels.cache.get(g.channelId), g.messageId);
        await msg?.delete().catch(() => {});
        await ctx.ok(`Giveaway for **${g.prize}** deleted.`);
      },
    },
    {
      name: 'glist',
      aliases: ['giveaways'],
      description: 'List running giveaways in this server',
      guildOnly: true,
      async execute(ctx) {
        const running = db
          .entries(COL)
          .map(([, g]) => g)
          .filter((g) => g.guildId === ctx.guild.id && !g.ended && g.type === 'giveaway')
          .sort((a, b) => a.endsAt - b.endsAt);
        if (!running.length) return ctx.info('No giveaways are running right now.');
        const lines = running.map((g) => `🎉 [**${truncate(g.prize, 60)}**](https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId}) • ${g.winners}W • ${g.entrants.length} entries • ends ${discordTimestamp(g.endsAt)} • \`${g.messageId}\``);
        await paginate(ctx, chunk(lines, 10).map((c) => ctx.embed({ title: `🎉 Running giveaways (${running.length})`, description: c.join('\n') })));
      },
    },
    {
      name: 'gentrants',
      aliases: ['gentries'],
      description: 'See how many people entered a giveaway',
      usage: '<giveaway message ID>',
      examples: ['123456789012345678'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const g = findGiveaway(ctx, ctx.args[0]);
        if (!g || g.type !== 'giveaway') return ctx.fail('Giveaway not found.');
        const shown = g.entrants.slice(-40).map((id) => `<@${id}>`).join(' ');
        await ctx.reply({
          embeds: [ctx.embed({ title: `🎉 ${g.prize}`, description: `**${g.entrants.length}** entr${g.entrants.length === 1 ? 'y' : 'ies'}.${shown ? `\n\nLatest: ${shown}` : ''}` })],
          allowedMentions: { parse: [] },
        });
      },
    },
    {
      ...base,
      name: 'gdrop',
      aliases: ['drop'],
      description: 'Drop a prize — the first person to click the button wins it',
      usage: '<prize>',
      examples: ['A free role'],
      botPerms: ['SendMessages', 'EmbedLinks'],
      minArgs: 1,
      async execute(ctx) {
        const g = {
          type: 'drop',
          guildId: ctx.guild.id,
          channelId: ctx.channel.id,
          messageId: null,
          prize: truncate(ctx.rest(0), 200),
          winners: 1,
          endsAt: Date.now() + 24 * 3600 * 1000,
          hostId: ctx.author.id,
          entrants: [],
          requiredRoleId: null,
          ended: false,
          winnerIds: [],
          botId: ctx.client.user.id,
          createdAt: Date.now(),
        };
        const msg = await ctx.channel.send({
          embeds: [embed({ color: 0xf1c40f, title: `🎁 Drop: ${g.prize}`, description: `First to click **Claim** wins!\nDropped by <@${ctx.author.id}>` })],
          components: [row(button('gw:drop', 'Claim', 'Success', '🎁'))],
          allowedMentions: { parse: [] },
        });
        g.messageId = msg.id;
        db.set(COL, msg.id, g);
        if (ctx.message) await ctx.message.delete().catch(() => {});
        if (ctx.isSlash) await ctx.reply({ content: 'Drop posted!', ephemeral: true });
      },
    },
  ],
  components: {
    async gw(interaction, parts, client) {
      const g = db.get(COL, interaction.message.id, null);
      if (!g) return interaction.reply({ content: 'This giveaway no longer exists.', flags: EPHEMERAL });

      if (parts[0] === 'drop') {
        return withLock(`gw:${g.messageId}`, async () => {
          if (g.ended) return interaction.reply({ content: `Too late — <@${g.winnerIds[0]}> already claimed it!`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
          g.ended = true;
          g.winnerIds = [interaction.user.id];
          g.endsAt = Date.now();
          db.save();
          await interaction.update({
            embeds: [embed({ color: 0x57f287, title: `🎁 Drop: ${g.prize}`, description: `🏆 Claimed by <@${interaction.user.id}> in ${formatDuration(Date.now() - g.createdAt)}!` })],
            components: [row(button('gw:drop', 'Claimed', 'Secondary', '🎁').setDisabled(true))],
            allowedMentions: { parse: [] },
          });
        });
      }

      if (parts[0] === 'e') {
        return withLock(`gw:${g.messageId}`, async () => {
          if (g.ended || g.endsAt <= Date.now()) return interaction.reply({ content: 'This giveaway has ended.', flags: EPHEMERAL });
          if (g.requiredRoleId) {
            const has = interaction.member?.roles?.cache?.has(g.requiredRoleId) ?? interaction.member?.roles?.includes?.(g.requiredRoleId);
            if (!has) return interaction.reply({ content: `You need the <@&${g.requiredRoleId}> role to enter.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
          }
          const idx = g.entrants.indexOf(interaction.user.id);
          if (idx >= 0) g.entrants.splice(idx, 1);
          else g.entrants.push(interaction.user.id);
          db.save();
          await interaction.update(view(g, client.botProfile.color)).catch(() => {});
          await interaction.followUp({ content: idx >= 0 ? '👋 You left the giveaway.' : '🎉 You entered the giveaway! Good luck!', flags: EPHEMERAL }).catch(() => {});
        });
      }
    },
  },
  tasks: [
    {
      name: 'giveaways',
      interval: 10000,
      async run(client) {
        const now = Date.now();
        for (const [id, g] of db.entries(COL)) {
          if (g.botId !== client.user.id) continue;
          if (g.type === 'giveaway' && !g.ended && g.endsAt <= now) await endGiveaway(client, g).catch(() => {});
          // Forget finished giveaways/drops after 30 days.
          else if (g.ended && now - g.endsAt > 30 * 86400000) db.delete(COL, id);
          else if (g.type === 'drop' && !g.ended && now - g.createdAt > 7 * 86400000) db.delete(COL, id);
        }
      },
    },
  ],
};
