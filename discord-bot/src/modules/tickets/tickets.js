'use strict';
const { ChannelType, MessageFlags } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { button, row } = require('../../core/ui');
const { truncate, discordTimestamp } = require('../../core/utils');
const { claim, postableChannel } = require('../community/_lib');
const T = require('./_lib');

const EPHEMERAL = MessageFlags.Ephemeral;
const admin = { guildOnly: true, userPerms: ['ManageGuild'] };

/** Common guard for commands run inside a ticket by staff (or the owner when allowed). */
function inTicket(ctx, { ownerAllowed = false } = {}) {
  const t = T.ticketOf(ctx.channel.id);
  if (!t) return { error: 'This command only works inside a ticket channel.' };
  const cfg = T.section(ctx.guild.id);
  if (!T.isStaff(ctx.member, cfg) && !(ownerAllowed && t.ownerId === ctx.author.id)) return { error: 'Only support staff can do that.' };
  return { t, cfg };
}

/** Accepts the role and log channel in any order (mentions, IDs or names). */
function parseSetupArgs(ctx) {
  let role = null;
  let log = null;
  for (const a of ctx.args) {
    const r = a.startsWith('<#') ? null : ctx.resolveRole(a);
    if (r && r.id !== ctx.guild.id) role = r;
    else log = ctx.resolveChannel(a) || log;
  }
  return { role, log };
}

