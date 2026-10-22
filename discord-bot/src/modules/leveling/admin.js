'use strict';
const db = require('../../core/db');
const { formatNumber, parseToggle, template } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const lvl = require('./_lib');

const ADMIN = { guildOnly: true, userPerms: ['ManageGuild'] };

/** "<@user> <number>" -> { member, n } or replies with an error. */
async function memberAndNumber(ctx, { allowZero = true, max = 1e12 } = {}) {
  const user = await ctx.resolveUser(ctx.args[0]);
  if (!user || user.bot) {
    await ctx.fail('User not found (bots cannot have XP).');
    return null;
  }
  const n = Number(String(ctx.args[1] || '').replace(/[,_]/g, ''));
  if (!Number.isFinite(n) || n < (allowZero ? 0 : 1) || n > max || !Number.isInteger(n)) {
    await ctx.usage();
    return null;
  }
  const member = await lvl.getMember(ctx.guild, user.id);
  return { user, member, n };
}

/** Apply a new total XP; works even when the user has left (no role sync then). */
async function applyXp(ctx, user, member, xp) {
  if (member) return lvl.setTotalXp(member, xp);
  const rec = lvl.record(ctx.guild.id, user.id);
  rec.xp = Math.max(0, Math.floor(xp));
  db.save();
  return lvl.levelInfo(rec.xp).level;
}

function settingsEmbed(ctx, s) {
  const rewards = Object.entries(s.rewards).sort((a, b) => a[0] - b[0]);
  const roleMults = Object.entries(s.roleMultipliers);
  return ctx.embed({
    title: '⚙️ Leveling settings',
    fields: [
      { name: 'Leveling', value: s.enabled ? '✅ on' : '❌ off', inline: true },
      { name: 'Announcements', value: s.announce ? (s.channel ? `<#${s.channel}>` : 'same channel') : 'off', inline: true },
      { name: 'XP per message', value: `${s.xpMin}–${s.xpMax} every ${s.cooldown}s`, inline: true },
      { name: 'Server multiplier', value: `×${s.multiplier}`, inline: true },
      { name: 'Voice XP', value: s.voiceXp ? `${s.voiceXpPerMinute}/min` : 'off', inline: true },
      { name: 'Stack rewards', value: s.stackRewards ? 'yes' : 'no (only highest)', inline: true },
      { name: 'Level-up message', value: s.message },
      { name: `Rewards (${rewards.length})`, value: rewards.map(([l, r]) => `Lv ${l} → <@&${r}>`).join('\n') || 'none' },
      { name: 'Role multipliers', value: roleMults.map(([r, m]) => `<@&${r}> ×${m}`).join('\n') || 'none' },
      { name: 'No-XP channels', value: s.noXpChannels.map((c) => `<#${c}>`).join(' ') || 'none', inline: true },
      { name: 'No-XP roles', value: s.noXpRoles.map((r) => `<@&${r}>`).join(' ') || 'none', inline: true },
    ],
  });
}

