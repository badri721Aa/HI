'use strict';
/**
 * Profiles, reputation, marriage, gifts and automatically-earned badges.
 * Collections: "social" `${guild}:${user}` -> { bio, rep, lastRep, color }, "marriages" `${guild}:${user}` -> { partner, since }.
 */
const { ComponentType } = require('discord.js');
const db = require('../../core/db');
const { formatNumber, chunk, discordTimestamp } = require('../../core/utils');
const { paginate, confirm, button, row } = require('../../core/ui');
const eco = require('../economy/_lib');
const { ITEMS } = require('../economy/_items');
const { transferItem } = require('../economy/items');
const lvl = require('../leveling/_lib');

const REP_COOLDOWN = 24 * 60 * 60 * 1000;
const key = (g, u) => `${g}:${u}`;
const social = (g, u) => db.ensure('social', key(g, u), { bio: '', rep: 0, lastRep: 0, color: null });
const peekSocial = (g, u) => db.get('social', key(g, u), { bio: '', rep: 0, lastRep: 0, color: null });
const marriage = (g, u) => db.get('marriages', key(g, u), null);
const pendingProposals = new Set();

/** Everything a badge or the profile needs about a member. */
function snapshot(guildId, userId) {
  const acc = eco.peek(guildId, userId);
  const nw = acc ? eco.networth(acc, ITEMS).total : 0;
  const lv = lvl.peek(guildId, userId) || { xp: 0, messages: 0, voiceMinutes: 0 };
  const so = peekSocial(guildId, userId);
  const st = acc?.stats || {};
  return {
    acc,
    networth: nw,
    level: lvl.levelInfo(lv.xp).level,
    xp: lv.xp,
    messages: lv.messages || 0,
    voiceMinutes: lv.voiceMinutes || 0,
    rep: so.rep || 0,
    married: !!marriage(guildId, userId),
    gambled: st.gambled || 0,
    biggestWin: st.biggestWin || 0,
    shifts: acc?.shifts || 0,
    streak: acc?.streak || 0,
    caught: st.caught || 0,
    giftsGiven: st.giftsGiven || 0,
    robbed: st.robbed || 0,
    trophy: acc ? eco.itemCount(acc, 'trophy') : 0,
    crown: acc ? eco.itemCount(acc, 'crown') : 0,
  };
}

// value(snapshot) compared against target.
const BADGES = [
  { emoji: '💬', name: 'Regular', how: 'Send 100 messages', value: (d) => d.messages, target: 100 },
  { emoji: '🗣️', name: 'Chatterbox', how: 'Send 1,000 messages', value: (d) => d.messages, target: 1000 },
  { emoji: '🎙️', name: 'Voice Regular', how: 'Spend 10 hours in voice', value: (d) => d.voiceMinutes, target: 600 },
  { emoji: '⭐', name: 'Rising Star', how: 'Reach level 10', value: (d) => d.level, target: 10 },
  { emoji: '🌟', name: 'Veteran', how: 'Reach level 25', value: (d) => d.level, target: 25 },
  { emoji: '💫', name: 'Legend', how: 'Reach level 50', value: (d) => d.level, target: 50 },
  { emoji: '💵', name: 'Wealthy', how: 'Net worth of 100,000', value: (d) => d.networth, target: 100000 },
  { emoji: '💰', name: 'Millionaire', how: 'Net worth of 1,000,000', value: (d) => d.networth, target: 1000000 },
  { emoji: '👍', name: 'Liked', how: 'Receive 10 reputation', value: (d) => d.rep, target: 10 },
  { emoji: '🌠', name: 'Famous', how: 'Receive 50 reputation', value: (d) => d.rep, target: 50 },
  { emoji: '💞', name: 'Married', how: 'Get married', value: (d) => (d.married ? 1 : 0), target: 1 },
  { emoji: '💼', name: 'Hard Worker', how: 'Work 100 shifts', value: (d) => d.shifts, target: 100 },
  { emoji: '🔥', name: 'Dedicated', how: 'Reach a 7-day daily streak', value: (d) => d.streak, target: 7 },
  { emoji: '🎣', name: 'Gatherer', how: 'Catch/find 100 things (fish, hunt, mine, dig, chop)', value: (d) => d.caught, target: 100 },
  { emoji: '🎰', name: 'High Roller', how: 'Wager 100,000 in total', value: (d) => d.gambled, target: 100000 },
  { emoji: '🍀', name: 'Lucky', how: 'Win 50,000 profit in a single game', value: (d) => d.biggestWin, target: 50000 },
  { emoji: '🎀', name: 'Generous', how: 'Gift 10 items', value: (d) => d.giftsGiven, target: 10 },
  { emoji: '🦹', name: 'Master Thief', how: 'Steal 50,000 in total', value: (d) => d.robbed, target: 50000 },
  { emoji: '🏆', name: 'Trophy Owner', how: 'Own a Trophy', value: (d) => d.trophy, target: 1 },
  { emoji: '👑', name: 'Royalty', how: 'Own a Crown', value: (d) => d.crown, target: 1 },
];
const earnedBadges = (d) => BADGES.filter((b) => b.value(d) >= b.target);

