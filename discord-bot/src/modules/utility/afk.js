'use strict';
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { discordTimestamp, formatDuration, truncate } = require('../../core/utils');
const { embed } = require('../../core/embeds');

const COL = 'afk';
const TAG = '[AFK] ';
const notified = new Map(); // `${channelId}:${userId}` -> last notice time (anti-spam)

const keyOf = (guildId, userId) => `${guildId}:${userId}`;

function canNick(member) {
  const me = member.guild.members.me;
  return !!me?.permissions?.has(PermissionFlagsBits.ManageNicknames) && member.manageable && member.id !== member.guild.ownerId;
}

async function clearAfk(message, entry) {
  const key = keyOf(message.guild.id, message.author.id);
  db.delete(COL, key);
  const member = message.member;
  if (entry.nicked && member && canNick(member) && member.displayName.startsWith(TAG)) {
    await member.setNickname(entry.oldNick ?? null, 'AFK cleared').catch(() => {});
  }
  const pings = entry.pings || [];
  const lines = [`👋 Welcome back ${message.author}! You were AFK for **${formatDuration(Date.now() - entry.since)}**.`];
  if (pings.length) {
    lines.push(`You were mentioned **${pings.length}** time(s):`);
    for (const p of pings.slice(-5)) lines.push(`• <@${p.by}> ${discordTimestamp(p.at, 'R')} — [jump](${p.url})`);
  }
  const reply = await message.channel.send({ embeds: [embed({ description: lines.join('\n') })], allowedMentions: { parse: [] } }).catch(() => null);
  if (reply && !pings.length) setTimeout(() => reply.delete().catch(() => {}), 10000).unref?.();
}

const commands = [
  {
    name: 'afk',
    aliases: ['away', 'brb'],
    description: 'Set yourself AFK; I tell people who mention you and clear it when you return',
    usage: '[reason]',
    examples: ['', 'eating dinner'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'reason', type: 'string', description: 'Why you are away', required: false, rest: true }],
    async execute(ctx) {
      const reason = truncate(ctx.rest(0) || 'AFK', 200);
      const member = ctx.member;
      const entry = { reason, since: Date.now(), oldNick: member?.nickname ?? null, nicked: false, pings: [] };
      if (member && canNick(member) && !member.displayName.startsWith(TAG)) {
        const ok = await member.setNickname(`${TAG}${member.displayName}`.slice(0, 32), 'AFK').then(() => true).catch(() => false);
        entry.nicked = ok;
      }
      db.set(COL, keyOf(ctx.guild.id, ctx.author.id), entry);
      await ctx.ok(`You're now AFK: **${reason}**`);
    },
  },
  {
    name: 'afklist',
    aliases: ['afkusers'],
    description: 'Who is AFK in this server',
    guildOnly: true,
    async execute(ctx) {
      const list = db.entries(COL).filter(([k]) => k.startsWith(`${ctx.guild.id}:`));
      if (!list.length) return ctx.info('Nobody is AFK right now.');
      const lines = list
        .sort((a, b) => a[1].since - b[1].since)
        .slice(0, 40)
        .map(([k, e]) => `💤 <@${k.split(':')[1]}> — ${truncate(e.reason, 60)} (${discordTimestamp(e.since, 'R')})`);
      await ctx.reply({ embeds: [ctx.embed({ title: `💤 AFK members (${list.length})`, description: lines.join('\n') })] });
    },
  },
];

const events = {
  async messageCreate(client, message, meta = {}) {
    if (!message.guild) return;
    const own = db.get(COL, keyOf(message.guild.id, message.author.id));
    const isAfkCommand = meta.prefix && /^(afk|away|brb)\b/i.test(message.content.slice(meta.prefix.length)) && message.content.startsWith(meta.prefix);
    if (own && !isAfkCommand && Date.now() - own.since > 3000) await clearAfk(message, own);

    const mentioned = [...message.mentions.users.values()].filter((u) => u.id !== message.author.id && !u.bot).slice(0, 5);
    const notices = [];
    for (const u of mentioned) {
      const key = keyOf(message.guild.id, u.id);
      const e = db.get(COL, key);
      if (!e) continue;
      const live = db.ensure(COL, key, e);
      live.pings = [...(live.pings || []), { by: message.author.id, at: Date.now(), url: message.url }].slice(-10);
      db.save();
      const throttle = `${message.channel.id}:${u.id}`;
      if (Date.now() - (notified.get(throttle) || 0) < 30000) continue;
      notified.set(throttle, Date.now());
      notices.push(`💤 **${u.username}** is AFK: ${truncate(e.reason, 200)} — ${discordTimestamp(e.since, 'R')}`);
    }
    if (notices.length) {
      await message.reply({ embeds: [embed({ description: notices.join('\n') })], allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    }
    if (notified.size > 2000) for (const [k, t] of notified) if (Date.now() - t > 60000) notified.delete(k);
    return false; // never swallow messages
  },
};

module.exports = { commands, events };
