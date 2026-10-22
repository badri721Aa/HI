'use strict';
const { ChannelType, PermissionFlagsBits, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { button, row } = require('../../core/ui');
const { truncate, formatDuration } = require('../../core/utils');

/**
 * Guild section "tickets":
 *   { categoryId, supportRoleId, logChannelId, counter, limit, openMessage, botId }
 * Open tickets: collection "tickets" keyed by channelId ->
 *   { guildId, channelId, ownerId, number, reason, claimedBy, createdAt, botId, added: [] }
 */
const COL = 'tickets';
const DEFAULTS = {
  categoryId: null,
  supportRoleId: null,
  logChannelId: null,
  counter: 0,
  limit: 1,
  openMessage: 'Thanks for opening a ticket, {mention}! Support will be with you shortly. Describe your issue below.',
  botId: null,
};

const section = (guildId) => db.section(guildId, 'tickets', DEFAULTS);
const ticketOf = (channelId) => db.get(COL, channelId, null);
const err = (userMessage) => Object.assign(new Error(userMessage), { userMessage });

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

/** Staff = support role, Manage Channels, or server owner. */
function isStaff(member, cfg) {
  if (!member) return false;
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return !!(cfg.supportRoleId && member.roles?.cache?.has(cfg.supportRoleId));
}

function controls() {
  return row(button('tk:close', 'Close', 'Danger', '🔒'), button('tk:claim', 'Claim', 'Secondary', '🙋'));
}

async function ensureCategory(guild, cfg) {
  const existing = cfg.categoryId && guild.channels.cache.get(cfg.categoryId);
  if (existing?.type === ChannelType.GuildCategory) return existing;
  const cat = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory, reason: 'Ticket system' }).catch(() => {
    throw err('I could not create a "Tickets" category. Check my **Manage Channels** permission, or set one with `ticketcategory`.');
  });
  cfg.categoryId = cat.id;
  db.save();
  return cat;
}

/** Create a private ticket channel for `member`. Returns the channel. Throws errors with userMessage. */
async function openTicket(client, guild, member, reason) {
  const cfg = section(guild.id);
  const me = guild.members.me;
  if (!me?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    throw err('I need the **Manage Channels** and **Manage Roles** permissions to create tickets.');
  }
  const mine = db.entries(COL).filter(([, t]) => t.guildId === guild.id && t.ownerId === member.id);
  for (const [id] of mine) if (!guild.channels.cache.has(id)) db.delete(COL, id); // channel deleted manually
  const open = mine.filter(([id]) => guild.channels.cache.has(id));
  if (open.length >= cfg.limit) throw err(`You already have an open ticket: <#${open[0][0]}>`);

  const category = await ensureCategory(guild, cfg);
  cfg.counter += 1;
  const number = cfg.counter;
  db.save();

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: MEMBER_ALLOW },
    { id: client.user.id, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];
  if (cfg.supportRoleId && guild.roles.cache.has(cfg.supportRoleId)) overwrites.push({ id: cfg.supportRoleId, allow: MEMBER_ALLOW });

  const channel = await guild.channels
    .create({
      name: `ticket-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket #${number} • opened by ${member.user.username} (${member.id})${reason ? ` • ${truncate(reason, 200)}` : ''}`,
      permissionOverwrites: overwrites,
      reason: `Ticket opened by ${member.user.username}`,
    })
    .catch(() => {
      throw err('I could not create the ticket channel. Check my permissions — or the ticket category may be full (50 channels max).');
    });

  db.set(COL, channel.id, { guildId: guild.id, channelId: channel.id, ownerId: member.id, number, reason: reason || null, claimedBy: null, createdAt: Date.now(), botId: client.user.id, added: [] });

  const text = cfg.openMessage.replace(/\{mention\}/g, `<@${member.id}>`).replace(/\{user\}/g, member.displayName).replace(/\{server\}/g, guild.name);
  await channel.send({
    content: `<@${member.id}>${cfg.supportRoleId ? ` <@&${cfg.supportRoleId}>` : ''}`,
    embeds: [
      embed({
        color: client.botProfile.color,
        title: `🎫 Ticket #${number}`,
        description: text,
        fields: [{ name: 'Reason', value: reason ? truncate(reason, 1000) : 'No reason given' }],
        footer: 'Use the buttons below or the close / claim commands',
        timestamp: true,
      }),
    ],
    components: [controls()],
    allowedMentions: { users: [member.id], roles: cfg.supportRoleId ? [cfg.supportRoleId] : [] },
  });
  return channel;
}

async function buildTranscript(channel) {
  const all = [];
  let before;
  for (let i = 0; i < 20; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();
  const lines = all.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const parts = [m.content];
    for (const e of m.embeds || []) parts.push(`[embed] ${e.title || ''} ${e.description || ''}`.trim());
    for (const a of m.attachments?.values?.() || []) parts.push(`[attachment] ${a.url}`);
    return `[${time}] ${m.author?.username ?? 'unknown'}: ${parts.filter(Boolean).join(' | ')}`;
  });
  const header = `Transcript of #${channel.name} (${channel.id}) — ${all.length} messages — generated ${new Date().toISOString()}\n${'='.repeat(70)}\n`;
  return new AttachmentBuilder(Buffer.from(header + lines.join('\n'), 'utf8'), { name: `${channel.name}-transcript.txt` });
}

/** Post the transcript to the log channel and delete the ticket channel. */
async function closeTicket(client, channel, closedBy, reason) {
  const t = ticketOf(channel.id);
  if (!t) throw err('This is not a ticket channel.');
  const cfg = section(channel.guild.id);
  db.delete(COL, channel.id);
  const log = cfg.logChannelId && channel.guild.channels.cache.get(cfg.logChannelId);
  if (log?.send) {
    const file = await buildTranscript(channel);
    await log
      .send({
        embeds: [
          embed({
            color: 0xed4245,
            title: `🔒 Ticket #${t.number} closed`,
            fields: [
              { name: 'Opened by', value: `<@${t.ownerId}>`, inline: true },
              { name: 'Closed by', value: `<@${closedBy.id}>`, inline: true },
              { name: 'Claimed by', value: t.claimedBy ? `<@${t.claimedBy}>` : 'nobody', inline: true },
              { name: 'Open for', value: formatDuration(Date.now() - t.createdAt), inline: true },
              { name: 'Reason', value: truncate(reason || t.reason || 'none', 1000) },
            ],
            timestamp: true,
          }),
        ],
        files: [file],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  await channel.send({ embeds: [embed({ color: 0xed4245, description: `🔒 Ticket closed by <@${closedBy.id}>. This channel will be deleted in 5 seconds.` })] }).catch(() => {});
  setTimeout(() => channel.delete(`Ticket closed by ${closedBy.username}`).catch(() => {}), 5000).unref?.();
}

function reasonModal() {
  return new ModalBuilder()
    .setCustomId('tk:openm')
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('How can we help?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000),
      ),
    );
}

function panelPayload(title, description, color) {
  return {
    embeds: [embed({ color, title: title || '🎫 Support tickets', description: description || 'Need help? Click the button below to open a private ticket with our staff.' })],
    components: [row(button('tk:open', 'Open ticket', 'Primary', '🎫'))],
  };
}

module.exports = { COL, DEFAULTS, section, ticketOf, isStaff, openTicket, closeTicket, buildTranscript, reasonModal, panelPayload, controls, MEMBER_ALLOW, err };
