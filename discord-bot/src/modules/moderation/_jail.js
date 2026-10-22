'use strict';
/** Jail helpers shared by the jail commands and the timer task. */
const db = require('../../core/db');
const lib = require('./_lib');

const jailKey = (guildId, userId) => `${guildId}:${userId}`;

/** Roles the bot can remove from a member (not managed, not @everyone, below the bot). */
function removableRoles(member) {
  const myTop = lib.highest(member.guild.members.me);
  return member.roles.cache.filter((r) => r.id !== member.guild.id && !r.managed && r.position < myTop);
}

async function jailMember(member, reason) {
  const cfg = lib.settings(member.guild.id);
  const jailRole = member.guild.roles.cache.get(cfg.jailRole);
  if (!jailRole) throw Object.assign(new Error('no jail role'), { userMessage: 'No jail role is set up. Run `jailsetup` (or `setjail <role>`) first.' });
  const removable = removableRoles(member).filter((r) => r.id !== jailRole.id);
  db.set('jailed', jailKey(member.guild.id, member.id), { roles: [...removable.keys()], at: Date.now() });
  const keep = member.roles.cache.filter((r) => r.id !== member.guild.id && !removable.has(r.id)).map((r) => r.id);
  await member.roles.set([...new Set([...keep, jailRole.id])], reason);
}

/** Restore a jailed member's roles. Works by user id (member may have left). Returns true if they were jailed. */
async function releaseJail(guild, userId, reason) {
  const key = jailKey(guild.id, userId);
  const record = db.get('jailed', key, null);
  const member = await guild.members.fetch(userId).catch(() => null);
  const cfg = lib.settings(guild.id);
  if (!record && !(member && cfg.jailRole && member.roles.cache.has(cfg.jailRole))) return false;
  if (member) {
    const restore = (record?.roles || []).filter((id) => guild.roles.cache.has(id));
    const keep = member.roles.cache.filter((r) => r.id !== guild.id && r.id !== cfg.jailRole).map((r) => r.id);
    await member.roles.set([...new Set([...keep, ...restore])], reason);
  }
  db.delete('jailed', key);
  lib.removeTimers(guild.id, 'unjail', userId);
  return true;
}

const isJailed = (guildId, userId) => db.has('jailed', jailKey(guildId, userId));

module.exports = { jailMember, releaseJail, isJailed, removableRoles };
