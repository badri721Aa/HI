'use strict';
const { PermissionFlagsBits, Collection } = require('discord.js');
const { Context } = require('./context');
const { optionsToRaw, enabledFor } = require('./slash');
const db = require('./db');
const embeds = require('./embeds');
const { formatDuration } = require('./utils');
const log = require('./logger').child('handler');

const cooldowns = new Collection(); // `${bot}:${cmd}:${user}` -> expires at

// Categories that can never be disabled (so admins can't lock themselves out).
const ALWAYS_ON = new Set(['core']);

function permName(p) {
  return p.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function prefixFor(client, guild) {
  const bot = client.botProfile;
  if (!guild) return bot.prefix;
  return db.guild(guild.id).prefixes?.[client.user.id] || bot.prefix;
}

function moduleEnabled(client, category) {
  return enabledFor(client.botProfile, { category });
}

/** Shared gatekeeping for prefix and slash commands. Returns an error string or null. */
function gate(ctx, cmd) {
  const { client, guild, author } = ctx;
  if (db.get('blacklist', author.id)) return 'You are blacklisted from using this bot.';
  if (cmd.ownerOnly && !ctx.isOwner()) return 'This command is for the bot owner only.';
  if (!moduleEnabled(client, cmd.category)) return null; // silently ignored by caller
  if (cmd.guildOnly && !guild) return 'This command only works in a server.';
  if (guild && !ALWAYS_ON.has(cmd.category)) {
    const cfg = db.guild(guild.id);
    if (cfg.disabledCommands.includes(cmd.name) || cfg.disabledCategories.includes(cmd.category)) {
      return `\`${cmd.name}\` is disabled in this server.`;
    }
  }
  if (cmd.nsfw && guild && !ctx.channel?.nsfw) return 'This command can only be used in NSFW channels.';
  if (guild && cmd.userPerms.length && !ctx.isOwner()) {
    const perms = ctx.channel?.permissionsFor?.(ctx.member) || ctx.member?.permissions;
    const missing = cmd.userPerms.filter((p) => !perms?.has(PermissionFlagsBits[p]));
    if (missing.length) return `You need the **${missing.map(permName).join(', ')}** permission(s).`;
  }
  if (guild && cmd.botPerms.length) {
    const me = guild.members.me;
    const perms = ctx.channel?.permissionsFor?.(me) || me?.permissions;
    const missing = cmd.botPerms.filter((p) => !perms?.has(PermissionFlagsBits[p]));
    if (missing.length) return `I need the **${missing.map(permName).join(', ')}** permission(s) to do that.`;
  }
  return null;
}

function checkCooldown(ctx, cmd) {
  if (!(cmd.cooldown > 0) || ctx.isOwner()) return null;
  const key = `${ctx.client.user.id}:${cmd.name}:${ctx.author.id}`;
  const until = cooldowns.get(key) || 0;
  if (until > Date.now()) return `Slow down! Try again in **${formatDuration(until - Date.now())}**.`;
  cooldowns.set(key, Date.now() + cmd.cooldown * 1000);
  if (cooldowns.size > 5000) for (const [k, v] of cooldowns) if (v < Date.now()) cooldowns.delete(k);
  return null;
}

async function run(ctx, cmd) {
  if (!moduleEnabled(ctx.client, cmd.category)) return;
  const problem = gate(ctx, cmd);
  if (problem) return ctx.fail(problem).catch(() => {});
  if (ctx.args.length < (cmd.minArgs || 0)) return ctx.usage().catch(() => {});
  const slow = checkCooldown(ctx, cmd);
  if (slow) return ctx.fail(slow).catch(() => {});
  try {
    await cmd.execute(ctx);
    ctx.client.stats.commands++;
  } catch (err) {
    const code = err?.code;
    let msg = err?.userMessage || 'Something went wrong running that command.';
    if (code === 50013) msg = 'I am missing permissions to do that (check my role position and channel permissions).';
    else if (code === 50001) msg = 'I do not have access to that channel.';
    else if (err?.name === 'TimeoutError' || err?.name === 'AbortError') msg = 'An external service took too long to answer. Try again later.';
    else if (err?.status) msg = `An external service returned an error (${err.status}). Try again later.`;
    if (!err?.userMessage && !code && !err?.status) log.error(`Command ${cmd.name} failed:`, err);
    await ctx.fail(msg).catch(() => {});
  }
}

/** Best-effort guild for an event's arguments (message, member, reaction, voice state, channel, guild…). */
function guildOf(args) {
  for (const a of args) {
    if (!a || typeof a !== 'object') continue;
    if (a.guild?.id) return a.guild;
    if (a.message?.guild?.id) return a.message.guild;
    if (a.channels && a.members && a.id) return a; // a Guild itself
  }
  return null;
}

/**
 * Run listeners from all enabled modules for an event. Returns true if any listener returned true.
 * Categories a server disabled with `disable <category>` don't receive that server's events.
 */
async function dispatch(client, event, ...args) {
  const listeners = client.registry.events.get(event);
  if (!listeners) return false;
  const guild = guildOf(args);
  const disabled = guild ? db.get('guilds', guild.id, null)?.disabledCategories || [] : [];
  let handled = false;
  for (const l of listeners) {
    if (!moduleEnabled(client, l.category)) continue;
    if (disabled.includes(l.category) && !ALWAYS_ON.has(l.category)) continue;
    try {
      if ((await l.handler(client, ...args)) === true) handled = true;
    } catch (err) {
      log.error(`Listener ${l.source} for ${event} failed:`, err);
    }
    if (handled && event === 'messageCreate') break;
  }
  return handled;
}

async function onMessage(client, message) {
  if (message.author.bot || message.webhookId || message.system) return;
  if (message.partial) return;
  client.stats.messages++;

  const prefix = prefixFor(client, message.guild);
  const mention = new RegExp(`^<@!?${client.user.id}>\\s*`);
  const content = message.content || '';

  // Module hooks first (automod, leveling, AFK, counting…). `true` means "swallowed".
  if (await dispatch(client, 'messageCreate', message, { prefix })) return;

  let used = null;
  if (content.startsWith(prefix)) used = prefix;
  else if (mention.test(content)) used = content.match(mention)[0];
  if (!used) return;

  const body = content.slice(used.length).trimStart();
  if (!body) {
    if (used !== prefix) {
      return message
        .reply({ embeds: [embeds.embed({ color: client.botProfile.color, description: `👋 My prefix here is \`${prefix}\` — try \`${prefix}help\` or \`/help\`.\nI have **${client.registry.size}** commands.` })] })
        .catch(() => {});
    }
    return;
  }

  const name = body.split(/\s+/)[0].toLowerCase();
  const raw = body.slice(name.length).trim();
  const cmd = client.registry.get(name);
  if (!cmd || !moduleEnabled(client, cmd.category)) {
    if (db.get('blacklist', message.author.id)) return; // custom commands are commands too
    await dispatch(client, 'unknownCommand', message, { name, raw, prefix: used });
    return;
  }

  const ctx = new Context({ client, bot: client.botProfile, command: cmd, message, raw, prefix, attachments: [...message.attachments.values()] });
  await run(ctx, cmd);
}

async function onInteraction(client, interaction) {
  try {
    if (interaction.isAutocomplete()) return await onAutocomplete(client, interaction);
    if (interaction.isChatInputCommand()) return await onSlash(client, interaction);
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) return await onComponent(client, interaction);
  } catch (err) {
    log.error('Interaction failed:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ embeds: [embeds.error('Something went wrong.')], flags: 64 }).catch(() => {});
    }
  }
}

