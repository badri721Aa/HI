'use strict';
/**
 * Anti-raid: detects join floods (N joins in X seconds) and switches the server
 * into "raid mode" (alert only, kick new joiners, or lock every channel), plus a
 * minimum-account-age gate for new members.
 */
const db = require('../../core/db');
const { colors } = require('../../core/embeds');
const { formatDuration, discordTimestamp, parseToggle } = require('../../core/utils');
const mod = require('../moderation/_lib');

const DEFAULTS = {
  enabled: false,
  joins: 8,
  seconds: 10,
  action: 'alert', // alert | kick | lockdown
  raidModeUntil: 0,
  raidModeMinutes: 10,
  minAccountAgeDays: 0,
};
const ACTIONS = ['alert', 'kick', 'lockdown'];

const settings = (guildId) => db.section(guildId, 'antiraid', DEFAULTS);
const joinLog = new Map(); // guildId -> [{ id, at }]

const inRaidMode = (cfg) => cfg.raidModeUntil > Date.now();

async function kickJoiner(member, reason) {
  if (!member.kickable) return false;
  await member.send({ embeds: [mod.actionEmbed(`👋 Removed from ${member.guild.name}`, `${reason}\nPlease try joining again later.`, colors.warn)] }).catch(() => {});
  return member.kick(reason).then(() => true).catch(() => false);
}

async function startRaidMode(client, guild, cfg, recentIds) {
  cfg.raidModeUntil = Date.now() + cfg.raidModeMinutes * 60000;
  db.save();
  let extra = '';
  if (cfg.action === 'lockdown') {
    const { locked } = await mod.lockdownGuild(guild, 'Anti-raid: join flood detected');
    extra = `\n🔒 Locked **${locked}** channel(s). Run \`unlockdown\` when it's over.`;
  } else if (cfg.action === 'kick') {
    let n = 0;
    for (const id of recentIds) {
      const m = guild.members.cache.get(id);
      if (m && !m.user.bot && (await kickJoiner(m, 'Anti-raid: join flood detected'))) n++;
    }
    extra = `\n👢 Kicked **${n}** recent joiner(s); new joiners are kicked until ${discordTimestamp(cfg.raidModeUntil, 't')}.`;
  }
  await mod.postModlog(
    guild,
    mod.actionEmbed(
      '🚨 Raid detected',
      `**${recentIds.length}** members joined within **${cfg.seconds}s**. Raid mode is on until ${discordTimestamp(cfg.raidModeUntil, 'T')}.${extra}`,
      colors.error,
    ),
    { content: `<@${guild.ownerId}>`, allowedMentions: { users: [guild.ownerId] } },
  );
}

async function onJoin(client, member) {
  const guild = member.guild;
  const raw = db.guild(guild.id).antiraid;
  if (!raw?.enabled && !raw?.minAccountAgeDays && !(raw?.raidModeUntil > Date.now())) return;
  if (!mod.claim(`raid:${guild.id}:${member.id}:${member.joinedTimestamp}`)) return;
  const cfg = settings(guild.id);
  if (member.user.bot) return;

  // Minimum account age gate (works even when join-flood detection is off).
  if (cfg.minAccountAgeDays > 0) {
    const age = Date.now() - member.user.createdTimestamp;
    if (age < cfg.minAccountAgeDays * 86400000) {
      const reason = `Account younger than ${cfg.minAccountAgeDays} day(s)`;
      if (await kickJoiner(member, `Anti-raid: ${reason}`)) {
        await mod.postModlog(guild, mod.actionEmbed('🧒 Young account kicked', `<@${member.id}> (${member.user.tag}) — account created ${discordTimestamp(member.user.createdTimestamp)}.`, colors.warn));
      }
      return;
    }
  }
  if (inRaidMode(cfg)) {
    if (cfg.action === 'kick') await kickJoiner(member, 'Anti-raid: server is in raid mode');
    return;
  }
  if (!cfg.enabled) return;

  const now = Date.now();
  const list = (joinLog.get(guild.id) || []).filter((j) => now - j.at < cfg.seconds * 1000);
  list.push({ id: member.id, at: now });
  joinLog.set(guild.id, list);
  if (list.length >= cfg.joins) {
    joinLog.set(guild.id, []);
    await startRaidMode(client, guild, cfg, list.map((j) => j.id));
  }
}

