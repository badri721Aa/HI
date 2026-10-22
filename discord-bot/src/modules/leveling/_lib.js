'use strict';
/**
 * Leveling engine (MEE6-style curve: XP to go from level L to L+1 = 5L² + 50L + 100).
 * Records: collection "levels", key `${guildId}:${userId}` -> { xp (total), messages, voiceMinutes, lastXp, lastVoiceXp }.
 */
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { template, formatNumber } = require('../../core/utils');

const DEFAULTS = {
  enabled: true,
  announce: true,
  channel: null, // null = same channel as the message
  message: 'GG {user}, you just reached **level {level}**! 🎉',
  xpMin: 15,
  xpMax: 25,
  cooldown: 60, // seconds between XP grants per member
  multiplier: 1,
  roleMultipliers: {}, // roleId -> multiplier (highest applies)
  noXpChannels: [],
  noXpRoles: [],
  rewards: {}, // level -> roleId
  stackRewards: true,
  voiceXp: true,
  voiceXpPerMinute: 5,
};

const key = (g, u) => `${g}:${u}`;
const settings = (guildId) => db.section(guildId, 'leveling', DEFAULTS);
const record = (g, u) => db.ensure('levels', key(g, u), { xp: 0, messages: 0, voiceMinutes: 0, lastXp: 0, lastVoiceXp: 0 });
const peek = (g, u) => db.get('levels', key(g, u), null);

const xpForLevel = (l) => 5 * l * l + 50 * l + 100;

function totalXpFor(level) {
  let t = 0;
  for (let l = 0; l < level; l++) t += xpForLevel(l);
  return t;
}

/** total XP -> { level, current (into this level), needed (for next level) } */
function levelInfo(totalXp) {
  let xp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (xp >= xpForLevel(level) && level < 10000) {
    xp -= xpForLevel(level);
    level++;
  }
  return { level, current: xp, needed: xpForLevel(level) };
}

function guildRecords(guildId) {
  const p = `${guildId}:`;
  return db.entries('levels').filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]);
}

function rankOf(guildId, userId) {
  const sorted = guildRecords(guildId).filter(([, r]) => r.xp > 0).sort((a, b) => b[1].xp - a[1].xp);
  const i = sorted.findIndex(([id]) => id === userId);
  return { rank: i >= 0 ? i + 1 : null, total: sorted.length };
}

function progressBar(current, needed, size = 14) {
  const filled = Math.max(0, Math.min(size, Math.round((current / Math.max(1, needed)) * size)));
  return `${'▰'.repeat(filled)}${'▱'.repeat(size - filled)}`;
}

/** Guild multiplier × best role multiplier × 2 while an Energy Drink is active. */
function multiplierFor(member, s = settings(member.guild.id)) {
  let roleMult = 1;
  for (const [roleId, m] of Object.entries(s.roleMultipliers || {})) {
    if (member.roles?.cache?.has(roleId)) roleMult = Math.max(roleMult, Number(m) || 1);
  }
  const eco = db.get('economy', key(member.guild.id, member.id), null);
  const boost = (eco?.effects?.xpboost || 0) > Date.now() ? 2 : 1;
  return (Number(s.multiplier) || 1) * roleMult * boost;
}

/** Roles the bot is actually allowed to hand out. */
function manageable(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members.me;
  if (!role || !me || role.managed || role.id === guild.id) return null;
  if (!me.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return null;
  if (role.position >= me.roles.highest.position) return null;
  return role;
}

/** Make the member's reward roles match their level (adds earned, removes unearned / superseded). */
async function syncRewards(member, level, s = settings(member.guild.id)) {
  if (!member?.roles?.cache) return { added: [], removed: [] };
  const entries = Object.entries(s.rewards || {})
    .map(([lvl, roleId]) => [Number(lvl), roleId])
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return { added: [], removed: [] };
  const earned = entries.filter(([lvl]) => lvl <= level);
  const keep = new Set(s.stackRewards ? earned.map(([, r]) => r) : earned.length ? [earned[earned.length - 1][1]] : []);
  const add = [];
  const remove = [];
  for (const [, roleId] of entries) {
    const role = manageable(member.guild, roleId);
    if (!role) continue;
    const has = member.roles.cache.has(roleId);
    if (keep.has(roleId) && !has) add.push(role);
    else if (!keep.has(roleId) && has) remove.push(role);
  }
  if (add.length) await member.roles.add(add, `Level ${level} reward`).catch(() => {});
  if (remove.length) await member.roles.remove(remove, `Level rewards sync (level ${level})`).catch(() => {});
  return { added: add, removed: remove };
}

async function announce(client, member, level, channel, s) {
  if (!s.announce) return;
  const target = (s.channel && member.guild.channels.cache.get(s.channel)) || channel;
  if (!target?.send) return;
  const text = template(s.message, {
    user: `<@${member.id}>`,
    username: member.user?.username ?? 'someone',
    mention: `<@${member.id}>`,
    level,
    server: member.guild.name,
  }).slice(0, 2000);
  await target.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
}

/**
 * Add (or with negative amount, remove) XP. Handles level-up announcements and reward roles.
 * Returns { oldLevel, newLevel, xp }.
 */
async function addXp(client, member, amount, { channel = null, silent = false } = {}) {
  const s = settings(member.guild.id);
  const rec = record(member.guild.id, member.id);
  const oldLevel = levelInfo(rec.xp).level;
  rec.xp = Math.max(0, Math.floor(rec.xp + amount));
  db.save();
  const newLevel = levelInfo(rec.xp).level;
  if (newLevel !== oldLevel) {
    if (newLevel > oldLevel && !silent) await announce(client, member, newLevel, channel, s);
    await syncRewards(member, newLevel, s);
  }
  return { oldLevel, newLevel, xp: rec.xp };
}

async function setTotalXp(member, xp) {
  const rec = record(member.guild.id, member.id);
  rec.xp = Math.max(0, Math.floor(xp));
  db.save();
  const level = levelInfo(rec.xp).level;
  await syncRewards(member, level);
  return level;
}

/** Member object or null (works with partial caches). */
async function getMember(guild, userId) {
  const m = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  return m?.user && m?.roles ? m : null;
}

const fmt = formatNumber;

module.exports = {
  DEFAULTS,
  key,
  settings,
  record,
  peek,
  xpForLevel,
  totalXpFor,
  levelInfo,
  guildRecords,
  rankOf,
  progressBar,
  multiplierFor,
  manageable,
  syncRewards,
  addXp,
  setTotalXp,
  getMember,
  fmt,
};
