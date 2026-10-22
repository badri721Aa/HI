'use strict';
const { colors } = require('../../core/embeds');
const { parseDuration, formatDuration } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const lib = require('./_lib');

const running = new Set(); // guild ids with a mass-role job in progress
const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

function parseHex(s) {
  const m = String(s || '').match(HEX_RE);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return parseInt(h, 16);
}

/** "<user> <role…>" → { member, role } */
async function memberAndRole(ctx) {
  const member = await lib.getMember(ctx, ctx.args[0]);
  const role = ctx.resolveRole(ctx.rest(1));
  return { member, role };
}

/** Add/remove a role for every member matching `filter`, with confirm + progress. */
async function massRole(ctx, { add, filter, who }) {
  if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
  const role = ctx.resolveRole(ctx.rest(0));
  const err = lib.roleError(ctx, role);
  if (err) return ctx.fail(err);
  if (running.has(ctx.guild.id)) return ctx.fail('A mass role update is already running in this server. Please wait for it to finish.');
  await ctx.defer();
  const members = await ctx.guild.members.fetch().catch(() => ctx.guild.members.cache);
  const targets = [...members.values()].filter((m) => filter(m) && (add ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)));
  if (!targets.length) return ctx.info(`Nothing to do — every ${who} already ${add ? 'has' : 'lacks'} ${role}.`);
  if (!(await confirm(ctx, `${add ? 'Give' : 'Remove'} ${role} ${add ? 'to' : 'from'} **${targets.length}** ${who}? This may take a while.`, { danger: !add }))) return;

  running.add(ctx.guild.id);
  const status = await ctx.send({ embeds: [ctx.embed({ description: `⏳ 0/${targets.length}…` })] });
  let ok = 0;
  let failed = 0;
  try {
    for (const [i, m] of targets.entries()) {
      try {
        if (add) await m.roles.add(role, `Mass role by ${ctx.author.tag}`);
        else await m.roles.remove(role, `Mass role by ${ctx.author.tag}`);
        ok++;
      } catch {
        failed++;
      }
      if ((i + 1) % 25 === 0) await status.edit({ embeds: [ctx.embed({ description: `⏳ ${i + 1}/${targets.length}…` })] }).catch(() => {});
    }
  } finally {
    running.delete(ctx.guild.id);
  }
  await status.edit({ embeds: [ctx.embed({ color: colors.success, description: `✅ ${add ? 'Gave' : 'Removed'} ${role} ${add ? 'to' : 'from'} **${ok}** ${who}${failed ? ` (${failed} failed)` : ''}.` })] }).catch(() => {});
  await lib.postModlog(ctx.guild, lib.actionEmbed('👥 Mass role update', `${ctx.author} ${add ? 'gave' : 'removed'} <@&${role.id}> ${add ? 'to' : 'from'} ${ok} ${who}.`));
}