const commands = [
  {
    name: 'antiraid',
    aliases: ['raidprotection'],
    description: 'Show anti-raid status, or turn join-flood protection on/off',
    usage: '[on|off]',
    examples: ['', 'on', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      if (ctx.args[0]) {
        const state = parseToggle(ctx.args[0]);
        if (state === null) return ctx.usage();
        cfg.enabled = state;
        db.save();
        return ctx.ok(`Anti-raid is now **${state ? 'on' : 'off'}**${state && !mod.modlogChannel(ctx.guild) ? ` — set \`${ctx.prefix}setmodlog #channel\` to get raid alerts` : ''}.`);
      }
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🛡️ Anti-raid — ${cfg.enabled ? 'on' : 'off'}`,
            fields: [
              { name: 'Trigger', value: `${cfg.joins} joins in ${cfg.seconds}s`, inline: true },
              { name: 'Action', value: cfg.action, inline: true },
              { name: 'Raid mode', value: inRaidMode(cfg) ? `active until ${discordTimestamp(cfg.raidModeUntil, 'T')}` : 'inactive', inline: true },
              { name: 'Raid mode length', value: `${cfg.raidModeMinutes} min`, inline: true },
              { name: 'Min account age', value: cfg.minAccountAgeDays ? `${cfg.minAccountAgeDays} day(s)` : 'off', inline: true },
            ],
            footer: `Configure: ${ctx.prefix}raidthreshold, ${ctx.prefix}raidaction, ${ctx.prefix}raidmode, ${ctx.prefix}minage`,
          }),
        ],
      });
    },
  },
  {
    name: 'raidthreshold',
    aliases: ['raidlimit'],
    description: 'How many joins in how many seconds counts as a raid',
    usage: '<joins> <seconds>',
    examples: ['10 10', '5 3'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 2,
    async execute(ctx) {
      const joins = parseInt(ctx.args[0], 10);
      const seconds = parseInt(ctx.args[1], 10);
      if (!(joins >= 3 && joins <= 100) || !(seconds >= 1 && seconds <= 300)) return ctx.fail('Joins must be 3-100 and seconds 1-300.');
      const cfg = settings(ctx.guild.id);
      cfg.joins = joins;
      cfg.seconds = seconds;
      db.save();
      await ctx.ok(`A raid is now **${joins} joins within ${seconds}s**.`);
    },
  },
  {
    name: 'raidaction',
    aliases: ['raidpunish'],
    description: 'What happens in a raid: alert, kick new joiners, or lockdown all channels',
    usage: '<alert|kick|lockdown> [raid mode minutes]',
    examples: ['kick', 'lockdown 15', 'alert'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const action = ctx.args[0].toLowerCase();
      if (!ACTIONS.includes(action)) return ctx.usage();
      const cfg = settings(ctx.guild.id);
      if (ctx.args[1]) {
        const mins = parseInt(ctx.args[1], 10);
        if (!(mins >= 1 && mins <= 1440)) return ctx.fail('Raid mode length must be 1-1440 minutes.');
        cfg.raidModeMinutes = mins;
      }
      cfg.action = action;
      db.save();
      await ctx.ok(`During a raid I will **${action === 'alert' ? 'only alert the moderators' : action === 'kick' ? 'kick new joiners' : 'lock every channel'}** (raid mode lasts ${cfg.raidModeMinutes} min).`);
    },
  },
  {
    name: 'raidmode',
    description: 'Manually turn raid mode on (for N minutes) or off',
    usage: '<on [minutes]|off>',
    examples: ['on 30', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const state = parseToggle(ctx.args[0]);
      if (state === null) return ctx.usage();
      if (!state) {
        cfg.raidModeUntil = 0;
        db.save();
        const locked = mod.settings(ctx.guild.id).lockdownChannels?.length;
        return ctx.ok(`Raid mode is off.${locked ? ` ${locked} channel(s) are still locked — run \`${ctx.prefix}unlockdown\`.` : ''}`);
      }
      const mins = ctx.args[1] ? parseInt(ctx.args[1], 10) : cfg.raidModeMinutes;
      if (!(mins >= 1 && mins <= 1440)) return ctx.fail('Minutes must be 1-1440.');
      cfg.raidModeUntil = Date.now() + mins * 60000;
      db.save();
      await ctx.ok(`Raid mode is on for **${formatDuration(mins * 60000)}** (action: **${cfg.action}**${cfg.action === 'kick' ? ' — new joiners will be kicked' : ''}).`);
    },
  },
  {
    name: 'minage',
    aliases: ['agegate'],
    description: 'Kick new members whose Discord account is younger than N days',
    usage: '<days|off>',
    examples: ['7', 'off'],
    guildOnly: true,
    userPerms: ['ManageGuild'],
    botPerms: ['KickMembers'],
    minArgs: 1,
    async execute(ctx) {
      const cfg = settings(ctx.guild.id);
      const off = parseToggle(ctx.args[0]) === false;
      const days = off ? 0 : parseInt(ctx.args[0], 10);
      if (!off && !(days >= 1 && days <= 365)) return ctx.usage('Days must be 1-365 (or "off").');
      cfg.minAccountAgeDays = days;
      db.save();
      await ctx.ok(days ? `New accounts younger than **${days} day(s)** will be kicked on join.` : 'Account age gate disabled.');
    },
  },
];

module.exports = { commands, events: { guildMemberAdd: onJoin } };
