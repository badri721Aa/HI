'use strict';
const db = require('../../core/db');
const { chunk } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const { fetchMessageRef, fetchMsg, messageIdFrom, parseEmoji, reactionKey, roleProblem, checkRoleForConfig } = require('./_lib');

/**
 * Collection "reactionroles": `${guildId}:${messageId}` ->
 *   { guildId, channelId, messageId, mode, botId, roles: { [emojiKey]: { roleId, display } } }
 * Modes: normal (react = add, unreact = remove), unique (only one role from this message), addonly (never removed).
 */
const COL = 'reactionroles';
const MODES = ['normal', 'unique', 'addonly'];
const keyOf = (guildId, messageId) => `${guildId}:${messageId}`;

async function memberFor(guild, userId) {
  return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
}

async function onReaction(client, reaction, user, added) {
  if (user.bot) return;
  const message = reaction.message;
  const guildId = message.guildId || message.guild?.id;
  if (!guildId) return;
  const rec = db.get(COL, keyOf(guildId, message.id), null);
  if (!rec || (rec.botId && rec.botId !== client.user.id)) return;
  const entry = rec.roles[reactionKey(reaction.emoji)];
  if (!entry) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const role = guild.roles.cache.get(entry.roleId);
  if (!role || roleProblem(guild, role)) return;
  const member = await memberFor(guild, user.id);
  if (!member) return;

  if (added) {
    if (rec.mode === 'unique') {
      const others = Object.entries(rec.roles).filter(([k, e]) => e.roleId !== role.id && member.roles.cache.has(e.roleId));
      if (others.length) await member.roles.remove(others.map(([, e]) => e.roleId), 'Reaction roles (unique)').catch(() => {});
      const full = message.partial ? await message.fetch().catch(() => null) : message;
      for (const [k] of others) {
        const r = full?.reactions.cache.find((x) => reactionKey(x.emoji) === k);
        await r?.users.remove(user.id).catch(() => {});
      }
    }
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, 'Reaction roles').catch(() => {});
  } else if (rec.mode !== 'addonly' && member.roles.cache.has(role.id)) {
    await member.roles.remove(role, 'Reaction roles').catch(() => {});
  }
}

const base = { guildOnly: true, userPerms: ['ManageRoles'] };

