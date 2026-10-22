'use strict';
const { AttachmentBuilder } = require('discord.js');
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { truncate, fetchText, parseToggle, formatDuration } = require('../../core/utils');
const { paginate, confirm } = require('../../core/ui');
const mod = require('../moderation/_lib');

const ch = (id) => (id ? `<#${id}>` : '*not set*');
const role = (id) => (id ? `<@&${id}>` : '*not set*');
const yes = (b) => (b ? '🟢 on' : '🔴 off');

/** Pretty pages for the sections this worker owns; everything else is shown as JSON. */
const PRETTY = {
  moderation: (s) => [
    `**Modlog channel:** ${ch(s.modlogChannel)}`,
    `**Report channel:** ${ch(s.reportChannel)}`,
    `**Moderator roles:** ${(s.modRoles || []).map(role).join(' ') || '*none*'}`,
    `**DM on punish:** ${yes(s.dmOnPunish)}`,
    `**Jail:** role ${role(s.jailRole)}, channel ${ch(s.jailChannel)}`,
    `**Warn escalation:** ${Object.entries(s.warnActions || {}).map(([n, a]) => `${n}→${a.action}${a.duration ? ` ${formatDuration(a.duration)}` : ''}`).join(', ') || '*none*'}`,
    `**Active lockdown:** ${(s.lockdownChannels || []).length ? `${s.lockdownChannels.length} channel(s)` : 'no'}`,
  ],
  logging: (s) => [
    `**Log channel:** ${ch(s.channel)}`,
    `**Events on:** ${Object.entries(s.events || {}).filter(([, v]) => v).map(([k]) => `\`${k}\``).join(' ') || '*none*'}`,
    `**Ignored channels:** ${(s.ignoredChannels || []).map(ch).join(' ') || '*none*'}`,
  ],
  automod: (s) => [
    `**AutoMod:** ${yes(s.enabled)} • action: **${s.action}**${s.action === 'timeout' ? ` (${formatDuration(s.timeoutMs)})` : ''}`,
    `**Filters:** ${['antilink', 'antiinvite', 'antispam', 'anticaps', 'antimention', 'antiemoji', 'antizalgo', 'antinewlines', 'antiduplicate', 'badwords']
      .map((k) => `${s[k]?.enabled ? '🟢' : '🔴'} ${k}`)
      .join(', ')}`,
    `**Bad words:** ${(s.badwords?.words || []).length}`,
    `**Exempt:** ${[...(s.exemptRoles || []).map(role), ...(s.exemptChannels || []).map(ch)].join(' ') || '*none*'}`,
  ],
  antiraid: (s) => [`**Anti-raid:** ${yes(s.enabled)} • ${s.joins} joins/${s.seconds}s → **${s.action}**`, `**Min account age:** ${s.minAccountAgeDays ? `${s.minAccountAgeDays} day(s)` : 'off'}`],
  antinuke: (s) => [
    `**Anti-nuke:** ${yes(s.enabled)} • ${s.threshold} actions/${s.seconds}s → **${s.punishment}**`,
    `**Whitelist:** ${(s.whitelist || []).map((id) => `<@${id}>`).join(' ') || '*none*'}`,
  ],
};

const sectionNames = (g) => Object.keys(g).filter((k) => !['prefixes', 'disabledCommands', 'disabledCategories'].includes(k));

const commands = [
  {
    name: 'settings',
    aliases: ['serversettings', 'guildsettings', 'showsettings'],
    description: 'Overview of every bot setting for this server',
    usage: '[section]',
    examples: ['', 'automod'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    slash: true,
    args: [{ name: 'section', type: 'string', description: 'Only show one section (e.g. automod, logging)' }],
    async execute(ctx) {
      const g = db.guild(ctx.guild.id);
      const general = ctx.embed({
        title: `⚙️ Settings — ${ctx.guild.name}`,
        description: [
          `**Prefix:** \`${ctx.prefix}\``,
          `**Disabled commands:** ${g.disabledCommands.map((c) => `\`${c}\``).join(' ') || '*none*'}`,
          `**Disabled categories:** ${g.disabledCategories.map((c) => `\`${c}\``).join(' ') || '*none*'}`,
          `**Configured sections:** ${sectionNames(g).map((s) => `\`${s}\``).join(' ') || '*none yet*'}`,
        ].join('\n'),
        footer: `Export: ${ctx.prefix}exportsettings • Reset: ${ctx.prefix}resetsettings [section]`,
      });
      const pageFor = (name) => {
        const s = g[name];
        const body = PRETTY[name] ? PRETTY[name](s).join('\n') : `\`\`\`json\n${truncate(JSON.stringify(s, null, 2), 3900)}\n\`\`\``;
        return ctx.embed({ title: `⚙️ ${name}`, description: body });
      };
      const wanted = ctx.args[0]?.toLowerCase();
      if (wanted) {
        const name = sectionNames(g).find((n) => n.toLowerCase() === wanted);
        if (!name) return ctx.fail(`No settings saved for \`${wanted}\`. Sections: ${sectionNames(g).map((s) => `\`${s}\``).join(', ') || 'none'}`);
        return ctx.reply({ embeds: [pageFor(name)] });
      }
      await paginate(ctx, [general, ...sectionNames(g).map(pageFor)]);
    },
  },
  {
    name: 'resetsettings',
    aliases: ['resetconfig', 'factoryreset'],
    description: 'Reset all of this server\'s bot settings (or one section) to defaults',
    usage: '[section]',
    examples: ['', 'automod'],
    guildOnly: true,
    userPerms: ['Administrator'],
    cooldown: 30,
    async execute(ctx) {
      const g = db.guild(ctx.guild.id);
      const wanted = ctx.args[0]?.toLowerCase();
      if (wanted) {
        const name = sectionNames(g).find((n) => n.toLowerCase() === wanted);
        if (!name) return ctx.fail(`No settings saved for \`${wanted}\`. Sections: ${sectionNames(g).map((s) => `\`${s}\``).join(', ') || 'none'}`);
        if (!(await confirm(ctx, `Reset the **${name}** settings to defaults?`))) return;
        delete g[name];
        db.save();
        return ctx.send({ embeds: [ctx.embed({ description: `♻️ Reset **${name}**.` })] });
      }
      if (!(await confirm(ctx, '⚠️ Reset **every** bot setting for this server (prefix, logging, automod, welcome, leveling config…)? Economy balances, levels and mod cases are kept.'))) return;
      db.delete('guilds', ctx.guild.id);
      await ctx.send({ embeds: [ctx.embed({ color: colors.warn, description: '♻️ All server settings were reset to defaults.' })] });
    },
  },
  {
    name: 'exportsettings',
    aliases: ['backupsettings', 'settingsexport'],
    description: 'Download this server\'s bot settings as a JSON file',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    cooldown: 15,
    async execute(ctx) {
      const json = JSON.stringify(db.guild(ctx.guild.id), null, 2);
      await ctx.reply({
        content: `📦 Settings for **${ctx.guild.name}** — restore them with \`${ctx.prefix}importsettings\` (attach this file).`,
        files: [new AttachmentBuilder(Buffer.from(json), { name: `settings-${ctx.guild.id}.json` })],
        ephemeral: true,
      });
    },
  },
  {
    name: 'importsettings',
    aliases: ['restoresettings', 'settingsimport'],
    description: 'Restore settings from a JSON file made by exportsettings (attach it)',
    usage: '(attach settings.json)',
    guildOnly: true,
    userPerms: ['Administrator'],
    cooldown: 30,
    async execute(ctx) {
      const file = ctx.attachments[0];
      if (!file) return ctx.usage('Attach the `.json` file from `exportsettings` (slash: `/cmd importsettings` with the file option).');
      if (file.size > 512 * 1024) return ctx.fail('That file is too big (max 512 KB).');
      let host = '';
      try {
        host = new URL(file.url).hostname;
      } catch {
        /* invalid */
      }
      if (!/(^|\.)discord(app)?\.(com|net)$/.test(host)) return ctx.fail('Attachments must come from Discord.');
      let data;
      try {
        data = JSON.parse(await fetchText(file.url));
      } catch (err) {
        if (err instanceof SyntaxError) return ctx.fail('That file is not valid JSON.');
        throw err;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return ctx.fail('That file does not look like exported settings.');
      if (!(await confirm(ctx, `Replace this server's settings with the file's **${sectionNames(data).length}** section(s)?`))) return;
      db.set('guilds', ctx.guild.id, data);
      db.guild(ctx.guild.id); // re-fill core defaults
      await ctx.send({ embeds: [ctx.embed({ color: colors.success, description: '✅ Settings imported.' })] });
    },
  },
  {
    name: 'modrole',
    aliases: ['modroles', 'moderatorrole'],
    description: 'Roles that can use moderation commands without Discord permissions',
    usage: '<add|remove|list> [role]',
    examples: ['list', 'add Moderators', 'remove @Helpers'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = mod.settings(ctx.guild.id);
      const sub = ctx.args[0].toLowerCase();
      if (sub === 'list') {
        return ctx.info(
          cfg.modRoles.map((r) => `• <@&${r}>`).join('\n') || 'No moderator roles. Members need Discord permissions (Ban Members, Kick Members…).',
          '🛡️ Moderator roles',
        );
      }
      if (!['add', 'remove'].includes(sub)) return ctx.usage();
      const r = ctx.resolveRole(ctx.rest(1));
      if (!r) return ctx.fail('Role not found.');
      const i = cfg.modRoles.indexOf(r.id);
      if (sub === 'add') {
        if (i !== -1) return ctx.info(`${r} is already a moderator role.`);
        cfg.modRoles.push(r.id);
      } else {
        if (i === -1) return ctx.fail(`${r} is not a moderator role.`);
        cfg.modRoles.splice(i, 1);
      }
      db.save();
      await ctx.ok(sub === 'add' ? `${r} can now use moderation commands (ban, kick, timeout, warn, purge, lock, roles, voice).` : `${r} is no longer a moderator role.`);
    },
  },
  {
    name: 'dmpunish',
    aliases: ['dmonpunish', 'punishdm'],
    description: 'DM members when they are warned, timed out, kicked or banned',
    usage: '<on|off>',
    examples: ['on', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      mod.settings(ctx.guild.id).dmOnPunish = state;
      db.save();
      await ctx.ok(`Punishment DMs are **${state ? 'on' : 'off'}**.`);
    },
  },
];

module.exports = commands;
