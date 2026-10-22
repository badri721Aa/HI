'use strict';
/**
 * Discord allows 100 global slash commands per bot. Commands with `slash: true`
 * get their own slash command (up to 99), and the universal `/cmd` slash command
 * can run ANY of the 1000+ commands: /cmd command:<name> args:<text>.
 */
const crypto = require('node:crypto');
const { SlashCommandBuilder, ApplicationCommandOptionType } = require('discord.js');
const db = require('./db');
const log = require('./logger').child('slash');
const config = require('../config');

const TYPE_MAP = {
  string: 'addStringOption',
  integer: 'addIntegerOption',
  number: 'addNumberOption',
  boolean: 'addBooleanOption',
  user: 'addUserOption',
  channel: 'addChannelOption',
  role: 'addRoleOption',
  mentionable: 'addMentionableOption',
  attachment: 'addAttachmentOption',
};

const MAX_DEDICATED = 99;

function buildCommand(cmd) {
  const b = new SlashCommandBuilder().setName(cmd.name).setDescription(String(cmd.description).slice(0, 100));
  if (cmd.nsfw) b.setNSFW(true);
  if (cmd.guildOnly) b.setContexts(0); // Guild only
  // `args: []` means "no options"; no `args` at all means one free-text "input" option.
  const specs = Array.isArray(cmd.args) ? cmd.args : [{ name: 'input', type: 'string', description: cmd.usage ? `Arguments: ${cmd.usage}`.slice(0, 100) : 'Arguments', required: false }];
  // Discord requires required options to come before optional ones.
  const ordered = [...specs.filter((a) => a.required), ...specs.filter((a) => !a.required)];
  for (const a of ordered) {
    const method = TYPE_MAP[a.type || 'string'];
    b[method]((o) => {
      o.setName(a.name).setDescription(String(a.description).slice(0, 100)).setRequired(!!a.required);
      if (a.choices && o.addChoices) o.addChoices(...a.choices.slice(0, 25).map((c) => (typeof c === 'object' ? c : { name: String(c), value: c })));
      if (a.min !== undefined && o.setMinValue) o.setMinValue(a.min);
      if (a.max !== undefined && o.setMaxValue) o.setMaxValue(a.max);
      if (a.maxLength !== undefined && o.setMaxLength) o.setMaxLength(a.maxLength);
      return o;
    });
  }
  return b.toJSON();
}

function buildUniversal() {
  return new SlashCommandBuilder()
    .setName('cmd')
    .setDescription('Run any of the bot\'s commands (1000+) — start typing a name')
    .addStringOption((o) => o.setName('command').setDescription('Command name').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('args').setDescription('Arguments, exactly like the prefix version').setRequired(false))
    .addAttachmentOption((o) => o.setName('file').setDescription('Optional file for commands that use attachments').setRequired(false))
    .toJSON();
}

/** Commands this bot profile is allowed to expose. */
function enabledFor(bot, cmd) {
  return cmd.category === 'core' || bot.modules === 'all' || bot.modules.includes(cmd.category);
}

function buildAll(registry, bot) {
  const dedicated = [...registry.commands.values()].filter((c) => c.slash && !c.ownerOnly && enabledFor(bot, c));
  if (dedicated.length > MAX_DEDICATED) {
    log.warn(`${dedicated.length} commands want a dedicated slash command; only ${MAX_DEDICATED} fit. The rest still work through /cmd.`);
  }
  const out = [buildUniversal()];
  for (const c of dedicated.slice(0, MAX_DEDICATED)) {
    try {
      out.push(buildCommand(c));
    } catch (err) {
      log.warn(`Could not build slash data for ${c.name}: ${err.message}`);
    }
  }
  return out;
}

async function register(client, registry, bot) {
  if (!config.registerSlash) return;
  const data = buildAll(registry, bot);
  const hash = crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');
  const key = `${client.user.id}:${config.devGuildId || 'global'}`;
  if (config.devGuildId && !/^\d{17,20}$/.test(config.devGuildId)) {
    log.error(`[${bot.name}] DEV_GUILD_ID (${config.devGuildId}) is not a server ID (only digits). Leave DEV_GUILD_ID empty in .env to register the commands in every server.`);
    return;
  }
  if (db.get('meta', `slashHash:${key}`) === hash) {
    log.info(`[${bot.name}] Slash commands unchanged (${data.length}).`);
    return;
  }
  try {
    if (config.devGuildId) {
      const guild = await client.guilds.fetch(config.devGuildId);
      await guild.commands.set(data);
    } else {
      await client.application.commands.set(data);
    }
    db.set('meta', `slashHash:${key}`, hash);
    log.info(`[${bot.name}] Registered ${data.length} slash commands ${config.devGuildId ? `in guild ${config.devGuildId}` : 'globally'}.`);
  } catch (err) {
    log.error(`[${bot.name}] Slash registration failed:`, err.message);
    if (config.devGuildId && err.code === 10004) {
      log.error(`[${bot.name}] DEV_GUILD_ID (${config.devGuildId}) is not a server this bot is in. Leave DEV_GUILD_ID empty in .env to register the commands in every server.`);
    }
  }
}

/**
 * Turn interaction options back into a raw argument string, in the order the
 * command declared them, so `execute(ctx)` sees the same ctx.args as a prefix call.
 */
function optionsToRaw(interaction, cmd) {
  const attachments = [];
  const parts = [];
  const specs = Array.isArray(cmd.args) ? cmd.args : [{ name: 'input', type: 'string', rest: true }];
  for (const a of specs) {
    const opt = interaction.options.get(a.name);
    if (!opt) continue;
    if (opt.type === ApplicationCommandOptionType.Attachment) {
      if (opt.attachment) attachments.push(opt.attachment);
      continue;
    }
    let v = opt.value;
    if (opt.type === ApplicationCommandOptionType.Boolean) v = v ? 'on' : 'off';
    v = String(v);
    if (!a.rest && /\s/.test(v) && !v.includes('"')) v = `"${v}"`;
    parts.push(v);
  }
  return { raw: parts.join(' '), attachments };
}

module.exports = { register, buildAll, buildCommand, optionsToRaw, enabledFor };
