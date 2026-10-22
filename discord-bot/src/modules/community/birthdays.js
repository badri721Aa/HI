'use strict';
const db = require('../../core/db');
const { embed } = require('../../core/embeds');
const { template, truncate } = require('../../core/utils');
const { peek, claim, owns, postableChannel, checkRoleForConfig, roleProblem } = require('./_lib');

/**
 * Birthdays: collection "birthdays" `${guildId}:${userId}` -> { month, day, year|null }
 * Settings: guild section "birthdays" { channel, roleId, message, lastRun, holders: [userId], botId }
 * A task posts once per day (UTC) and gives the birthday role for that day.
 */
const COL = 'birthdays';
const DEFAULTS = { channel: null, roleId: null, message: '🎂 Happy birthday {mention}! Have an amazing day! 🎉', lastRun: null, holders: [], botId: null };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const section = (ctx) => db.section(ctx.guild.id, 'birthdays', DEFAULTS);

/** Accepts MM-DD, YYYY-MM-DD, "March 14", "14 March", "mar 14". Returns { month, day, year } or null. */
function parseDate(input) {
  const s = String(input || '').trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ');
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let year = null;
  let month;
  let day;
  if (m) [, year, month, day] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) [, month, day] = m.map(Number);
  else {
    const words = s.split(/\s+/).filter(Boolean);
    const mi = words.findIndex((w) => w.length >= 3 && MONTHS.some((n) => n.startsWith(w)));
    const di = words.findIndex((w) => /^\d{1,2}$/.test(w));
    const yi = words.findIndex((w) => /^\d{4}$/.test(w));
    if (mi < 0 || di < 0) return null;
    month = MONTHS.findIndex((n) => n.startsWith(words[mi])) + 1;
    day = Number(words[di]);
    if (yi >= 0) year = Number(words[yi]);
  }
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= DAYS_IN[month - 1])) return null;
  const nowYear = new Date().getUTCFullYear();
  if (year !== null && (year < 1900 || year > nowYear)) return null;
  return { month, day, year };
}

const fmt = (b) => `${MONTHS[b.month - 1].replace(/^./, (c) => c.toUpperCase())} ${b.day}${b.year ? `, ${b.year}` : ''}`;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Days from today (UTC) until the next occurrence. 0 = today. */
function daysUntil(b, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const y of [now.getUTCFullYear(), now.getUTCFullYear() + 1, now.getUTCFullYear() + 2]) {
    const day = b.month === 2 && b.day === 29 && !isLeap(y) ? 28 : b.day;
    const t = Date.UTC(y, b.month - 1, day);
    if (t >= today) return Math.round((t - today) / 86400000);
  }
  return 365;
}

async function runDaily(client) {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  for (const guild of client.guilds.cache.values()) {
    const cfg = peek(guild.id, 'birthdays');
    if (!cfg || !owns(cfg, client) || (!cfg.channel && !cfg.roleId) || cfg.lastRun === todayKey) continue;
    cfg.lastRun = todayKey;
    db.save();

    const todays = db
      .entries(COL)
      .filter(([k, b]) => k.startsWith(`${guild.id}:`) && daysUntil(b, now) === 0)
      .map(([k, b]) => ({ userId: k.split(':')[1], ...b }));

    const role = cfg.roleId && guild.roles.cache.get(cfg.roleId);
    if (role && !roleProblem(guild, role)) {
      for (const id of cfg.holders || []) {
        if (todays.some((t) => t.userId === id)) continue;
        const m = await guild.members.fetch(id).catch(() => null);
        await m?.roles.remove(role, 'Birthday over').catch(() => {});
      }
    }
    cfg.holders = [];

    const channel = cfg.channel && guild.channels.cache.get(cfg.channel);
    for (const b of todays) {
      const member = await guild.members.fetch(b.userId).catch(() => null);
      if (!member) continue;
      if (role && !roleProblem(guild, role)) {
        await member.roles.add(role, 'Birthday').catch(() => {});
        cfg.holders.push(member.id);
      }
      if (channel?.send) {
        const age = b.year ? now.getUTCFullYear() - b.year : null;
        const text = template(cfg.message, { mention: `<@${member.id}>`, user: member.displayName, username: member.user.username, server: guild.name, age: age ?? '' });
        await channel
          .send({
            content: `<@${member.id}>`,
            embeds: [embed({ color: 0xeb459e, title: '🎂 Happy Birthday!', description: text, thumbnail: member.user.displayAvatarURL() })],
            allowedMentions: { users: [member.id] },
          })
          .catch(() => {});
      }
    }
    db.save();
  }
}

