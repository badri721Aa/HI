'use strict';
const { MessageFlags } = require('discord.js');
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { button, row } = require('../../core/ui');
const { truncate } = require('../../core/utils');
const { claim, roleProblem, checkRoleForConfig, postableChannel, fetchMsg } = require('./_lib');

/** Guild section "verify": { roleId, removeRoleId, channelId, messageId, botId } — button customId "vf:go". */
const DEFAULTS = { roleId: null, removeRoleId: null, channelId: null, messageId: null, botId: null };
const section = (ctx) => db.section(ctx.guild.id, 'verify', DEFAULTS);
const EPHEMERAL = MessageFlags.Ephemeral;
const base = { guildOnly: true, userPerms: ['ManageGuild'] };

module.exports = {
  commands: [
    {
      ...base,
      name: 'verifysetup',
      aliases: ['verification'],
      description: 'Post a Verify button here that gives members a role',
      usage: '<@role> [panel message]',
      examples: ['@Verified Click the button to get access!'],
      botPerms: ['ManageRoles', 'SendMessages', 'EmbedLinks'],
      minArgs: 1,
      slash: true,
      args: [
        { name: 'role', type: 'role', description: 'Role to give when someone verifies', required: true },
        { name: 'message', type: 'string', description: 'Text shown on the panel', required: false, rest: true },
      ],
      async execute(ctx) {
        const role = ctx.resolveRole(ctx.args[0]);
        const problem = checkRoleForConfig(ctx, role);
        if (problem) return ctx.fail(problem);
        const { error } = postableChannel(ctx, ctx.channel.id);
        if (error) return ctx.fail(error);
        const text = truncate(ctx.rest(1) || `Welcome to **${ctx.guild.name}**! Click **Verify** below to get access to the rest of the server.`, 2000);
        const msg = await ctx.channel.send({
          embeds: [embed({ color: ctx.color, title: '✅ Verification', description: text, thumbnail: ctx.guild.iconURL?.() || undefined })],
          components: [row(button('vf:go', 'Verify', 'Success', '✅'))],
        });
        const cfg = section(ctx);
        Object.assign(cfg, { roleId: role.id, channelId: ctx.channel.id, messageId: msg.id });
        claim(cfg, ctx.client);
        if (ctx.message) await ctx.message.delete().catch(() => {});
        await ctx.reply({ embeds: [ctx.embeds.success(`Verification panel posted. Members who click it get ${role}.`)], ephemeral: true });
      },
    },
    {
      ...base,
      name: 'verifyremoverole',
      aliases: ['unverifiedrole'],
      description: 'Also remove a role (e.g. "Unverified") when someone verifies — or "off"',
      usage: '<@role|off>',
      examples: ['off'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        if (ctx.args[0].toLowerCase() === 'off') {
          cfg.removeRoleId = null;
          db.save();
          return ctx.ok('Verifying no longer removes a role.');
        }
        const role = ctx.resolveRole(ctx.rest(0));
        const problem = checkRoleForConfig(ctx, role, { safeOnly: false });
        if (problem) return ctx.fail(problem);
        cfg.removeRoleId = role.id;
        claim(cfg, ctx.client);
        await ctx.ok(`Verifying will now remove ${role}.`);
      },
    },
    {
      ...base,
      name: 'verifyinfo',
      description: 'Show the verification settings',
      async execute(ctx) {
        const cfg = section(ctx);
        await ctx.info(
          [
            `**Role given:** ${cfg.roleId ? `<@&${cfg.roleId}>` : 'not set'}`,
            `**Role removed:** ${cfg.removeRoleId ? `<@&${cfg.removeRoleId}>` : 'none'}`,
            `**Panel:** ${cfg.messageId ? `[jump](https://discord.com/channels/${ctx.guild.id}/${cfg.channelId}/${cfg.messageId})` : 'not posted'}`,
          ].join('\n'),
          '✅ Verification',
        );
      },
    },
    {
      ...base,
      name: 'verifyoff',
      description: 'Turn verification off and delete the panel',
      async execute(ctx) {
        const cfg = section(ctx);
        const ch = ctx.guild.channels.cache.get(cfg.channelId);
        const msg = await fetchMsg(ch, cfg.messageId);
        await msg?.delete().catch(() => {});
        Object.assign(cfg, { roleId: null, channelId: null, messageId: null });
        db.save();
        await ctx.ok('Verification turned off.');
      },
    },
  ],
  components: {
    async vf(interaction) {
      const guild = interaction.guild;
      if (!guild) return;
      const cfg = db.get('guilds', guild.id, null)?.verify;
      const role = cfg?.roleId && guild.roles.cache.get(cfg.roleId);
      if (!role) return interaction.reply({ content: 'Verification is not set up anymore. Ask a moderator.', flags: EPHEMERAL });
      const problem = roleProblem(guild, role);
      if (problem) return interaction.reply({ content: `❌ ${problem}`, flags: EPHEMERAL });
      const member = interaction.member?.roles?.cache ? interaction.member : await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) return;
      if (member.roles.cache.has(role.id)) return interaction.reply({ content: '✅ You are already verified.', flags: EPHEMERAL });
      try {
        await member.roles.add(role, 'Verification button');
        const remove = cfg.removeRoleId && guild.roles.cache.get(cfg.removeRoleId);
        if (remove && member.roles.cache.has(remove.id) && !roleProblem(guild, remove, { safeOnly: false })) await member.roles.remove(remove, 'Verification button');
      } catch {
        return interaction.reply({ content: '❌ I could not give you the role. Please tell a moderator.', flags: EPHEMERAL });
      }
      await interaction.reply({ content: `🎉 You're verified — welcome to **${guild.name}**!`, flags: EPHEMERAL });
    },
  },
};