async function userArg(ctx, i = 0) {
  if (!ctx.args[i]) return ctx.author;
  return ctx.resolveUser(ctx.args[i]);
}

module.exports = [
  {
    name: 'profile',
    aliases: ['pf', 'me', 'userprofile'],
    description: 'Your profile card: level, money, rep, marriage and badges',
    usage: '[@user]',
    examples: ['', '<@111111111111111111>'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Whose profile to show', required: false }],
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return ctx.fail('User not found.');
      if (user.bot) return ctx.fail('Bots do not have profiles.');
      const gid = ctx.guild.id;
      const d = snapshot(gid, user.id);
      const so = peekSocial(gid, user.id);
      const info = lvl.levelInfo(d.xp);
      const { rank } = lvl.rankOf(gid, user.id);
      const m = marriage(gid, user.id);
      const badges = earnedBadges(d);
      await ctx.reply({
        embeds: [
          ctx.embed({
            color: so.color ?? ctx.color,
            author: { name: `${user.username}'s profile`, iconURL: user.displayAvatarURL?.() },
            thumbnail: user.displayAvatarURL?.({ size: 256 }),
            description: so.bio ? `*${so.bio}*` : `*No bio yet — set one with \`setbio\`.*`,
            fields: [
              { name: '📈 Level', value: `**${info.level}** (rank #${rank || '—'})\n${lvl.progressBar(info.current, info.needed, 10)} ${Math.floor((info.current / info.needed) * 100)}%`, inline: true },
              { name: '💰 Net worth', value: `${eco.money(gid, d.networth)}${d.acc ? `\nWallet ${formatNumber(d.acc.wallet)} • Bank ${formatNumber(d.acc.bank)}` : ''}`, inline: true },
              { name: '👍 Reputation', value: `**${formatNumber(d.rep)}**`, inline: true },
              { name: '💞 Married to', value: m ? `<@${m.partner}> since ${discordTimestamp(m.since, 'D')}` : 'Nobody (yet)', inline: true },
              { name: '💼 Job', value: d.acc?.job ? `${d.acc.job} • ${d.shifts} shifts` : `Freelancer • ${d.shifts} shifts`, inline: true },
              { name: '🔥 Daily streak', value: `${d.streak} day${d.streak === 1 ? '' : 's'}`, inline: true },
              { name: `🏅 Badges (${badges.length}/${BADGES.length})`, value: badges.length ? badges.map((b) => b.emoji).join(' ') : 'None yet — see `badges`' },
            ],
            footer: `${formatNumber(d.messages)} messages • ${formatNumber(d.voiceMinutes)} voice minutes`,
          }),
        ],
      });
    },
  },
  {
    name: 'setbio',
    aliases: ['bio'],
    description: 'Set the bio shown on your profile (or "clear")',
    usage: '<text|clear>',
    examples: ['I love cats and coding', 'clear'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const text = ctx.rest(0);
      const so = social(ctx.guild.id, ctx.author.id);
      if (text.toLowerCase() === 'clear') {
        so.bio = '';
        db.save();
        return ctx.ok('Your bio was cleared.');
      }
      if (text.length > 200) return ctx.fail('Bios can be at most 200 characters.');
      so.bio = text.replace(/@(everyone|here)/gi, '@​$1').replace(/\n{3,}/g, '\n\n');
      db.save();
      await ctx.ok('Your bio was updated. Check it with `profile`.');
    },
  },
  {
    name: 'profilecolor',
    aliases: ['profilecolour'],
    description: 'Set your profile card colour (#hex) or "reset"',
    usage: '<#hex|reset>',
    examples: ['#ff66cc', 'reset'],
    guildOnly: true,
    minArgs: 1,
    async execute(ctx) {
      const so = social(ctx.guild.id, ctx.author.id);
      const v = ctx.args[0].toLowerCase();
      if (v === 'reset') {
        so.color = null;
        db.save();
        return ctx.ok('Profile colour reset.');
      }
      const m = v.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/);
      if (!m) return ctx.usage('Use a hex colour like `#ff66cc`.');
      const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
      so.color = parseInt(hex, 16);
      db.save();
      await ctx.reply({ embeds: [ctx.embed({ color: so.color, description: `✅ Profile colour set to **#${hex}**.` })] });
    },
  },
  {
    name: 'rep',
    aliases: ['reputation', 'giverep', 'thank'],
    description: 'Give someone +1 reputation (once every 24h), or check your rep',
    usage: '[@user]',
    examples: ['', '<@111111111111111111>'],
    guildOnly: true,
    slash: true,
    args: [{ name: 'user', type: 'user', description: 'Who gets +1 rep (leave empty to check yours)', required: false }],
    async execute(ctx) {
      const gid = ctx.guild.id;
      const me = social(gid, ctx.author.id);
      const left = Math.max(0, me.lastRep + REP_COOLDOWN - Date.now());
      if (!ctx.args[0]) {
        return ctx.info(`You have **${formatNumber(me.rep)}** reputation.\n${left ? `You can give rep again ${discordTimestamp(Date.now() + left, 'R')}.` : 'You can give someone rep right now: `rep @user`.'}`, '👍 Reputation');
      }
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (user.id === ctx.author.id) return ctx.fail('You cannot give rep to yourself.');
      if (user.bot) return ctx.fail('Bots do not need rep.');
      if (left) return ctx.fail(`You can give rep again ${discordTimestamp(Date.now() + left, 'R')}.`);
      const them = social(gid, user.id);
      them.rep += 1;
      me.lastRep = Date.now();
      db.save();
      await ctx.reply({ embeds: [ctx.embed({ description: `👍 <@${ctx.author.id}> gave <@${user.id}> **+1 rep**! They now have **${formatNumber(them.rep)}**.` })] });
    },
  },
  {
    name: 'replb',
    aliases: ['repleaderboard', 'toprep'],
    description: 'Members with the most reputation',
    guildOnly: true,
    async execute(ctx) {
      const p = `${ctx.guild.id}:`;
      const rows = db
        .entries('social')
        .filter(([k, v]) => k.startsWith(p) && v.rep > 0)
        .map(([k, v]) => [k.slice(p.length), v.rep])
        .sort((a, b) => b[1] - a[1]);
      if (!rows.length) return ctx.info('Nobody has reputation yet. Give some with `rep @user`!');
      const medals = ['🥇', '🥈', '🥉'];
      const pages = chunk(rows, 10).map((page, pi) =>
        ctx.embed({ title: '👍 Reputation leaderboard', description: page.map(([id, rep], i) => `${medals[pi * 10 + i] || `**${pi * 10 + i + 1}.**`} <@${id}> — **${formatNumber(rep)}** rep`).join('\n') }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'marry',
    aliases: ['propose'],
    description: 'Propose to someone (needs a 💍 Wedding Ring)',
    usage: '<@user>',
    examples: ['<@111111111111111111>'],
    guildOnly: true,
    minArgs: 1,
    cooldown: 10,
    async execute(ctx) {
      const gid = ctx.guild.id;
      const user = await ctx.resolveUser(ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      if (user.id === ctx.author.id) return ctx.fail('Self-love is great, but you cannot marry yourself.');
      if (user.bot) return ctx.fail('Bots cannot get married.');
      if (marriage(gid, ctx.author.id)) return ctx.fail('You are already married. `divorce` first.');
      if (marriage(gid, user.id)) return ctx.fail(`<@${user.id}> is already married.`);
      const acc = eco.account(gid, ctx.author.id);
      if (!eco.itemCount(acc, 'ring')) return ctx.fail(`You need a 💍 **Wedding Ring** to propose (\`buy ring\`, ${eco.money(gid, ITEMS.ring.price)}).`);
      const pk = `${gid}:${ctx.author.id}`;
      if (pendingProposals.has(pk)) return ctx.fail('You already have a proposal waiting for an answer.');
      pendingProposals.add(pk);

      const msg = await ctx.reply({
        content: `<@${user.id}>`,
        embeds: [ctx.embed({ title: '💍 A proposal!', description: `<@${ctx.author.id}> is asking <@${user.id}> to marry them!\n<@${user.id}>, do you accept? (60 seconds)` })],
        components: [row(button('mry:yes', 'Accept', 'Success', '💞'), button('mry:no', 'Decline', 'Danger', '💔'))],
        allowedMentions: { users: [user.id] },
      });
      if (!msg?.awaitMessageComponent) return void pendingProposals.delete(pk);
      try {
        const i = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 60000, filter: (x) => x.customId.startsWith('mry:') && x.user.id === user.id });
        if (i.customId === 'mry:no') {
          return await i.update({ content: null, embeds: [ctx.embed({ description: `💔 <@${user.id}> declined <@${ctx.author.id}>'s proposal.` })], components: [] });
        }
        // Re-check everything: state may have changed while waiting.
        if (marriage(gid, ctx.author.id) || marriage(gid, user.id)) {
          return await i.update({ content: null, embeds: [ctx.embed({ description: '❌ One of you got married in the meantime!' })], components: [] });
        }
        if (!eco.removeItem(acc, 'ring')) {
          return await i.update({ content: null, embeds: [ctx.embed({ description: `❌ <@${ctx.author.id}> no longer has a wedding ring!` })], components: [] });
        }
        const since = Date.now();
        db.set('marriages', key(gid, ctx.author.id), { partner: user.id, since });
        db.set('marriages', key(gid, user.id), { partner: ctx.author.id, since });
        await i.update({ content: null, embeds: [ctx.embed({ title: '💒 Just married!', description: `🎉 <@${ctx.author.id}> and <@${user.id}> are now married! Congratulations! 💞` })], components: [] });
      } catch {
        await msg.edit({ content: null, embeds: [ctx.embed({ description: `⌛ <@${user.id}> did not answer in time. The ring stays with <@${ctx.author.id}>.` })], components: [] }).catch(() => {});
      } finally {
        pendingProposals.delete(pk);
      }
    },
  },
  {
    name: 'divorce',
    description: 'End your marriage',
    guildOnly: true,
    async execute(ctx) {
      const gid = ctx.guild.id;
      const m = marriage(gid, ctx.author.id);
      if (!m) return ctx.fail('You are not married.');
      if (!(await confirm(ctx, `Divorce <@${m.partner}>? 💔`))) return;
      if (!marriage(gid, ctx.author.id)) return;
      db.delete('marriages', key(gid, ctx.author.id));
      if (marriage(gid, m.partner)?.partner === ctx.author.id) db.delete('marriages', key(gid, m.partner));
      await ctx.reply({ embeds: [ctx.embed({ description: `💔 <@${ctx.author.id}> and <@${m.partner}> are now divorced.` })] });
    },
  },
  {
    name: 'spouse',
    aliases: ['partner', 'marriage'],
    description: 'See who you (or someone) are married to',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user) return ctx.fail('User not found.');
      const m = marriage(ctx.guild.id, user.id);
      if (!m) return ctx.info(`${user.id === ctx.author.id ? 'You are' : `<@${user.id}> is`} not married.`);
      const days = Math.floor((Date.now() - m.since) / 86400000);
      await ctx.info(`💞 <@${user.id}> is married to <@${m.partner}> since ${discordTimestamp(m.since, 'D')} (**${days}** day${days === 1 ? '' : 's'}).`);
    },
  },
  {
    name: 'couples',
    aliases: ['marriages'],
    description: 'All married couples in this server',
    guildOnly: true,
    async execute(ctx) {
      const p = `${ctx.guild.id}:`;
      const seen = new Set();
      const pairs = [];
      for (const [k, v] of db.entries('marriages')) {
        if (!k.startsWith(p)) continue;
        const a = k.slice(p.length);
        const pairKey = [a, v.partner].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        pairs.push([a, v.partner, v.since]);
      }
      if (!pairs.length) return ctx.info('Nobody is married here yet. 💍 `buy ring` then `marry @user`!');
      pairs.sort((x, y) => x[2] - y[2]);
      const pages = chunk(pairs, 10).map((page) =>
        ctx.embed({ title: '💒 Couples', description: page.map(([a, b, since]) => `💞 <@${a}> & <@${b}> — since ${discordTimestamp(since, 'D')}`).join('\n') }),
      );
      await paginate(ctx, pages);
    },
  },
  {
    name: 'gift',
    aliases: ['present'],
    description: 'Gift an item from your inventory to someone',
    usage: '<@user> <item> [amount]',
    examples: ['<@111111111111111111> cookie'],
    guildOnly: true,
    minArgs: 2,
    cooldown: 3,
    execute: (ctx) => transferItem(ctx, { gift: true }),
  },
  {
    name: 'badges',
    aliases: ['achievements'],
    description: 'Badges you have earned and your progress toward the rest',
    usage: '[@user]',
    examples: [''],
    guildOnly: true,
    async execute(ctx) {
      const user = await userArg(ctx);
      if (!user || user.bot) return ctx.fail('User not found.');
      const d = snapshot(ctx.guild.id, user.id);
      const lines = BADGES.map((b) => {
        const v = b.value(d);
        return v >= b.target ? `${b.emoji} **${b.name}** — ✅ earned` : `🔒 **${b.name}** — ${b.how} (${formatNumber(Math.min(v, b.target))}/${formatNumber(b.target)})`;
      });
      const earned = earnedBadges(d).length;
      const pages = chunk(lines, 10).map((page) => ctx.embed({ title: `🏅 ${user.username}'s badges (${earned}/${BADGES.length})`, description: page.join('\n') }));
      await paginate(ctx, pages);
    },
  },
];
