'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { chunk, truncate } = require('../../core/utils');
const { messageIdFrom, fetchMsg, parseEmoji, roleProblem, checkRoleForConfig, postableChannel } = require('./_lib');

/**
 * Collection "rolepanels": `${guildId}:${messageId}` ->
 *   { guildId, channelId, messageId, type: 'button'|'select', title, roles: [{ roleId, label, emoji }], botId }
 * Buttons use customId "br:t:<roleId>"; the select menu uses "br:s".
 */
const COL = 'rolepanels';
const MAX_ROLES = 25;
const keyOf = (g, m) => `${g}:${m}`;
const EPHEMERAL = MessageFlags.Ephemeral;

function panelView(panel, color) {
  const lines = panel.roles.map((r) => `${r.emoji ? `${r.emoji} ` : '• '}<@&${r.roleId}>${r.label ? ` — ${r.label}` : ''}`);
  const help = panel.type === 'select' ? 'Pick your roles from the menu below. Deselect to remove them.' : 'Click a button to get the role — click again to remove it.';
  const e = embed({ color, title: panel.title, description: `${help}\n\n${lines.join('\n') || '*No roles yet.*'}` });
  const components = [];
  if (panel.roles.length && panel.type === 'select') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('br:s')
      .setPlaceholder('Choose your roles')
      .setMinValues(0)
      .setMaxValues(panel.roles.length)
      .addOptions(
        panel.roles.map((r) => {
          const o = new StringSelectMenuOptionBuilder().setLabel(truncate(r.label || r.name || 'Role', 100)).setValue(r.roleId);
          if (r.emoji) o.setEmoji(r.emoji);
          return o;
        }),
      );
    components.push(new ActionRowBuilder().addComponents(menu));
  } else if (panel.roles.length) {
    for (const group of chunk(panel.roles, 5)) {
      components.push(
        new ActionRowBuilder().addComponents(
          group.map((r) => {
            const b = new ButtonBuilder().setCustomId(`br:t:${r.roleId}`).setStyle(ButtonStyle.Secondary).setLabel(truncate(r.label || r.name || 'Role', 80));
            if (r.emoji) b.setEmoji(r.emoji);
            return b;
          }),
        ),
      );
    }
  }
  return { embeds: [e], components };
}

async function refresh(ctx, panel) {
  const ch = ctx.guild.channels.cache.get(panel.channelId);
  const msg = await fetchMsg(ch, panel.messageId);
  if (!msg) throw Object.assign(new Error('panel gone'), { userMessage: 'I could not find the panel message anymore — create a new panel.' });
  await msg.edit(panelView(panel, ctx.color));
}

function findPanel(ctx, ref) {
  const id = messageIdFrom(ref);
  return id ? db.get(COL, keyOf(ctx.guild.id, id), null) : null;
}

function createCommand(name, type, aliases) {
  return {
    name,
    aliases,
    description: type === 'select' ? 'Create a dropdown role-picker panel in this channel' : 'Create a button role-picker panel in this channel',
    usage: '[title]',
    examples: ['Pick your roles'],
    guildOnly: true,
    userPerms: ['ManageRoles'],
    botPerms: ['ManageRoles', 'SendMessages', 'EmbedLinks'],
    async execute(ctx) {
      const { error } = postableChannel(ctx, ctx.channel.id);
      if (error) return ctx.fail(error);
      const panel = { guildId: ctx.guild.id, channelId: ctx.channel.id, messageId: null, type, title: truncate(ctx.rest(0) || '🎭 Choose your roles', 200), roles: [], botId: ctx.client.user.id };
      const msg = await ctx.channel.send(panelView(panel, ctx.color));
      panel.messageId = msg.id;
      db.set(COL, keyOf(ctx.guild.id, msg.id), panel);
      if (ctx.message) await ctx.message.delete().catch(() => {});
      await ctx.reply({
        embeds: [ctx.embeds.success(`Panel created (ID \`${msg.id}\`). Add roles with \`${ctx.prefix}rolepaneladd ${msg.id} @role [emoji] [label]\`.`)],
        ephemeral: true,
      });
    },
  };
}