module.exports = [
  {
    ...ADMIN,
    name: 'setxp',
    description: 'Admin: set a member\'s total XP',
    usage: '<@user> <xp>',
    examples: ['<@111111111111111111> 5000'],
    minArgs: 2,
    async execute(ctx) {
      const p = await memberAndNumber(ctx);
      if (!p) return;
      const level = await applyXp(ctx, p.user, p.member, p.n);
      await ctx.ok(`<@${p.user.id}> now has **${formatNumber(p.n)} XP** (level ${level}).`);
    },
  },
  {
    ...ADMIN,
    name: 'addxp',
    aliases: ['givexp'],
    description: 'Admin: give a member XP',
    usage: '<@user> <amount>',
    examples: ['<@111111111111111111> 250'],
    minArgs: 2,
    async execute(ctx) {
      const p = await memberAndNumber(ctx, { allowZero: false });
      if (!p) return;
      const rec = lvl.peek(ctx.guild.id, p.user.id);
      const level = await applyXp(ctx, p.user, p.member, (rec?.xp || 0) + p.n);
      await ctx.ok(`Gave <@${p.user.id}> **${formatNumber(p.n)} XP** (now level ${level}).`);
    },
  },
  {
    ...ADMIN,
    name: 'removexp',
    aliases: ['takexp'],
    description: 'Admin: take XP away from a member',
    usage: '<@user> <amount>',
    examples: ['<@111111111111111111> 100'],
    minArgs: 2,
    async execute(ctx) {
      const p = await memberAndNumber(ctx, { allowZero: false });
      if (!p) return;
      const rec = lvl.peek(ctx.guild.id, p.user.id);
      const level = await applyXp(ctx, p.user, p.member, (rec?.xp || 0) - p.n);
      await ctx.ok(`Removed **${formatNumber(p.n)} XP** from <@${p.user.id}> (now level ${level}).`);
    },
  },
  {
    ...ADMIN,
    name: 'setlevel',
    aliases: ['setlvl'],
    description: 'Admin: set a member\'s level (XP is set to the start of that level)',
    usage: '<@user> <level>',
    examples: ['<@111111111111111111> 10'],
    minArgs: 2,
    async execute(ctx) {
      const p = await memberAndNumber(ctx, { max: 1000 });
      if (!p) return;
      await applyXp(ctx, p.user, p.member, lvl.totalXpFor(p.n));
      await ctx.ok(`<@${p.user.id}> is now **level ${p.n}**.`);
    },
  },
  {
    ...ADMIN,
    name: 'resetxp',
    description: 'Admin: reset one member\'s XP and level',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    minArgs: 1,
    async execute(ctx) {
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (!lvl.peek(ctx.guild.id, user.id)) return ctx.fail(`<@${user.id}> has no XP.`);
      if (!(await confirm(ctx, `Reset all XP for <@${user.id}>?`))) return;
      db.delete('levels', lvl.key(ctx.guild.id, user.id));
      const member = await lvl.getMember(ctx.guild, user.id);
      if (member) await lvl.syncRewards(member, 0);
      await ctx.ok(`<@${user.id}>'s XP was reset.`);
    },
  },
  {
    ...ADMIN,
    name: 'resetlevels',
    aliases: ['resetallxp'],
    description: 'Admin: reset XP for EVERYONE in this server',
    cooldown: 10,
    async execute(ctx) {
      const rows = lvl.guildRecords(ctx.guild.id);
      if (!rows.length) return ctx.fail('Nobody has XP yet.');
      if (!(await confirm(ctx, `⚠️ Reset XP and levels for **${rows.length}** members? Reward roles are not removed automatically (use \`syncrewards\`).`))) return;
      for (const [id] of rows) db.delete('levels', lvl.key(ctx.guild.id, id));
      await ctx.ok(`Reset XP for ${rows.length} members.`);
    },
  },
  {
    ...ADMIN,
    name: 'levelrewards',
    aliases: ['rewards', 'lvlrewards'],
    description: 'List roles given automatically at certain levels',
    userPerms: [],
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const rows = Object.entries(s.rewards).sort((a, b) => a[0] - b[0]);
      if (!rows.length) return ctx.info('No level rewards yet. Admins can add one with `addlevelreward <level> <@role>`.');
      await ctx.reply({
        embeds: [ctx.embed({ title: '🎁 Level rewards', description: rows.map(([l, r]) => `**Level ${l}** → <@&${r}>${lvl.manageable(ctx.guild, r) ? '' : ' ⚠️ (I cannot assign this role — move my role above it)'}`).join('\n'), footer: s.stackRewards ? 'Members keep every reward they earn' : 'Members only keep their highest reward' })],
      });
    },
  },
  {
    ...ADMIN,
    name: 'addlevelreward',
    aliases: ['addreward'],
    description: 'Admin: give a role automatically at a level',
    usage: '<level> <@role>',
    examples: ['10 @Regular'],
    minArgs: 2,
    botPerms: ['ManageRoles'],
    async execute(ctx) {
      const level = parseInt(ctx.args[0], 10);
      if (!Number.isInteger(level) || level < 1 || level > 1000) return ctx.usage('Level must be 1–1000.');
      const role = ctx.resolveRole(ctx.rest(1));
      if (!role) return ctx.fail('Role not found.');
      if (!lvl.manageable(ctx.guild, role.id)) return ctx.fail(`I cannot assign ${role}: it must be below my highest role, not managed by an integration, and I need **Manage Roles**.`);
      const s = lvl.settings(ctx.guild.id);
      s.rewards[level] = role.id;
      db.save();
      await ctx.ok(`Members reaching **level ${level}** will get ${role}. Existing members get it on their next level-up (or run \`syncrewards all\`).`);
    },
  },
  {
    ...ADMIN,
    name: 'removelevelreward',
    aliases: ['delreward', 'removereward'],
    description: 'Admin: stop giving a role at a level',
    usage: '<level>',
    examples: ['10'],
    minArgs: 1,
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const level = String(parseInt(ctx.args[0], 10));
      if (!s.rewards[level]) return ctx.fail(`There is no reward at level ${ctx.args[0]}.`);
      delete s.rewards[level];
      db.save();
      await ctx.ok(`Removed the level ${level} reward.`);
    },
  },
  {
    ...ADMIN,
    name: 'stackrewards',
    description: 'Admin: keep all earned reward roles (on) or only the highest (off)',
    usage: '<on|off>',
    examples: ['on', 'off'],
    minArgs: 1,
    async execute(ctx) {
      const v = parseToggle(ctx.args[0]);
      if (v === null) return ctx.usage();
      lvl.settings(ctx.guild.id).stackRewards = v;
      db.save();
      await ctx.ok(v ? 'Members now keep every reward role they earn.' : 'Members now only keep their highest reward role.');
    },
  },
  {
    ...ADMIN,
    name: 'syncrewards',
    description: 'Admin: re-apply level reward roles to a member or everyone',
    usage: '<@user|all>',
    examples: ['<@111111111111111111>', 'all'],
    minArgs: 1,
    botPerms: ['ManageRoles'],
    cooldown: 30,
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      if (!Object.keys(s.rewards).length) return ctx.fail('There are no level rewards to sync.');
      const targets = [];
      if (ctx.args[0].toLowerCase() === 'all') {
        for (const [id, r] of lvl.guildRecords(ctx.guild.id)) targets.push([id, r.xp]);
      } else {
        const user = await ctx.resolveUser(ctx.args[0]);
        if (!user) return ctx.fail('User not found.');
        targets.push([user.id, lvl.peek(ctx.guild.id, user.id)?.xp || 0]);
      }
      await ctx.defer();
      let changed = 0;
      for (const [id, xp] of targets.slice(0, 2000)) {
        const member = await lvl.getMember(ctx.guild, id);
        if (!member) continue;
        const res = await lvl.syncRewards(member, lvl.levelInfo(xp).level, s);
        if (res.added.length || res.removed.length) changed++;
      }
      await ctx.ok(`Synced reward roles for ${targets.length} member(s); ${changed} changed.`);
    },
  },
  {
    ...ADMIN,
    name: 'noxpchannel',
    aliases: ['xpignorechannel'],
    description: 'Admin: toggle a channel (or category) where no XP is earned',
    usage: '<#channel>',
    examples: ['#spam'],
    minArgs: 1,
    async execute(ctx) {
      const ch = ctx.resolveChannel(ctx.args[0]);
      if (!ch) return ctx.fail('Channel not found.');
      const s = lvl.settings(ctx.guild.id);
      const i = s.noXpChannels.indexOf(ch.id);
      if (i >= 0) s.noXpChannels.splice(i, 1);
      else s.noXpChannels.push(ch.id);
      db.save();
      await ctx.ok(i >= 0 ? `${ch} earns XP again.` : `No XP will be earned in ${ch}.`);
    },
  },
  {
    ...ADMIN,
    name: 'noxprole',
    aliases: ['xpignorerole'],
    description: 'Admin: toggle a role that cannot earn XP',
    usage: '<@role>',
    examples: ['@Muted'],
    minArgs: 1,
    async execute(ctx) {
      const role = ctx.resolveRole(ctx.rest(0));
      if (!role) return ctx.fail('Role not found.');
      const s = lvl.settings(ctx.guild.id);
      const i = s.noXpRoles.indexOf(role.id);
      if (i >= 0) s.noXpRoles.splice(i, 1);
      else s.noXpRoles.push(role.id);
      db.save();
      await ctx.ok(i >= 0 ? `${role} can earn XP again.` : `Members with ${role} no longer earn XP.`);
    },
  },
  {
    ...ADMIN,
    name: 'xpmultiplier',
    aliases: ['xpmult', 'xprate'],
    description: 'Admin: set the server-wide XP multiplier (0.1–10)',
    usage: '<multiplier>',
    examples: ['2', '0.5'],
    minArgs: 1,
    async execute(ctx) {
      const m = Number(ctx.args[0].replace(/^x/i, ''));
      if (!Number.isFinite(m) || m < 0.1 || m > 10) return ctx.usage('Multiplier must be between 0.1 and 10.');
      lvl.settings(ctx.guild.id).multiplier = Math.round(m * 100) / 100;
      db.save();
      await ctx.ok(`Server XP multiplier set to **×${Math.round(m * 100) / 100}**.`);
    },
  },
  {
    ...ADMIN,
    name: 'rolemultiplier',
    aliases: ['rolexp', 'rolemult'],
    description: 'Admin: give a role an XP multiplier (highest one applies), or "off"',
    usage: '<@role> <multiplier|off>',
    examples: ['@Booster 2', '@Booster off'],
    minArgs: 2,
    async execute(ctx) {
      const last = ctx.args[ctx.args.length - 1];
      const role = ctx.resolveRole(ctx.args.slice(0, -1).join(' '));
      if (!role) return ctx.fail('Role not found.');
      const s = lvl.settings(ctx.guild.id);
      if (parseToggle(last) === false) {
        delete s.roleMultipliers[role.id];
        db.save();
        return ctx.ok(`Removed the XP multiplier for ${role}.`);
      }
      const m = Number(last.replace(/^x/i, ''));
      if (!Number.isFinite(m) || m < 0.1 || m > 10) return ctx.usage('Multiplier must be between 0.1 and 10.');
      s.roleMultipliers[role.id] = Math.round(m * 100) / 100;
      db.save();
      await ctx.ok(`Members with ${role} earn **×${s.roleMultipliers[role.id]}** XP.`);
    },
  },
  {
    ...ADMIN,
    name: 'levelmessage',
    aliases: ['lvlmsg', 'levelupmessage'],
    description: 'Admin: set the level-up message ({user} {username} {level} {server}) or "reset"',
    usage: '<message|reset>',
    examples: ['🎉 {user} hit level {level}!', 'reset'],
    minArgs: 1,
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const text = ctx.rest(0);
      s.message = text.toLowerCase() === 'reset' ? lvl.DEFAULTS.message : text.slice(0, 1500);
      db.save();
      await ctx.ok(`Level-up message set. Preview:\n${template(s.message, { user: `<@${ctx.author.id}>`, username: ctx.author.username, mention: `<@${ctx.author.id}>`, level: 5, server: ctx.guild.name })}`);
    },
  },
  {
    ...ADMIN,
    name: 'levelchannel',
    aliases: ['lvlchannel', 'levelupchannel'],
    description: 'Admin: where level-ups are announced (#channel, "here" = same channel, "off")',
    usage: '<#channel|here|off>',
    examples: ['#level-ups', 'here', 'off'],
    minArgs: 1,
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const arg = ctx.args[0].toLowerCase();
      if (arg === 'off' || arg === 'none') {
        s.announce = false;
        db.save();
        return ctx.ok('Level-up announcements are **off**.');
      }
      if (arg === 'here' || arg === 'same') {
        s.announce = true;
        s.channel = null;
        db.save();
        return ctx.ok('Level-ups will be announced in the channel where the member leveled up.');
      }
      const ch = ctx.resolveChannel(ctx.args[0]);
      if (!ch?.isTextBased?.()) return ctx.fail('Text channel not found.');
      s.announce = true;
      s.channel = ch.id;
      db.save();
      await ctx.ok(`Level-ups will be announced in ${ch}.`);
    },
  },
  {
    ...ADMIN,
    name: 'levelannounce',
    description: 'Admin: turn level-up announcements on or off',
    usage: '<on|off>',
    examples: ['on'],
    minArgs: 1,
    async execute(ctx) {
      const v = parseToggle(ctx.args[0]);
      if (v === null) return ctx.usage();
      lvl.settings(ctx.guild.id).announce = v;
      db.save();
      await ctx.ok(`Level-up announcements are **${v ? 'on' : 'off'}**.`);
    },
  },
  {
    ...ADMIN,
    name: 'leveling',
    aliases: ['togglelevels', 'levelsystem'],
    description: 'Admin: turn the whole leveling system on or off',
    usage: '<on|off>',
    examples: ['off', 'on'],
    minArgs: 1,
    async execute(ctx) {
      const v = parseToggle(ctx.args[0]);
      if (v === null) return ctx.usage();
      lvl.settings(ctx.guild.id).enabled = v;
      db.save();
      await ctx.ok(`Leveling is now **${v ? 'enabled' : 'disabled'}**.`);
    },
  },
  {
    ...ADMIN,
    name: 'voicexp',
    description: 'Admin: voice XP on/off, or XP per minute in voice',
    usage: '<on|off|xpPerMinute>',
    examples: ['on', '10', 'off'],
    minArgs: 1,
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const v = parseToggle(ctx.args[0]);
      if (v !== null) s.voiceXp = v;
      else {
        const n = parseInt(ctx.args[0], 10);
        if (!Number.isInteger(n) || n < 1 || n > 100) return ctx.usage('XP per minute must be 1–100.');
        s.voiceXp = true;
        s.voiceXpPerMinute = n;
      }
      db.save();
      await ctx.ok(s.voiceXp ? `Voice XP is **on**: ${s.voiceXpPerMinute} XP per minute (not while deafened, AFK or alone).` : 'Voice XP is **off**.');
    },
  },
  {
    ...ADMIN,
    name: 'xpconfig',
    aliases: ['xpsettings'],
    description: 'Admin: XP per message (min–max) and the cooldown in seconds',
    usage: '<min> <max> [cooldownSeconds]',
    examples: ['15 25 60', '5 10'],
    minArgs: 2,
    async execute(ctx) {
      const [min, max, cd] = ctx.args.map((a) => parseInt(a, 10));
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > 1000) return ctx.usage('Need 0 ≤ min ≤ max ≤ 1000.');
      if (ctx.args[2] !== undefined && (!Number.isInteger(cd) || cd < 0 || cd > 3600)) return ctx.usage('Cooldown must be 0–3600 seconds.');
      const s = lvl.settings(ctx.guild.id);
      s.xpMin = min;
      s.xpMax = max;
      if (ctx.args[2] !== undefined) s.cooldown = cd;
      db.save();
      await ctx.ok(`Members now earn **${min}–${max} XP** per message, at most once every **${s.cooldown}s**.`);
    },
  },
  {
    ...ADMIN,
    name: 'levelsettings',
    aliases: ['lvlsettings', 'levelconfig'],
    description: 'Show this server\'s leveling configuration',
    userPerms: [],
    async execute(ctx) {
      await ctx.reply({ embeds: [settingsEmbed(ctx, lvl.settings(ctx.guild.id))] });
    },
  },
  {
    ...ADMIN,
    name: 'testlevelup',
    aliases: ['previewlevelup'],
    description: 'Admin: preview the level-up announcement',
    async execute(ctx) {
      const s = lvl.settings(ctx.guild.id);
      const text = template(s.message, { user: `<@${ctx.author.id}>`, username: ctx.author.username, mention: `<@${ctx.author.id}>`, level: 10, server: ctx.guild.name });
      await ctx.reply({ content: `**Preview** (${s.announce ? (s.channel ? `sent to <#${s.channel}>` : 'sent in the same channel') : 'announcements are off'}):\n${text}`, allowedMentions: { parse: [] } });
    },
  },
];
