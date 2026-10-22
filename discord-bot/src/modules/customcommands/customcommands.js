'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { confirm, paginate } = require('../../core/ui');
const { chunk, truncate, discordTimestamp } = require('../../core/utils');
const { peek, claim, owns } = require('../community/_lib');
const { render, PLACEHOLDER_HELP, NAME_RE } = require('./_lib');

/**
 * Guild section "customcommands":
 *   { commands: { [name]: { response, embed, uses, authorId, createdAt, updatedAt } }, botId }
 * Run with <prefix><name> through the core "unknownCommand" event.
 */
const DEFAULTS = { commands: {}, botId: null };
const MAX_COMMANDS = 200;
const MAX_LENGTH = 2000;
const section = (ctx) => db.section(ctx.guild.id, 'customcommands', DEFAULTS);
const base = { guildOnly: true, userPerms: ['ManageGuild'] };
const recent = new Map(); // `${guild}:${user}:${name}` -> ts (per-user cooldown)

function validateName(ctx, raw) {
  const name = String(raw || '').toLowerCase();
  if (!NAME_RE.test(name)) return { error: 'Names can use a-z, 0-9, - and _ (max 32 characters).' };
  if (ctx.registry.get(name)) return { error: `\`${name}\` is already a built-in command.` };
  return { name };
}