module.exports = {
  commands: [
    createCommand('rolepanel', 'button', ['buttonroles', 'brpanel']),
    createCommand('selectpanel', 'select', ['dropdownroles', 'selectroles']),
    {
      name: 'rolepaneladd',
      aliases: ['panelroleadd'],
      description: 'Add a role to a role panel (button or dropdown)',
      usage: '<panel ID or link> <@role> [emoji] [label]',
      examples: ['123456789012345678 @Gamer 🎮 Gaming pings'],
      guildOnly: true,
      userPerms: ['ManageRoles'],
      botPerms: ['ManageRoles'],
      minArgs: 2,
      async execute(ctx) {
        const panel = findPanel(ctx, ctx.args[0]);
        if (!panel) return ctx.fail('Panel not found. Use the panel ID I gave you when creating it.');
        const role = ctx.resolveRole(ctx.args[1]);
        const problem = checkRoleForConfig(ctx, role);
        if (problem) return ctx.fail(problem);
        if (panel.roles.some((r) => r.roleId === role.id)) return ctx.fail(`${role} is already on this panel.`);
        if (panel.roles.length >= MAX_ROLES) return ctx.fail(`A panel can hold at most ${MAX_ROLES} roles.`);
        let emoji = null;
        let labelStart = 2;
        const maybe = parseEmoji(ctx.args[2]);
        if (maybe) {
          emoji = maybe.display;
          labelStart = 3;
        }
        const label = truncate(ctx.rest(labelStart) || role.name, 80);
        panel.roles.push({ roleId: role.id, label, name: role.name, emoji });
        try {
          await refresh(ctx, panel);
        } catch (err) {
          panel.roles.pop();
          if (err.userMessage) throw err;
          return ctx.fail('Discord rejected the panel update (is the emoji valid and from a server I am in?).');
        }
        db.save();
        await ctx.ok(`Added ${role} to the panel.`);
      },
    },
    {
      name: 'rolepanelremove',
      aliases: ['panelroleremove'],
      description: 'Remove a role from a role panel',
      usage: '<panel ID or link> <@role>',
      examples: ['123456789012345678 @Gamer'],
      guildOnly: true,
      userPerms: ['ManageRoles'],
      minArgs: 2,
      async execute(ctx) {
        const panel = findPanel(ctx, ctx.args[0]);
        if (!panel) return ctx.fail('Panel not found.');
        const role = ctx.resolveRole(ctx.args[1]);
        const id = role?.id || ctx.args[1].replace(/\D/g, '');
        const before = panel.roles.length;
        panel.roles = panel.roles.filter((r) => r.roleId !== id);
        if (panel.roles.length === before) return ctx.fail('That role is not on this panel.');
        db.save();
        await refresh(ctx, panel);
        await ctx.ok('Role removed from the panel.');
      },
    },
    {
      name: 'rolepaneldelete',
      aliases: ['delrolepanel'],
      description: 'Delete a role panel and its message',
      usage: '<panel ID or link>',
      examples: ['123456789012345678'],
      guildOnly: true,
      userPerms: ['ManageRoles'],
      minArgs: 1,
      async execute(ctx) {
        const panel = findPanel(ctx, ctx.args[0]);
        if (!panel) return ctx.fail('Panel not found.');
        db.delete(COL, keyOf(ctx.guild.id, panel.messageId));
        const ch = ctx.guild.channels.cache.get(panel.channelId);
        const msg = await fetchMsg(ch, panel.messageId);
        await msg?.delete().catch(() => {});
        await ctx.ok('Panel deleted.');
      },
    },
    {
      name: 'rolepanels',
      description: 'List the role panels in this server',
      guildOnly: true,
      userPerms: ['ManageRoles'],
      async execute(ctx) {
        const panels = db.entries(COL).filter(([k]) => k.startsWith(`${ctx.guild.id}:`)).map(([, v]) => v);
        if (!panels.length) return ctx.info(`No role panels yet. Create one with \`${ctx.prefix}rolepanel\` or \`${ctx.prefix}selectpanel\`.`);
        const lines = panels.map(
          (p) => `\`${p.messageId}\` • ${p.type} • [${truncate(p.title, 40)}](https://discord.com/channels/${p.guildId}/${p.channelId}/${p.messageId}) • ${p.roles.length} role(s)`,
        );
        await ctx.info(lines.join('\n').slice(0, 4000), '🎭 Role panels');
      },
    },
  ],
  components: {
    async br(interaction, parts) {
      const guild = interaction.guild;
      if (!guild) return;
      const panel = db.get(COL, keyOf(guild.id, interaction.message.id), null);
      if (!panel) return interaction.reply({ content: 'This panel is no longer active.', flags: EPHEMERAL });
      const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) return;

      if (parts[0] === 't') {
        const roleId = parts[1];
        if (!panel.roles.some((r) => r.roleId === roleId)) return interaction.reply({ content: 'That role was removed from this panel.', flags: EPHEMERAL });
        const role = guild.roles.cache.get(roleId);
        const problem = roleProblem(guild, role);
        if (problem) return interaction.reply({ content: `❌ ${problem}`, flags: EPHEMERAL });
        const has = member.roles.cache.has(roleId);
        try {
          if (has) await member.roles.remove(role, 'Role panel');
          else await member.roles.add(role, 'Role panel');
        } catch {
          return interaction.reply({ content: '❌ I could not change your roles (check my permissions).', flags: EPHEMERAL });
        }
        return interaction.reply({ content: has ? `➖ Removed ${role}.` : `➕ Gave you ${role}.`, flags: EPHEMERAL, allowedMentions: { parse: [] } });
      }

      if (parts[0] === 's' && interaction.isStringSelectMenu()) {
        const chosen = new Set(interaction.values);
        const add = [];
        const remove = [];
        for (const r of panel.roles) {
          const role = guild.roles.cache.get(r.roleId);
          if (!role || roleProblem(guild, role)) continue;
          const has = member.roles.cache.has(role.id);
          if (chosen.has(role.id) && !has) add.push(role);
          if (!chosen.has(role.id) && has) remove.push(role);
        }
        try {
          if (add.length) await member.roles.add(add, 'Role panel');
          if (remove.length) await member.roles.remove(remove, 'Role panel');
        } catch {
          return interaction.reply({ content: '❌ I could not change your roles (check my permissions).', flags: EPHEMERAL });
        }
        const summary = [add.length ? `➕ ${add.join(', ')}` : null, remove.length ? `➖ ${remove.join(', ')}` : null].filter(Boolean).join('\n') || 'No changes.';
        return interaction.reply({ content: summary, flags: EPHEMERAL, allowedMentions: { parse: [] } });
      }
    },
  },
  events: {
    async messageDelete(client, message) {
      if (message.guildId && db.has(COL, keyOf(message.guildId, message.id))) db.delete(COL, keyOf(message.guildId, message.id));
    },
  },
};
