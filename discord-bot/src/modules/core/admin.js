'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('../../config');
const db = require('../../core/db');
const slash = require('../../core/slash');
const { applyPresence } = require('../../core/bot');
const { paginate, confirm } = require('../../core/ui');
const { chunk, formatNumber, truncate } = require('../../core/utils');
const { ALWAYS_ON } = require('../../core/handler');

const STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const ACTIVITY_TYPES = ['Playing', 'Listening', 'Watching', 'Competing', 'Streaming', 'Custom'];

function savePresence(client) {
  const { status, activity } = client.botProfile;
  db.set('meta', `presence:${client.user.id}`, { status, activity });
  applyPresence(client);
}

module.exports = [
  {
    name: 'prefix',
    description: 'Show the command prefix for this server',
    async execute(ctx) {
      await ctx.info(`My prefix here is \`${ctx.prefix}\`. You can also mention me or use slash commands (\`/help\`, \`/cmd\`).`);
    },
  },
  {
    name: 'setprefix',
    description: 'Change this bot\'s prefix in this server',
    usage: '<new prefix>',
    examples: ['?', '$$'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    slash: true,
    args: [{ name: 'prefix', type: 'string', description: 'New prefix (max 5 characters, no spaces)', required: true, maxLength: 5 }],
    async execute(ctx) {
      const p = ctx.args[0];
      if (p.length > 5 || /\s/.test(p)) return ctx.fail('A prefix must be 1–5 characters with no spaces.');
      ctx.config.prefixes[ctx.client.user.id] = p;
      db.save();
      await ctx.ok(`Prefix changed to \`${p}\`. Example: \`${p}help\``);
    },
  },
  {
    name: 'resetprefix',
    description: 'Reset this bot\'s prefix in this server to the default',
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      delete ctx.config.prefixes[ctx.client.user.id];
      db.save();
      await ctx.ok(`Prefix reset to \`${ctx.bot.prefix}\`.`);
    },
  },
  {
    name: 'disable',
    description: 'Disable a command or a whole category in this server',
    usage: '<command | category>',
    examples: ['slots', 'gambling'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const q = ctx.args[0].toLowerCase();
      const cfg = ctx.config;
      if (ctx.registry.categories.has(q)) {
        if (ALWAYS_ON.has(q)) return ctx.fail('The core category cannot be disabled.');
        if (!cfg.disabledCategories.includes(q)) cfg.disabledCategories.push(q);
        db.save();
        return ctx.ok(`Disabled the **${q}** category (${ctx.registry.categories.get(q).length} commands).`);
      }
      const cmd = ctx.registry.get(q);
      if (!cmd) return ctx.fail(`No command or category called \`${q}\`.`);
      if (ALWAYS_ON.has(cmd.category)) return ctx.fail('Core commands cannot be disabled.');
      if (!cfg.disabledCommands.includes(cmd.name)) cfg.disabledCommands.push(cmd.name);
      db.save();
      return ctx.ok(`Disabled \`${cmd.name}\`.`);
    },
  },
  {
    name: 'enable',
    description: 'Re-enable a disabled command or category in this server',
    usage: '<command | category>',
    examples: ['slots', 'gambling'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const q = ctx.args[0].toLowerCase();
      const cfg = ctx.config;
      if (cfg.disabledCategories.includes(q)) {
        cfg.disabledCategories = cfg.disabledCategories.filter((c) => c !== q);
        db.save();
        return ctx.ok(`Enabled the **${q}** category.`);
      }
      const cmd = ctx.registry.get(q);
      const name = cmd?.name || q;
      if (!cfg.disabledCommands.includes(name)) return ctx.fail(`\`${q}\` is not disabled.`);
      cfg.disabledCommands = cfg.disabledCommands.filter((c) => c !== name);
      db.save();
      return ctx.ok(`Enabled \`${name}\`.`);
    },
  },
  {
    name: 'disabled',
    description: 'List commands and categories disabled in this server',
    guildOnly: true,
    async execute(ctx) {
      const { disabledCommands: cmds, disabledCategories: cats } = ctx.config;
      if (!cmds.length && !cats.length) return ctx.info('Nothing is disabled in this server.');
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: '🚫 Disabled here',
            fields: [
              { name: 'Categories', value: cats.map((c) => `\`${c}\``).join(', ') || null },
              { name: 'Commands', value: truncate(cmds.map((c) => `\`${c}\``).join(', '), 1024) || null },
            ],
          }),
        ],
      });
    },
  },

  // ---------------- owner only ----------------
  {
    name: 'setstatus',
    description: 'Owner: set online/idle/dnd/invisible (invisible hides the bot in the member list)',
    usage: '<online | idle | dnd | invisible>',
    examples: ['invisible'],
    ownerOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const s = ctx.args[0].toLowerCase();
      if (!STATUSES.includes(s)) return ctx.usage();
      ctx.client.botProfile.status = s;
      savePresence(ctx.client);
      await ctx.ok(`Status set to **${s}**.${s === 'invisible' ? ' I now appear offline, so I sit in the collapsed Offline section of the member list (large servers hide offline members entirely), but every command still works.' : ''}`);
    },
  },
  {
    name: 'setactivity',
    description: 'Owner: set the bot activity, e.g. "Watching the server" (or "clear")',
    usage: `<${ACTIVITY_TYPES.join('|')}> <text> | clear`,
    examples: ['Watching over the server', 'clear'],
    ownerOnly: true,
    minArgs: 1,
    async execute(ctx) {
      if (ctx.args[0].toLowerCase() === 'clear') {
        ctx.client.botProfile.activity = null;
        savePresence(ctx.client);
        return ctx.ok('Activity cleared.');
      }
      const type = ACTIVITY_TYPES.find((t) => t.toLowerCase() === ctx.args[0].toLowerCase());
      const text = ctx.rest(1);
      if (!type || !text) return ctx.usage();
      ctx.client.botProfile.activity = `${type}|${text}`;
      savePresence(ctx.client);
      await ctx.ok(`Activity set to **${type} ${text}**.`);
    },
  },
  {
    name: 'servers',
    description: 'Owner: list the servers this bot is in',
    ownerOnly: true,
    async execute(ctx) {
      const guilds = [...ctx.client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
      const pages = chunk(guilds, 15).map((g, i, all) =>
        ctx.embed({
          title: `🌐 ${guilds.length} servers`,
          description: g.map((x, j) => `**${i * 15 + j + 1}.** ${truncate(x.name, 40)} — ${formatNumber(x.memberCount)} members \`${x.id}\``).join('\n'),
          footer: `Page ${i + 1}/${all.length}`,
        }),
      );
      await paginate(ctx, pages, { ephemeral: true });
    },
  },
  {
    name: 'leaveserver',
    description: 'Owner: make the bot leave a server',
    usage: '<server id>',
    examples: ['123456789012345678'],
    ownerOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const g = ctx.client.guilds.cache.get(ctx.args[0]);
      if (!g) return ctx.fail('I am not in a server with that ID.');
      if (!(await confirm(ctx, `Leave **${g.name}**?`))) return;
      await g.leave();
      await ctx.channel.send({ embeds: [ctx.embeds.success(`Left **${g.name}**.`)] }).catch(() => {});
    },
  },
  {
    name: 'blacklist',
    description: 'Owner: block a user from using the bot',
    usage: '<user> [reason]',
    examples: ['@spammer abusing commands'],
    ownerOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (ctx.isOwner(user.id)) return ctx.fail('You cannot blacklist an owner.');
      db.set('blacklist', user.id, { reason: ctx.rest(1) || 'No reason', by: ctx.author.id, at: Date.now() });
      await ctx.ok(`**${user.username}** can no longer use the bot.`);
    },
  },
  {
    name: 'unblacklist',
    description: 'Owner: unblock a user',
    usage: '<user>',
    examples: ['123456789012345678'],
    ownerOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const id = (await ctx.resolveUser(ctx.args[0]))?.id || ctx.args[0];
      if (!db.delete('blacklist', id)) return ctx.fail('That user is not blacklisted.');
      await ctx.ok('User removed from the blacklist.');
    },
  },
  {
    name: 'syncslash',
    description: 'Owner: force re-registration of slash commands',
    ownerOnly: true,
    async execute(ctx) {
      await ctx.defer();
      db.delete('meta', `slashHash:${ctx.client.user.id}:${config.devGuildId || 'global'}`);
      await slash.register(ctx.client, ctx.registry, ctx.bot);
      await ctx.ok('Slash commands re-registered.');
    },
  },
  {
    name: 'shutdown',
    aliases: ['restart'],
    description: 'Owner: save data and stop (your host or pm2 restarts it)',
    ownerOnly: true,
    async execute(ctx) {
      if (!(await confirm(ctx, 'Save data and stop the process? If you run under pm2/Docker/a host with auto-restart it will come back.'))) return;
      db.flush();
      setTimeout(() => process.exit(0), 1000);
    },
  },
  {
    name: 'dbstats',
    description: 'Owner: database size and collections',
    ownerOnly: true,
    async execute(ctx) {
      db.flush();
      const file = path.join(config.dataDir, 'db.json');
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      const cols = Object.keys(db.data).map((k) => `\`${k}\`: ${Object.keys(db.data[k]).length}`);
      await ctx.reply({ embeds: [ctx.embed({ title: '🗄️ Database', description: `File: \`${file}\` (${(size / 1024).toFixed(1)} KB)\n${cols.join(' • ') || 'empty'}` })], ephemeral: true });
    },
  },
];