const commands = [
  {
    name: 'addrole',
    modPerm: 'ManageRoles',
    aliases: ['giverole'],
    description: 'Give a role to a member',
    usage: '<user> <role>',
    examples: ['tester Member', 'tester @Verified'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 2,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member', required: true },
      { name: 'role', type: 'role', description: 'Role to give', required: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const { member, role } = await memberAndRole(ctx);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      if (member.roles.cache.has(role.id)) return ctx.fail(`**${member.user.tag}** already has ${role}.`);
      await member.roles.add(role, `${ctx.author.tag}: addrole`);
      await ctx.ok(`Gave ${role} to **${member.user.tag}**.`);
    },
  },
  {
    name: 'removerole',
    modPerm: 'ManageRoles',
    aliases: ['takerole'],
    description: 'Remove a role from a member',
    usage: '<user> <role>',
    examples: ['tester Member'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 2,
    slash: true,
    args: [
      { name: 'user', type: 'user', description: 'Member', required: true },
      { name: 'role', type: 'role', description: 'Role to remove', required: true },
    ],
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const { member, role } = await memberAndRole(ctx);
      if (!member) return ctx.fail('Member not found.');
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      if (!member.roles.cache.has(role.id)) return ctx.fail(`**${member.user.tag}** doesn't have ${role}.`);
      await member.roles.remove(role, `${ctx.author.tag}: removerole`);
      await ctx.ok(`Removed ${role} from **${member.user.tag}**.`);
    },
  },
  {
    name: 'temprole',
    modPerm: 'ManageRoles',
    aliases: ['trole'],
    description: 'Give a role for a limited time — removed automatically',
    usage: '<user> <duration> <role>',
    examples: ['tester 1d VIP', 'tester 2h @Event'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 3,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const member = await lib.getMember(ctx, ctx.args[0]);
      if (!member) return ctx.fail('Member not found.');
      const duration = parseDuration(ctx.args[1]);
      if (!duration) return ctx.usage('Give a valid duration like `1d` or `2h`.');
      if (duration > 365 * 86400000) return ctx.fail('Temporary roles can last at most 365 days.');
      const role = ctx.resolveRole(ctx.rest(2));
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      if (!member.roles.cache.has(role.id)) await member.roles.add(role, `${ctx.author.tag}: temprole ${formatDuration(duration)}`);
      lib.addTimer(ctx.client, ctx.guild.id, 'unrole', member.id, Date.now() + duration, { roleId: role.id });
      await ctx.ok(`Gave ${role} to **${member.user.tag}** for **${formatDuration(duration)}**.`);
    },
  },
  {
    name: 'roleall',
    modPerm: 'ManageRoles',
    aliases: ['massrole', 'giveall'],
    description: 'Give a role to every member (confirmation required)',
    usage: '<role>',
    examples: ['Member'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    cooldown: 60,
    minArgs: 1,
    execute: (ctx) => massRole(ctx, { add: true, filter: () => true, who: 'members' }),
  },
  {
    name: 'rolehumans',
    modPerm: 'ManageRoles',
    aliases: ['rolehuman'],
    description: 'Give a role to every human (non-bot) member',
    usage: '<role>',
    examples: ['Member'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    cooldown: 60,
    minArgs: 1,
    execute: (ctx) => massRole(ctx, { add: true, filter: (m) => !m.user.bot, who: 'humans' }),
  },
  {
    name: 'rolebots',
    modPerm: 'ManageRoles',
    aliases: ['rolebot'],
    description: 'Give a role to every bot in the server',
    usage: '<role>',
    examples: ['Bots'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    cooldown: 60,
    minArgs: 1,
    execute: (ctx) => massRole(ctx, { add: true, filter: (m) => m.user.bot, who: 'bots' }),
  },
  {
    name: 'removeroleall',
    modPerm: 'ManageRoles',
    aliases: ['takeall', 'unroleall'],
    description: 'Remove a role from everyone who has it (confirmation required)',
    usage: '<role>',
    examples: ['Event'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    cooldown: 60,
    minArgs: 1,
    execute: (ctx) => massRole(ctx, { add: false, filter: () => true, who: 'members' }),
  },
  {
    name: 'createrole',
    modPerm: 'ManageRoles',
    aliases: ['newrole', 'mkrole'],
    description: 'Create a role, optionally with a hex color',
    usage: '<name> [#hexcolor]',
    examples: ['Gamers #ff5500', 'Helpers'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      let name = ctx.rest(0);
      let color = null;
      const last = ctx.args[ctx.args.length - 1];
      if (ctx.args.length > 1 && HEX_RE.test(last)) {
        color = parseHex(last);
        name = ctx.args.slice(0, -1).join(' ');
      }
      if (!name || name.length > 100) return ctx.usage('Role names must be 1-100 characters.');
      const role = await lib.api(() => ctx.guild.roles.create({ name, ...(color !== null ? { colors: { primaryColor: color } } : {}), reason: `${ctx.author.tag}: createrole` }), 'create the role');
      await ctx.ok(`Created ${role}.`);
    },
  },
  {
    name: 'deleterole',
    modPerm: 'ManageRoles',
    aliases: ['delrole'],
    description: 'Delete a role (confirmation required)',
    usage: '<role>',
    examples: ['Old Role'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 1,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const role = ctx.resolveRole(ctx.rest(0));
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      if (!(await confirm(ctx, `Delete the role **${role.name}** (${role.members?.size ?? '?'} members have it)?`))) return;
      const name = role.name;
      await role.delete(`${ctx.author.tag}: deleterole`);
      await ctx.send({ embeds: [ctx.embed({ description: `🗑️ Deleted role **${name}**.` })] });
    },
  },
  {
    name: 'rolecolor',
    modPerm: 'ManageRoles',
    aliases: ['rolecolour', 'setrolecolor'],
    description: 'Change a role\'s color',
    usage: '<role> <#hexcolor>',
    examples: ['Gamers #00ff88'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 2,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const color = parseHex(ctx.args[ctx.args.length - 1]);
      if (color === null) return ctx.usage('Give a hex color like `#ff5500`.');
      const role = ctx.resolveRole(ctx.args.slice(0, -1).join(' '));
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      await role.setColors({ primaryColor: color }, `${ctx.author.tag}: rolecolor`);
      await ctx.ok(`Changed ${role}'s color to **#${color.toString(16).padStart(6, '0')}**.`);
    },
  },
  {
    name: 'renamerole',
    modPerm: 'ManageRoles',
    aliases: ['rolename'],
    description: 'Rename a role (quote or mention the old name if it has spaces)',
    usage: '<role> <new name>',
    examples: ['"Old Name" New Name', '@Helpers Support Team'],
    guildOnly: true,
    botPerms: ['ManageRoles'],
    minArgs: 2,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageRoles'))) return;
      const role = ctx.resolveRole(ctx.args[0]);
      const err = lib.roleError(ctx, role);
      if (err) return ctx.fail(err);
      const name = ctx.rest(1);
      if (!name || name.length > 100) return ctx.usage('Role names must be 1-100 characters.');
      const old = role.name;
      await role.setName(name, `${ctx.author.tag}: renamerole`);
      await ctx.ok(`Renamed **${old}** → ${role}.`);
    },
  },
];

module.exports = commands;