module.exports = {
  commands: [
    {
      ...admin,
      name: 'ticketsetup',
      description: 'Set up tickets: support role, log channel, and post the panel here',
      usage: '[@support-role] [#log-channel]',
      examples: ['', '#general'],
      botPerms: ['ManageChannels', 'ManageRoles', 'SendMessages', 'EmbedLinks'],
      slash: true,
      args: [
        { name: 'support_role', type: 'role', description: 'Role that can see and answer tickets', required: false },
        { name: 'log_channel', type: 'channel', description: 'Where closed-ticket transcripts go', required: false },
      ],
      async execute(ctx) {
        const cfg = T.section(ctx.guild.id);
        const { role, log } = parseSetupArgs(ctx);
        if (role) cfg.supportRoleId = role.id;
        if (log) {
          const { error } = postableChannel(ctx, log.id);
          if (error) return ctx.fail(error);
          cfg.logChannelId = log.id;
        }
        claim(cfg, ctx.client);
        await ctx.channel.send(T.panelPayload(null, null, ctx.color));
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: '🎫 Tickets are ready',
              description: [
                `**Panel:** posted in ${ctx.channel}`,
                `**Support role:** ${cfg.supportRoleId ? `<@&${cfg.supportRoleId}>` : 'not set (`ticketrole @role`)'}`,
                `**Transcripts:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'not set (`ticketlog #channel`)'}`,
                `**Category:** created automatically on the first ticket (or \`ticketcategory\`)`,
              ].join('\n'),
            }),
          ],
          ephemeral: true,
        });
      },
    },
    {
      ...admin,
      name: 'ticketpanel',
      description: 'Post a ticket panel with an "Open ticket" button in this channel',
      usage: '[title | description]',
      examples: ['Support | Click below to talk to staff'],
      botPerms: ['SendMessages', 'EmbedLinks'],
      async execute(ctx) {
        const [title, description] = ctx.rest(0).split('|').map((s) => s.trim());
        await ctx.channel.send(T.panelPayload(truncate(title, 200) || null, truncate(description, 2000) || null, ctx.color));
        claim(T.section(ctx.guild.id), ctx.client);
        if (ctx.message) await ctx.message.delete().catch(() => {});
        if (ctx.isSlash) await ctx.reply({ content: 'Panel posted.', ephemeral: true });
      },
    },
    {
      ...admin,
      name: 'ticketrole',
      aliases: ['supportrole'],
      description: 'Set the support role that can see tickets',
      usage: '<@role|off>',
      examples: ['off'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = T.section(ctx.guild.id);
        if (ctx.args[0].toLowerCase() === 'off') {
          cfg.supportRoleId = null;
          db.save();
          return ctx.ok('Support role removed.');
        }
        const role = ctx.resolveRole(ctx.rest(0));
        if (!role || role.id === ctx.guild.id) return ctx.fail('Role not found.');
        cfg.supportRoleId = role.id;
        claim(cfg, ctx.client);
        await ctx.ok(`New tickets will be visible to ${role}.`);
      },
    },
    {
      ...admin,
      name: 'ticketlog',
      aliases: ['ticketlogs'],
      description: 'Set the channel that receives closed-ticket transcripts',
      usage: '<#channel|off>',
      examples: ['#general'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = T.section(ctx.guild.id);
        if (ctx.args[0].toLowerCase() === 'off') {
          cfg.logChannelId = null;
          db.save();
          return ctx.ok('Transcript logging turned off.');
        }
        const { channel, error } = postableChannel(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        cfg.logChannelId = channel.id;
        claim(cfg, ctx.client);
        await ctx.ok(`Transcripts will be sent to ${channel}.`);
      },
    },
    {
      ...admin,
      name: 'ticketcategory',
      description: 'Set the category new tickets are created in',
      usage: '<category name or ID>',
      examples: ['Tickets'],
      minArgs: 1,
      async execute(ctx) {
        const q = ctx.rest(0).toLowerCase();
        const cat = ctx.guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && (c.id === q.replace(/\D/g, '') || c.name.toLowerCase() === q));
        if (!cat) return ctx.fail('No category with that name or ID.');
        const cfg = T.section(ctx.guild.id);
        cfg.categoryId = cat.id;
        claim(cfg, ctx.client);
        await ctx.ok(`New tickets will be created in **${cat.name}**.`);
      },
    },
    {
      ...admin,
      name: 'ticketlimit',
      description: 'How many open tickets one member may have (1-10)',
      usage: '<number>',
      examples: ['2'],
      minArgs: 1,
      async execute(ctx) {
        const n = parseInt(ctx.args[0], 10);
        if (!Number.isInteger(n) || n < 1 || n > 10) return ctx.usage();
        T.section(ctx.guild.id).limit = n;
        db.save();
        await ctx.ok(`Members can now have up to **${n}** open ticket(s).`);
      },
    },
    {
      ...admin,
      name: 'ticketmsg',
      description: 'Set the message shown when a ticket opens ({mention} {user} {server})',
      usage: '<message>',
      examples: ['Hi {mention}, staff will reply soon!'],
      minArgs: 1,
      async execute(ctx) {
        T.section(ctx.guild.id).openMessage = truncate(ctx.rest(0), 1500);
        db.save();
        await ctx.ok('Ticket opening message updated.');
      },
    },
    {
      name: 'ticketconfig',
      aliases: ['ticketsettings'],
      description: 'Show the ticket system settings',
      guildOnly: true,
      async execute(ctx) {
        const cfg = T.section(ctx.guild.id);
        await ctx.info(
          [
            `**Support role:** ${cfg.supportRoleId ? `<@&${cfg.supportRoleId}>` : 'none'}`,
            `**Transcript channel:** ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'none'}`,
            `**Category:** ${cfg.categoryId ? `<#${cfg.categoryId}>` : 'auto'}`,
            `**Open tickets per member:** ${cfg.limit}`,
            `**Tickets created:** ${cfg.counter}`,
            `**Opening message:** ${truncate(cfg.openMessage, 300)}`,
          ].join('\n'),
          '🎫 Ticket settings',
        );
      },
    },
    {
      name: 'ticket',
      aliases: ['newticket', 'openticket'],
      description: 'Open a private support ticket',
      usage: '[reason]',
      examples: ['I need help with my order'],
      guildOnly: true,
      cooldown: 30,
      slash: true,
      args: [{ name: 'reason', type: 'string', description: 'What do you need help with?', required: false, rest: true }],
      async execute(ctx) {
        await ctx.defer(true);
        try {
          const channel = await T.openTicket(ctx.client, ctx.guild, ctx.member, truncate(ctx.rest(0), 1000));
          await ctx.ok(`Your ticket is ready: ${channel}`);
        } catch (e) {
          if (e.userMessage) return ctx.fail(e.userMessage);
          throw e;
        }
      },
    },
    {
      name: 'close',
      aliases: ['closeticket', 'tclose'],
      description: 'Close this ticket (saves a transcript)',
      usage: '[reason]',
      examples: ['Resolved'],
      guildOnly: true,
      slash: true,
      args: [{ name: 'reason', type: 'string', description: 'Why it is being closed', required: false, rest: true }],
      async execute(ctx) {
        const { error } = inTicket(ctx, { ownerAllowed: true });
        if (error) return ctx.fail(error);
        await ctx.defer();
        await T.closeTicket(ctx.client, ctx.channel, ctx.author, ctx.rest(0));
        if (ctx.isSlash) await ctx.reply({ content: '🔒 Closing…' }).catch(() => {});
      },
    },
    {
      name: 'tadd',
      aliases: ['ticketadd'],
      description: 'Add a member to this ticket',
      usage: '<@user>',
      examples: ['@tester'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const { t, error } = inTicket(ctx);
        if (error) return ctx.fail(error);
        const member = await ctx.resolveMember(ctx.rest(0));
        if (!member) return ctx.fail('Member not found.');
        await ctx.channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
        if (!t.added.includes(member.id)) t.added.push(member.id);
        db.save();
        await ctx.ok(`${member} was added to the ticket.`);
      },
    },
    {
      name: 'tremove',
      aliases: ['ticketremove'],
      description: 'Remove a member from this ticket',
      usage: '<@user>',
      examples: ['@tester'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const { t, error } = inTicket(ctx);
        if (error) return ctx.fail(error);
        const member = await ctx.resolveMember(ctx.rest(0));
        if (!member) return ctx.fail('Member not found.');
        if (member.id === t.ownerId) return ctx.fail('You can\'t remove the ticket owner — close the ticket instead.');
        await ctx.channel.permissionOverwrites.delete(member.id);
        t.added = t.added.filter((id) => id !== member.id);
        db.save();
        await ctx.ok(`${member} was removed from the ticket.`);
      },
    },
    {
      name: 'trename',
      aliases: ['ticketrename'],
      description: 'Rename this ticket channel',
      usage: '<new name>',
      examples: ['billing-issue'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const { error } = inTicket(ctx);
        if (error) return ctx.fail(error);
        const name = ctx.rest(0).toLowerCase().replace(/[^a-z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 90);
        if (!name) return ctx.usage();
        try {
          await ctx.channel.setName(name);
        } catch {
          return ctx.fail('Discord only allows renaming a channel twice every 10 minutes. Try again later.');
        }
        await ctx.ok(`Ticket renamed to **${name}**.`);
      },
    },
    {
      name: 'claim',
      aliases: ['tclaim'],
      description: 'Claim this ticket as the staff member handling it',
      guildOnly: true,
      async execute(ctx) {
        const { t, error } = inTicket(ctx);
        if (error) return ctx.fail(error);
        if (t.claimedBy) return ctx.fail(`Already claimed by <@${t.claimedBy}>.`);
        t.claimedBy = ctx.author.id;
        db.save();
        await ctx.ok(`🙋 ${ctx.author} will handle this ticket.`);
      },
    },
    {
      name: 'unclaim',
      aliases: ['tunclaim'],
      description: 'Release your claim on this ticket',
      guildOnly: true,
      async execute(ctx) {
        const { t, error } = inTicket(ctx);
        if (error) return ctx.fail(error);
        if (!t.claimedBy) return ctx.fail('This ticket is not claimed.');
        if (t.claimedBy !== ctx.author.id && !ctx.member.permissions.has('ManageChannels')) return ctx.fail('Only the claimer or a manager can unclaim it.');
        t.claimedBy = null;
        db.save();
        await ctx.ok('Ticket unclaimed.');
      },
    },
    {
      name: 'tickets',
      aliases: ['ticketlist', 'opentickets'],
      description: 'List open tickets in this server',
      guildOnly: true,
      async execute(ctx) {
        const cfg = T.section(ctx.guild.id);
        if (!T.isStaff(ctx.member, cfg)) return ctx.fail('Only support staff can list tickets.');
        const open = db
          .entries(T.COL)
          .map(([, t]) => t)
          .filter((t) => t.guildId === ctx.guild.id && ctx.guild.channels.cache.has(t.channelId))
          .sort((a, b) => a.number - b.number);
        if (!open.length) return ctx.info('No open tickets. 🎉');
        const lines = open.map((t) => `<#${t.channelId}> • #${t.number} • <@${t.ownerId}> • ${discordTimestamp(t.createdAt)}${t.claimedBy ? ` • claimed by <@${t.claimedBy}>` : ''}`);
        await ctx.reply({ embeds: [ctx.embed({ title: `🎫 Open tickets (${open.length})`, description: lines.join('\n').slice(0, 4000) })], allowedMentions: { parse: [] } });
      },
    },
    {
      name: 'transcript',
      description: 'Get a text transcript of this ticket',
      guildOnly: true,
      botPerms: ['AttachFiles', 'ReadMessageHistory'],
      async execute(ctx) {
        const { error } = inTicket(ctx, { ownerAllowed: true });
        if (error) return ctx.fail(error);
        await ctx.defer();
        const file = await T.buildTranscript(ctx.channel);
        await ctx.reply({ content: '📄 Transcript so far:', files: [file] });
      },
    },
  ],
  components: {
    async tk(interaction, parts, client) {
      const guild = interaction.guild;
      if (!guild) return;
      const action = parts[0];
      const cfg = T.section(guild.id);
      const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);

      if (action === 'open') return interaction.showModal(T.reasonModal());

      if (action === 'openm' && interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: EPHEMERAL });
        try {
          const channel = await T.openTicket(client, guild, member, interaction.fields.getTextInputValue('reason'));
          return interaction.editReply({ content: `🎫 Your ticket is ready: ${channel}` });
        } catch (e) {
          return interaction.editReply({ content: `❌ ${e.userMessage || 'Could not open a ticket.'}` });
        }
      }

      const t = T.ticketOf(interaction.channelId);
      if (!t) return interaction.reply({ content: 'This ticket no longer exists.', flags: EPHEMERAL });
      const staff = T.isStaff(member, cfg);

      if (action === 'close') {
        if (!staff && t.ownerId !== interaction.user.id) return interaction.reply({ content: 'Only staff or the ticket owner can close it.', flags: EPHEMERAL });
        return interaction.reply({
          embeds: [embed({ color: 0xfee75c, description: 'Are you sure you want to close this ticket?' })],
          components: [row(button('tk:closeyes', 'Close ticket', 'Danger', '🔒'))],
          flags: EPHEMERAL,
        });
      }
      if (action === 'closeyes') {
        if (!staff && t.ownerId !== interaction.user.id) return interaction.reply({ content: 'Only staff or the ticket owner can close it.', flags: EPHEMERAL });
        await interaction.update({ components: [], embeds: [embed({ description: '🔒 Closing…' })] }).catch(() => {});
        return T.closeTicket(client, interaction.channel, interaction.user, null);
      }
      if (action === 'claim') {
        if (!staff) return interaction.reply({ content: 'Only support staff can claim tickets.', flags: EPHEMERAL });
        if (t.claimedBy) return interaction.reply({ content: `Already claimed by <@${t.claimedBy}>.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
        t.claimedBy = interaction.user.id;
        db.save();
        return interaction.reply({ embeds: [embed({ color: 0x57f287, description: `🙋 <@${interaction.user.id}> will handle this ticket.` })] });
      }
    },
  },
  events: {
    async channelDelete(client, channel) {
      if (db.has(T.COL, channel.id)) db.delete(T.COL, channel.id);
    },
  },
};