module.exports = {
  commands: [
    {
      name: 'setbirthday',
      aliases: ['mybirthday', 'setbday'],
      description: 'Save your birthday (e.g. 03-14, March 14, 2001-03-14)',
      usage: '<date>',
      examples: ['03-14', 'March 14', '2001-03-14'],
      guildOnly: true,
      minArgs: 1,
      slash: true,
      args: [{ name: 'date', type: 'string', description: 'MM-DD, "March 14" or YYYY-MM-DD (year optional)', required: true, rest: true }],
      async execute(ctx) {
        const b = parseDate(ctx.rest(0));
        if (!b) return ctx.usage('I could not read that date. Try `03-14` or `March 14`.');
        db.set(COL, `${ctx.guild.id}:${ctx.author.id}`, b);
        const d = daysUntil(b);
        await ctx.ok(`Birthday saved: **${fmt(b)}** ${d === 0 ? '— that\'s today! 🎉' : `(in ${d} day${d === 1 ? '' : 's'})`}`);
      },
    },
    {
      name: 'removebirthday',
      aliases: ['delbirthday', 'forgetbirthday'],
      description: 'Remove your saved birthday',
      guildOnly: true,
      async execute(ctx) {
        if (!db.delete(COL, `${ctx.guild.id}:${ctx.author.id}`)) return ctx.fail('You have no birthday saved here.');
        await ctx.ok('Your birthday was removed.');
      },
    },
    {
      name: 'birthday',
      aliases: ['bday'],
      description: 'Show someone\'s birthday',
      usage: '[@user]',
      examples: ['', '@tester'],
      guildOnly: true,
      async execute(ctx) {
        const user = await ctx.targetUser(0);
        const b = db.get(COL, `${ctx.guild.id}:${user.id}`, null);
        if (!b) return ctx.info(user.id === ctx.author.id ? `You haven't set your birthday. Use \`${ctx.prefix}setbirthday March 14\`.` : `**${user.username}** hasn't set a birthday.`);
        const d = daysUntil(b);
        await ctx.info(`🎂 **${user.username}**'s birthday is **${fmt(b)}** — ${d === 0 ? 'today! 🎉' : `in **${d}** day${d === 1 ? '' : 's'}`}.`);
      },
    },
    {
      name: 'birthdays',
      aliases: ['upcomingbirthdays', 'bdays'],
      description: 'Upcoming birthdays in this server',
      guildOnly: true,
      async execute(ctx) {
        const list = db
          .entries(COL)
          .filter(([k]) => k.startsWith(`${ctx.guild.id}:`))
          .map(([k, b]) => ({ id: k.split(':')[1], b, d: daysUntil(b) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 15);
        if (!list.length) return ctx.info(`No birthdays saved yet. Add yours with \`${ctx.prefix}setbirthday\`.`);
        const lines = list.map((x) => `${x.d === 0 ? '🎉' : '🎂'} <@${x.id}> — ${fmt({ ...x.b, year: null })} ${x.d === 0 ? '**(today!)**' : `(in ${x.d}d)`}`);
        await ctx.reply({ embeds: [ctx.embed({ title: '🎂 Upcoming birthdays', description: lines.join('\n') })], allowedMentions: { parse: [] } });
      },
    },
    {
      name: 'birthdaychannel',
      description: 'Set where birthday wishes are posted',
      usage: '<#channel|off>',
      examples: ['#general'],
      guildOnly: true,
      userPerms: ['ManageGuild'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        if (ctx.args[0].toLowerCase() === 'off') {
          cfg.channel = null;
          db.save();
          return ctx.ok('Birthday announcements turned off.');
        }
        const { channel, error } = postableChannel(ctx, ctx.args[0]);
        if (error) return ctx.fail(error);
        cfg.channel = channel.id;
        claim(cfg, ctx.client);
        await ctx.ok(`Birthday wishes will be posted in ${channel} (checked daily, UTC).`);
      },
    },
    {
      name: 'birthdayrole',
      description: 'Give a role to members on their birthday (or "off")',
      usage: '<@role|off>',
      examples: ['off'],
      guildOnly: true,
      userPerms: ['ManageRoles'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        if (ctx.args[0].toLowerCase() === 'off') {
          cfg.roleId = null;
          db.save();
          return ctx.ok('Birthday role turned off.');
        }
        const role = ctx.resolveRole(ctx.rest(0));
        const problem = checkRoleForConfig(ctx, role);
        if (problem) return ctx.fail(problem);
        cfg.roleId = role.id;
        claim(cfg, ctx.client);
        await ctx.ok(`Members will get ${role} for the day on their birthday.`);
      },
    },
    {
      name: 'birthdaymsg',
      description: 'Set the birthday message ({mention} {user} {username} {server} {age})',
      usage: '<message>',
      examples: ['Happy birthday {mention}! 🎈'],
      guildOnly: true,
      userPerms: ['ManageGuild'],
      minArgs: 1,
      async execute(ctx) {
        const cfg = section(ctx);
        cfg.message = truncate(ctx.rest(0), 1500);
        claim(cfg, ctx.client);
        await ctx.ok('Birthday message updated.');
      },
    },
  ],
  tasks: [{ name: 'birthdays', interval: 10 * 60 * 1000, run: runDaily }],
};

module.exports.parseDate = parseDate;
module.exports.daysUntil = daysUntil;