module.exports = {
  commands: [
    {
      ...base,
      name: 'ccadd',
      aliases: ['addcc', 'customcommandadd'],
      description: 'Create a custom command for this server',
      usage: '<name> <response>',
      examples: ['hello Hi {mention}, welcome to {server}!', 'pick I choose {random:pizza|tacos|sushi}'],
      minArgs: 2,
      async execute(ctx) {
        const { name, error } = validateName(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        const cfg = section(ctx);
        if (cfg.commands[name]) return ctx.fail(`\`${name}\` already exists — use \`${ctx.prefix}ccedit\`.`);
        if (Object.keys(cfg.commands).length >= MAX_COMMANDS) return ctx.fail(`This server reached the limit of ${MAX_COMMANDS} custom commands.`);
        const response = ctx.rest(1);
        if (response.length > MAX_LENGTH) return ctx.fail(`Responses can be at most ${MAX_LENGTH} characters.`);
        cfg.commands[name] = { response, embed: false, uses: 0, authorId: ctx.author.id, createdAt: Date.now(), updatedAt: Date.now() };
        claim(cfg, ctx.client);
        await ctx.ok(`Custom command \`${ctx.prefix}${name}\` created.\nPlaceholders: ${PLACEHOLDER_HELP}`);
      },
    },
    {
      ...base,
      name: 'ccedit',
      aliases: ['editcc'],
      description: 'Change a custom command\'s response',
      usage: '<name> <new response>',
      examples: ['hello Hey {user}!'],
      minArgs: 2,
      async execute(ctx) {
        const cfg = section(ctx);
        const cc = cfg.commands[ctx.args[0].toLowerCase()];
        if (!cc) return ctx.fail('No custom command with that name.');
        const response = ctx.rest(1);
        if (response.length > MAX_LENGTH) return ctx.fail(`Responses can be at most ${MAX_LENGTH} characters.`);
        cc.response = response;
        cc.updatedAt = Date.now();
        claim(cfg, ctx.client);
        await ctx.ok(`\`${ctx.args[0].toLowerCase()}\` updated.`);
      },
    },
    {
      ...base,
      name: 'ccremove',
      aliases: ['ccdel', 'delcc', 'ccdelete'],
      description: 'Delete a custom command',
      usage: '<name>',
      examples: ['hello'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        const name = ctx.args[0].toLowerCase();
        if (!cfg.commands[name]) return ctx.fail('No custom command with that name.');
        delete cfg.commands[name];
        db.save();
        await ctx.ok(`Custom command \`${name}\` deleted.`);
      },
    },
    {
      ...base,
      name: 'ccrename',
      description: 'Rename a custom command',
      usage: '<old name> <new name>',
      examples: ['hello hi'],
      minArgs: 2,
      async execute(ctx) {
        const cfg = section(ctx);
        const old = ctx.args[0].toLowerCase();
        if (!cfg.commands[old]) return ctx.fail('No custom command with that name.');
        const { name, error } = validateName(ctx, ctx.args[1]);
        if (error) return ctx.fail(error);
        if (cfg.commands[name]) return ctx.fail(`\`${name}\` already exists.`);
        cfg.commands[name] = cfg.commands[old];
        delete cfg.commands[old];
        db.save();
        await ctx.ok(`Renamed \`${old}\` → \`${name}\`.`);
      },
    },
    {
      ...base,
      name: 'ccembed',
      description: 'Send a custom command\'s response as an embed (on/off)',
      usage: '<name> <on|off>',
      examples: ['hello on'],
      minArgs: 2,
      async execute(ctx) {
        const cc = section(ctx).commands[ctx.args[0].toLowerCase()];
        if (!cc) return ctx.fail('No custom command with that name.');
        const v = ctx.args[1].toLowerCase();
        if (!['on', 'off'].includes(v)) return ctx.usage();
        cc.embed = v === 'on';
        db.save();
        await ctx.ok(`\`${ctx.args[0].toLowerCase()}\` will reply ${cc.embed ? 'with an embed' : 'as plain text'}.`);
      },
    },
    {
      name: 'cclist',
      aliases: ['customcommands', 'ccs'],
      description: 'List this server\'s custom commands',
      guildOnly: true,
      async execute(ctx) {
        const entries = Object.entries(section(ctx).commands).sort(([a], [b]) => a.localeCompare(b));
        if (!entries.length) return ctx.info(`No custom commands yet. Admins can add one with \`${ctx.prefix}ccadd <name> <response>\`.`);
        const lines = entries.map(([n, c]) => `\`${ctx.prefix}${n}\` — ${truncate(c.response.replace(/\n/g, ' '), 60)} *(${c.uses} uses)*`);
        await paginate(ctx, chunk(lines, 15).map((c, i, all) => ctx.embed({ title: `🧩 Custom commands (${entries.length})`, description: c.join('\n'), footer: `Page ${i + 1}/${all.length}` })));
      },
    },
    {
      name: 'ccshow',
      aliases: ['ccinfo', 'ccraw'],
      description: 'Show a custom command\'s raw response and info',
      usage: '<name>',
      examples: ['hello'],
      guildOnly: true,
      minArgs: 1,
      async execute(ctx) {
        const name = ctx.args[0].toLowerCase();
        const cc = section(ctx).commands[name];
        if (!cc) return ctx.fail('No custom command with that name.');
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: `🧩 ${ctx.prefix}${name}`,
              description: `\`\`\`\n${truncate(cc.response.replace(/```/g, '`​``'), 3900)}\n\`\`\``,
              fields: [
                { name: 'Uses', value: String(cc.uses), inline: true },
                { name: 'Style', value: cc.embed ? 'embed' : 'text', inline: true },
                { name: 'Created by', value: `<@${cc.authorId}>`, inline: true },
                { name: 'Updated', value: discordTimestamp(cc.updatedAt || cc.createdAt), inline: true },
              ],
            }),
          ],
          allowedMentions: { parse: [] },
        });
      },
    },
    {
      ...base,
      name: 'ccclear',
      description: 'Delete every custom command in this server',
      async execute(ctx) {
        const cfg = section(ctx);
        const n = Object.keys(cfg.commands).length;
        if (!n) return ctx.fail('There are no custom commands.');
        if (!(await confirm(ctx, `Delete all **${n}** custom commands? This cannot be undone.`))) return;
        cfg.commands = {};
        db.save();
        await ctx.send({ embeds: [ctx.embeds.success(`Deleted ${n} custom commands.`)] });
      },
    },
  ],
  events: {
    async unknownCommand(client, message, { name, raw }) {
      if (!message.guild) return false;
      const cfg = peek(message.guild.id, 'customcommands');
      const cc = cfg?.commands?.[name];
      if (!cc || !owns(cfg, client)) return false;
      if (db.get('blacklist', message.author.id) || db.guild(message.guild.id).disabledCategories.includes('customcommands')) return false;
      const key = `${message.guild.id}:${message.author.id}:${name}`;
      if (Date.now() - (recent.get(key) || 0) < 3000) return true;
      recent.set(key, Date.now());
      if (recent.size > 2000) recent.clear();
      const text = render(cc.response, { user: message.author, member: message.member, guild: message.guild, channel: message.channel, args: raw ? raw.split(/\s+/) : [] });
      const payload = cc.embed
        ? { embeds: [embed({ color: client.botProfile.color, description: text || '\u200b' })], allowedMentions: { parse: ['users'] } }
        : { content: text || '​', allowedMentions: { parse: ['users'] } };
      await message.channel.send(payload).catch(() => {});
      cc.uses += 1;
      db.save();
      return true;
    },
  },
};

