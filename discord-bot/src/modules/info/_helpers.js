'use strict';
const { GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const lastFullFetch = new Map(); // guildId -> timestamp

/**
 * All members of a guild (best effort). Requesting the full member list is
 * rate limited by Discord, so it happens at most once per 10 minutes per guild,
 * only for guilds up to 25k members, and only with the Server Members intent.
 */
async function allMembers(guild) {
  const intents = guild.client?.options?.intents;
  const allowed = intents?.has ? intents.has(GatewayIntentBits.GuildMembers) : true;
  const fresh = Date.now() - (lastFullFetch.get(guild.id) || 0) < 10 * 60 * 1000;
  if (allowed && !fresh && guild.memberCount <= 25000 && guild.members.cache.size < guild.memberCount) {
    lastFullFetch.set(guild.id, Date.now());
    await guild.members.fetch({ time: 20000 }).catch(() => null);
  }
  return guild.members.cache;
}

/** Cached member or a fetched one; null when the user is not in the guild. */
async function getMember(guild, userId) {
  if (!guild || !userId) return null;
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  const fetched = await guild.members.fetch(userId).catch(() => null);
  return fetched?.user ? fetched : null;
}

const prettyPerm = (p) => p.replace(/([a-z])([A-Z])/g, '$1 $2').replace('Guild', 'Server');

const KEY_PERMS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageMessages', 'ManageWebhooks',
  'ManageGuildExpressions', 'ManageNicknames', 'BanMembers', 'KickMembers', 'ModerateMembers', 'MentionEveryone', 'ViewAuditLog',
];

function keyPermissions(perms) {
  if (!perms) return 'None';
  if (perms.has(PermissionFlagsBits.Administrator)) return 'Administrator (all permissions)';
  const list = KEY_PERMS.filter((p) => perms.has(PermissionFlagsBits[p])).map(prettyPerm);
  return list.length ? list.join(', ') : 'None';
}

/** Discord snowflake -> creation Date. */
function snowflakeDate(id) {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}

/** Text after the command or the author's own user, for "[user]" style args. */
async function userArg(ctx) {
  if (!ctx.args.length) return ctx.author;
  return (await ctx.resolveUser(ctx.args[0])) || (await ctx.resolveUser(ctx.rest(0)));
}

module.exports = { allMembers, getMember, prettyPerm, keyPermissions, snowflakeDate, userArg, KEY_PERMS };