async function onAutocomplete(client, interaction) {
  if (interaction.commandName === 'cmd') {
    const q = String(interaction.options.getFocused() || '').toLowerCase();
    const visible = [...client.registry.commands.values()].filter((c) => !c.hidden && !c.ownerOnly && moduleEnabled(client, c.category));
    const starts = visible.filter((c) => c.name.startsWith(q));
    const contains = visible.filter((c) => !c.name.startsWith(q) && (c.name.includes(q) || c.aliases.some((a) => a.includes(q))));
    const choices = [...starts, ...contains].slice(0, 25).map((c) => ({ name: `${c.name} — ${c.description}`.slice(0, 100), value: c.name }));
    return interaction.respond(choices);
  }
  const cmd = client.registry.get(interaction.commandName);
  if (cmd?.autocomplete) return interaction.respond((await cmd.autocomplete(interaction, client)).slice(0, 25));
  return interaction.respond([]);
}

async function onSlash(client, interaction) {
  let cmd;
  let raw;
  let attachments = [];
  if (interaction.commandName === 'cmd') {
    cmd = client.registry.get(interaction.options.getString('command'));
    raw = interaction.options.getString('args') || '';
    const file = interaction.options.getAttachment('file');
    if (file) attachments = [file];
    if (!cmd || !moduleEnabled(client, cmd.category)) {
      return interaction.reply({ embeds: [embeds.error('Unknown command. Use `/help` to browse them all.')], flags: 64 });
    }
  } else {
    cmd = client.registry.get(interaction.commandName);
    if (!cmd) return interaction.reply({ embeds: [embeds.error('That command no longer exists.')], flags: 64 });
    ({ raw, attachments } = optionsToRaw(interaction, cmd));
  }
  const prefix = prefixFor(client, interaction.guild);
  const ctx = new Context({ client, bot: client.botProfile, command: cmd, interaction, raw, prefix, attachments });
  await run(ctx, cmd);
}

async function onComponent(client, interaction) {
  const [prefix, ...parts] = interaction.customId.split(':');
  const entry = client.registry.components.get(prefix);
  if (!entry || !moduleEnabled(client, entry.category)) return; // probably handled by a local collector
  await entry.handler(interaction, parts, client);
}

module.exports = { onMessage, onInteraction, dispatch, prefixFor, moduleEnabled, run, ALWAYS_ON };