module.exports = {
  commands: [
    {
      ...base,
      name: 'rradd',
      aliases: ['reactionrole', 'addreactionrole'],
      description: 'Add a reaction role: reacting with the emoji on that message gives the role',
      usage: '<message ID or link> <emoji> <@role>',
      examples: ['123456789012345678 🎮 @Gamer'],
      botPerms: ['ManageRoles', 'AddReactions', 'ReadMessageHistory'],
      minArgs: 3,
      slash: true,
      args: [
        { name: 'message', type: 'string', description: 'Message ID (in this channel) or message link', required: true },
        { name: 'emoji', type: 'string', description: 'Emoji to react with', required: true },
        { name: 'role', type: 'role', description: 'Role to give', required: true },
      ],
      async execute(ctx) {
        const msg = await fetchMessageRef(ctx, ctx.args[0]);
        if (!msg) return ctx.fail('Message not found. Use a message link, or run this in the same channel as the message.');
        const emoji = parseEmoji(ctx.args[1]);
        if (!emoji) return ctx.fail('That is not a valid emoji. Use a normal emoji or one from this server.');
        const role = ctx.resolveRole(ctx.rest(2));
        const problem = checkRoleForConfig(ctx, role);
        if (problem) return ctx.fail(problem);
        const rec = db.ensure(COL, keyOf(ctx.guild.id, msg.id), { guildId: ctx.guild.id, channelId: msg.channel.id, messageId: msg.id, mode: 'normal', roles: {}, botId: ctx.client.user.id });
        if (Object.keys(rec.roles).length >= 20 && !rec.roles[emoji.key]) return ctx.fail('A message can have at most 20 reaction roles.');
        try {
          await msg.react(emoji.react);
        } catch {
          if (!Object.keys(rec.roles).length) db.delete(COL, keyOf(ctx.guild.id, msg.id));
          return ctx.fail('I could not react with that emoji (custom emojis must be from a server I am in).');
        }
        rec.roles[emoji.key] = { roleId: role.id, display: emoji.display };
        rec.botId = ctx.client.user.id;
        db.save();
        await ctx.ok(`Reacting with ${emoji.display} on [that message](${msg.url}) now gives ${role}.`);
      },
    },
    {
      ...base,
      name: 'rrremove',
      aliases: ['delreactionrole'],
      description: 'Remove one emoji→role pair from a reaction-role message',
      usage: '<message ID or link> <emoji>',
      examples: ['123456789012345678 🎮'],
      minArgs: 2,
      async execute(ctx) {
        const id = messageIdFrom(ctx.args[0]);
        const rec = id && db.get(COL, keyOf(ctx.guild.id, id), null);
        if (!rec) return ctx.fail('That message has no reaction roles.');
        const emoji = parseEmoji(ctx.args[1]);
        if (!emoji || !rec.roles[emoji.key]) return ctx.fail('That emoji is not set up on this message.');
        delete rec.roles[emoji.key];
        if (!Object.keys(rec.roles).length) db.delete(COL, keyOf(ctx.guild.id, id));
        else db.save();
        const ch = ctx.guild.channels.cache.get(rec.channelId);
        const msg = await fetchMsg(ch, id);
        await msg?.reactions?.cache.find((r) => reactionKey(r.emoji) === emoji.key)?.users.remove(ctx.client.user.id).catch(() => {});
        await ctx.ok(`Removed the ${emoji.display} reaction role.`);
      },
    },
    {
      ...base,
      name: 'rrclear',
      description: 'Remove all reaction roles from a message',
      usage: '<message ID or link>',
      examples: ['123456789012345678'],
      minArgs: 1,
      async execute(ctx) {
        const id = messageIdFrom(ctx.args[0]);
        if (!id || !db.delete(COL, keyOf(ctx.guild.id, id))) return ctx.fail('That message has no reaction roles.');
        await ctx.ok('All reaction roles removed from that message.');
      },
    },
    {
      ...base,
      name: 'rrmode',
      description: 'Reaction-role mode: normal, unique (pick one) or addonly (never removed)',
      usage: '<message ID or link> <normal|unique|addonly>',
      examples: ['123456789012345678 unique'],
      minArgs: 2,
      async execute(ctx) {
        const id = messageIdFrom(ctx.args[0]);
        const rec = id && db.get(COL, keyOf(ctx.guild.id, id), null);
        if (!rec) return ctx.fail('That message has no reaction roles.');
        const mode = ctx.args[1].toLowerCase();
        if (!MODES.includes(mode)) return ctx.usage();
        rec.mode = mode;
        db.save();
        await ctx.ok(`Mode set to **${mode}**.`);
      },
    },
    {
      ...base,
      name: 'rrlist',
      aliases: ['reactionroles'],
      description: 'List every reaction-role message in this server',
      async execute(ctx) {
        const recs = db.entries(COL).filter(([k]) => k.startsWith(`${ctx.guild.id}:`)).map(([, v]) => v);
        if (!recs.length) return ctx.info(`No reaction roles yet. Add one with \`${ctx.prefix}rradd\`.`);
        const lines = recs.map((r) => {
          const pairs = Object.values(r.roles).map((e) => `${e.display} → <@&${e.roleId}>`).join(', ');
          return `[Message](https://discord.com/channels/${r.guildId}/${r.channelId}/${r.messageId}) in <#${r.channelId}> • **${r.mode}**\n${pairs}`;
        });
        await paginate(ctx, chunk(lines, 8).map((c, i, all) => ctx.embed({ title: '🎭 Reaction roles', description: c.join('\n\n'), footer: `Page ${i + 1}/${all.length}` })));
      },
    },
  ],
  events: {
    messageReactionAdd: (client, reaction, user) => onReaction(client, reaction, user, true),
    messageReactionRemove: (client, reaction, user) => onReaction(client, reaction, user, false),
    async messageDelete(client, message) {
      if (message.guildId && db.has(COL, keyOf(message.guildId, message.id))) db.delete(COL, keyOf(message.guildId, message.id));
    },
  },
};
