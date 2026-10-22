'use strict';
const db = require('../../core/db');
const { confirm } = require('../../core/ui');
const { peek, claim, owns, roleProblem, checkRoleForConfig } = require('./_lib');

const DEFAULTS = { humans: [], bots: [], botId: null };
const MAX = 10;
const section = (ctx) => db.section(ctx.guild.id, 'autorole', DEFAULTS);

async function applyAutoroles(client, member) {
  const cfg = peek(member.guild.id, 'autorole');
  if (!cfg || !owns(cfg, client)) return;
  const ids = (member.user.bot ? cfg.bots : cfg.humans) || [];
  const roles = ids.map((id) => member.guild.roles.cache.get(id)).filter((r) => r && !roleProblem(member.guild, r) && !member.roles.cache.has(r.id));
  if (roles.length) await member.roles.add(roles, 'Autorole').catch(() => {});
}

function addCommand(name, list, label, aliases = []) {
  return {
    name,
    aliases,
    description: `Give a role automatically to every new ${label}`,
    usage: '<@role>',
    examples: ['@Member'],
    guildOnly: true,
    userPerms: ['ManageRoles'],
    botPerms: ['ManageRoles'],
    minArgs: 1,
    async execute(ctx) {
      const role = ctx.resolveRole(ctx.rest(0));
      const problem = checkRoleForConfig(ctx, role);
      if (problem) return ctx.fail(problem);
      const cfg = section(ctx);
      if (cfg[list].includes(role.id)) return ctx.fail(`${role} is already an autorole for ${label}s.`);
      if (cfg[list].length >= MAX) return ctx.fail(`You can have at most ${MAX} autoroles for ${label}s.`);
      cfg[list].push(role.id);
      claim(cfg, ctx.client);
      await ctx.ok(`New ${label}s will now get ${role}.`);
    },
  };
}

module.exports = {
  commands: [
    {
      name: 'autorole',
      aliases: ['autoroles'],
      description: 'List the roles given automatically to new members and bots',
      guildOnly: true,
      async execute(ctx) {
        const cfg = section(ctx);
        const fmt = (ids) => (ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '*none*');
        await ctx.info(
          `**Members:** ${fmt(cfg.humans)}\n**Bots:** ${fmt(cfg.bots)}\n\nAdd with \`${ctx.prefix}autoroleadd @role\` / \`${ctx.prefix}autorolebot @role\`.`,
          '🎭 Autoroles',
        );
      },
    },
    addCommand('autoroleadd', 'humans', 'member', ['addautorole']),
    addCommand('autorolebot', 'bots', 'bot', ['botautorole']),
    {
      name: 'autoroleremove',
      aliases: ['removeautorole', 'delautorole'],
      description: 'Stop giving a role automatically',
      usage: '<@role>',
      examples: ['@Member'],
      guildOnly: true,
      userPerms: ['ManageRoles'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        const role = ctx.resolveRole(ctx.rest(0));
        const id = role?.id || ctx.args[0].replace(/\D/g, '');
        const before = cfg.humans.length + cfg.bots.length;
        cfg.humans = cfg.humans.filter((r) => r !== id);
        cfg.bots = cfg.bots.filter((r) => r !== id);
        if (cfg.humans.length + cfg.bots.length === before) return ctx.fail('That role is not an autorole.');
        db.save();
        await ctx.ok(`Removed ${role || `<@&${id}>`} from the autoroles.`);
      },
    },
    {
      name: 'autoroleclear',
      description: 'Remove every autorole',
      guildOnly: true,
      userPerms: ['ManageRoles'],
      async execute(ctx) {
        if (!(await confirm(ctx, 'Remove **all** autoroles for members and bots?'))) return;
        const cfg = section(ctx);
        cfg.humans = [];
        cfg.bots = [];
        db.save();
        await ctx.send({ embeds: [ctx.embeds.success('All autoroles cleared.')] });
      },
    },
  ],
  events: {
    async guildMemberAdd(client, member) {
      // Members who still have to accept the rules screen get their roles once they pass it.
      if (member.pending) return;
      await applyAutoroles(client, member);
    },
    async guildMemberUpdate(client, oldMember, newMember) {
      if (oldMember.pending && !newMember.pending) await applyAutoroles(client, newMember);
    },
  },
};
