'use strict';
const db = require('../../core/db');
const { randInt, chunk, formatNumber } = require('../../core/utils');
const { paginate } = require('../../core/ui');
const lvl = require('./_lib');

// Several bot accounts in one process all receive the same message: count each message once.
const seen = new Set();
function firstTime(id) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 5000) {
    const it = seen.values();
    for (let i = 0; i < 2500; i++) seen.delete(it.next().value);
  }
  return true;
}

function blockedChannel(s, channel) {
  return s.noXpChannels.includes(channel.id) || (channel.parentId && s.noXpChannels.includes(channel.parentId));
}

async function onMessage(client, message) {
  if (!message.guild || !message.member || !firstTime(message.id)) return;
  const s = lvl.settings(message.guild.id);
  if (!s.enabled || blockedChannel(s, message.channel)) return;
  if (s.noXpRoles.some((r) => message.member.roles.cache.has(r))) return;
  const rec = lvl.record(message.guild.id, message.author.id);
  rec.messages += 1;
  const now = Date.now();
  if (now - rec.lastXp < s.cooldown * 1000) return void db.save();
  rec.lastXp = now;
  const amount = Math.round(randInt(s.xpMin, s.xpMax) * lvl.multiplierFor(message.member, s));
  await lvl.addXp(client, message.member, amount, { channel: message.channel });
}

/** Every minute: XP for members talking in voice (not deafened, not AFK, not alone). */
async function voiceTick(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const states = [...guild.voiceStates.cache.values()].filter((v) => v.channelId && v.member && !v.member.user.bot);
    if (!states.length) continue;
    const s = lvl.settings(guild.id);
    if (!s.enabled || !s.voiceXp || !(s.voiceXpPerMinute > 0)) continue;
    const byChannel = new Map();
    for (const v of states) {
      if (!byChannel.has(v.channelId)) byChannel.set(v.channelId, []);
      byChannel.get(v.channelId).push(v);
    }
    for (const [channelId, list] of byChannel) {
      if (channelId === guild.afkChannelId || list.length < 2) continue;
      const channel = guild.channels.cache.get(channelId);
      if (!channel || blockedChannel(s, channel)) continue;
      for (const v of list) {
        if (v.selfDeaf || v.deaf || s.noXpRoles.some((r) => v.member.roles.cache.has(r))) continue;
        const rec = lvl.record(guild.id, v.id);
        // Timestamp check keeps this idempotent when several bots share the guild.
        if (now - rec.lastVoiceXp < 55000) continue;
        rec.lastVoiceXp = now;
        rec.voiceMinutes += 1;
        const amount = Math.round(s.voiceXpPerMinute * lvl.multiplierFor(v.member, s));
        await lvl.addXp(client, v.member, amount, { channel: channel.isTextBased?.() ? channel : null });
      }
    }
  }
}

module.exports = {
  events: { messageCreate: onMessage },
  tasks: [{ name: 'voice-xp', interval: 60000, run: voiceTick }],
  commands: [
    {
      name: 'rank',
      aliases: ['level', 'lvl', 'xp'],
      description: 'Show your (or someone\'s) level, XP and rank',
      usage: '[@user]',
      examples: ['', '<@111111111111111111>'],
      guildOnly: true,
      slash: true,
      args: [{ name: 'user', type: 'user', description: 'Whose rank to show', required: false }],
      async execute(ctx) {
        const user = ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : ctx.author;
        if (!user) return ctx.fail('User not found.');
        if (user.bot) return ctx.fail('Bots do not earn XP.');
        const s = lvl.settings(ctx.guild.id);
        const rec = lvl.peek(ctx.guild.id, user.id) || { xp: 0, messages: 0, voiceMinutes: 0 };
        const info = lvl.levelInfo(rec.xp);
        const { rank, total } = lvl.rankOf(ctx.guild.id, user.id);
        const pct = Math.floor((info.current / info.needed) * 100);
        await ctx.reply({
          embeds: [
            ctx.embed({
              author: { name: `${user.username}'s rank`, iconURL: user.displayAvatarURL?.() },
              description: `**Level ${info.level}** • Rank **#${rank || '—'}**${total ? ` of ${total}` : ''}\n${lvl.progressBar(info.current, info.needed)} **${pct}%**\n${formatNumber(info.current)} / ${formatNumber(info.needed)} XP to level ${info.level + 1}`,
              fields: [
                { name: 'Total XP', value: formatNumber(rec.xp), inline: true },
                { name: 'Messages', value: formatNumber(rec.messages || 0), inline: true },
                { name: 'Voice time', value: `${formatNumber(rec.voiceMinutes || 0)} min`, inline: true },
              ],
              footer: s.enabled ? `Server XP multiplier: ×${s.multiplier}` : 'Leveling is turned off in this server',
            }),
          ],
        });
      },
    },
    {
      name: 'levels',
      aliases: ['xplb', 'levellb', 'toplevels'],
      description: 'The server\'s XP leaderboard',
      guildOnly: true,
      slash: true,
      args: [],
      async execute(ctx) {
        const rows = lvl
          .guildRecords(ctx.guild.id)
          .filter(([, r]) => r.xp > 0)
          .sort((a, b) => b[1].xp - a[1].xp);
        if (!rows.length) return ctx.info('Nobody has earned XP yet. Start chatting!');
        const me = rows.findIndex(([id]) => id === ctx.author.id);
        const medals = ['🥇', '🥈', '🥉'];
        const pages = chunk(rows, 10).map((page, p) =>
          ctx.embed({
            title: `📈 ${ctx.guild.name} — levels`,
            description: page
              .map(([id, r], i) => {
                const n = p * 10 + i;
                return `${medals[n] || `**${n + 1}.**`} <@${id}> — Level **${lvl.levelInfo(r.xp).level}** (${formatNumber(r.xp)} XP)`;
              })
              .join('\n'),
            footer: me >= 0 ? `Your rank: #${me + 1} of ${rows.length}` : `${rows.length} ranked members`,
          }),
        );
        await paginate(ctx, pages);
      },
    },
    {
      name: 'xpcalc',
      aliases: ['levelcalc'],
      description: 'How much XP (and roughly how many messages) a level takes',
      usage: '<level>',
      examples: ['10', '50'],
      minArgs: 1,
      async execute(ctx) {
        const target = parseInt(ctx.args[0], 10);
        if (!Number.isInteger(target) || target < 1 || target > 1000) return ctx.usage('Level must be between 1 and 1000.');
        const total = lvl.totalXpFor(target);
        const rec = ctx.guild ? lvl.peek(ctx.guild.id, ctx.author.id) : null;
        const have = rec?.xp || 0;
        const remaining = Math.max(0, total - have);
        const msgs = Math.ceil(remaining / 20); // average XP per eligible message
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: `🧮 Level ${target}`,
              description: `Total XP needed: **${formatNumber(total)}**\nXP for that single level: **${formatNumber(lvl.xpForLevel(target - 1))}**${ctx.guild ? `\nYou have **${formatNumber(have)}** XP — **${formatNumber(remaining)}** to go (~${formatNumber(msgs)} messages, at least ${formatNumber(msgs)} minutes of chatting).` : ''}`,
            }),
          ],
        });
      },
    },
  ],
};
