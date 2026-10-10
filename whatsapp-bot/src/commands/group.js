// Group info and member commands anyone can use.
import { group, user } from '../store.js'
import { fmtNum, pick, progressBar, shuffle, tag } from '../util.js'

export const levelFor = (xp) => Math.floor(Math.sqrt(xp / 50))
export const xpForLevel = (lvl) => lvl * lvl * 50

const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`

export const commands = [
  {
    name: 'info',
    aliases: ['groupinfo', 'ginfo'],
    desc: 'Group name, size, admins and creation date',
    groupOnly: true,
    run: ({ reply, meta }) => {
      const admins = meta.participants.filter((p) => p.admin).length
      const created = meta.creation ? new Date(meta.creation * 1000).toDateString() : 'unknown'
      reply(
        `👥 *${meta.subject}*\nMembers: ${meta.participants.length}\nAdmins: ${admins}\nCreated: ${created}\n` +
          `Messages: ${meta.announce ? 'admins only 🔒' : 'everyone'}\n\n${meta.desc || '_No description_'}`,
      )
    },
  },
  {
    name: 'admins',
    aliases: ['staff'],
    desc: 'List and mention the group admins',
    groupOnly: true,
    run: ({ sock, chat, meta }) => {
      const admins = meta.participants.filter((p) => p.admin)
      return sock.sendMessage(chat, {
        text: '🛡️ *Admins*\n' + admins.map((p) => `${p.admin === 'superadmin' ? '👑' : '•'} ${tag(p.id)}`).join('\n'),
        mentions: admins.map((p) => p.id),
      })
    },
  },
  { name: 'members', aliases: ['membercount'], desc: 'How many members are in the group', groupOnly: true, run: ({ reply, meta }) => reply(`👥 ${meta.participants.length} members`) },
  { name: 'desc', aliases: ['description'], desc: 'Show the group description', groupOnly: true, run: ({ reply, meta }) => reply(meta.desc || '_No description set_') },
  {
    name: 'whois',
    aliases: ['profile'],
    desc: 'Info about a member (or yourself)',
    usage: '[@user]',
    groupOnly: true,
    run: ({ sock, chat, meta, targets, sender, g }) => {
      const who = targets[0] || sender
      const p = meta.participants.find((x) => x.id === who)
      const u = user(who)
      const xp = g.xp[who] || 0
      return sock.sendMessage(chat, {
        text:
          `👤 ${tag(who)}\nRole: ${p?.admin ? (p.admin === 'superadmin' ? 'Owner 👑' : 'Admin 🛡️') : 'Member'}\n` +
          `Messages: ${fmtNum(g.msgCount[who] || 0)}\nLevel: ${levelFor(xp)} (${fmtNum(xp)} XP)\n` +
          `Warnings: ${g.warns[who] || 0}/${g.warnLimit}\nWallet: ${fmtNum(u.wallet)} 🪙 · Bank: ${fmtNum(u.bank)} 🪙` +
          (u.afk ? `\nAFK: ${u.afk.reason}` : ''),
        mentions: [who],
      })
    },
  },
  {
    name: 'pfp',
    aliases: ['avatar'],
    desc: "Get someone's profile picture",
    usage: '[@user]',
    run: async ({ sock, chat, targets, sender, reply, msg }) => {
      const who = targets[0] || sender
      try {
        const url = await sock.profilePictureUrl(who, 'image')
        await sock.sendMessage(chat, { image: { url }, caption: tag(who), mentions: [who] }, { quoted: msg })
      } catch {
        reply('No profile picture (or it is private).')
      }
    },
  },
  {
    name: 'groupicon',
    aliases: ['gpp'],
    desc: "Get the group's picture",
    groupOnly: true,
    run: async ({ sock, chat, reply, msg }) => {
      try {
        const url = await sock.profilePictureUrl(chat, 'image')
        await sock.sendMessage(chat, { image: { url } }, { quoted: msg })
      } catch {
        reply('This group has no picture.')
      }
    },
  },
  {
    name: 'rank',
    aliases: ['level', 'xp'],
    desc: 'Your level and XP (earned by chatting)',
    usage: '[@user]',
    groupOnly: true,
    run: ({ sock, chat, targets, sender, g }) => {
      const who = targets[0] || sender
      const xp = g.xp[who] || 0
      const lvl = levelFor(xp)
      const cur = xpForLevel(lvl)
      const next = xpForLevel(lvl + 1)
      const pos = Object.entries(g.xp).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === who) + 1
      return sock.sendMessage(chat, {
        text: `⭐ ${tag(who)}\nLevel ${lvl}${pos ? ` · Rank #${pos}` : ''}\n${progressBar((xp - cur) / (next - cur))} ${fmtNum(xp - cur)}/${fmtNum(next - cur)} XP`,
        mentions: [who],
      })
    },
  },
  {
    name: 'leaderboard',
    aliases: ['lb', 'top'],
    desc: 'Top 10 members by XP',
    groupOnly: true,
    run: ({ sock, chat, g, reply }) => {
      const top = Object.entries(g.xp).sort((a, b) => b[1] - a[1]).slice(0, 10)
      if (!top.length) return reply('No XP yet — start chatting!')
      return sock.sendMessage(chat, {
        text: '🏆 *Leaderboard*\n' + top.map(([id, xp], i) => `${medal(i)} ${tag(id)} — Lvl ${levelFor(xp)} (${fmtNum(xp)} XP)`).join('\n'),
        mentions: top.map(([id]) => id),
      })
    },
  },
  {
    name: 'topchatters',
    aliases: ['active'],
    desc: 'Members who sent the most messages',
    groupOnly: true,
    run: ({ sock, chat, g, reply }) => {
      const top = Object.entries(g.msgCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
      if (!top.length) return reply('No messages counted yet.')
      return sock.sendMessage(chat, {
        text: '💬 *Top chatters*\n' + top.map(([id, n], i) => `${medal(i)} ${tag(id)} — ${fmtNum(n)} msgs`).join('\n'),
        mentions: top.map(([id]) => id),
      })
    },
  },
  {
    name: 'inactive',
    aliases: ['silent'],
    desc: "Members who haven't sent a message since the bot joined",
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, meta, g, reply }) => {
      const quiet = meta.participants.map((p) => p.id).filter((id) => !g.msgCount[id])
      if (!quiet.length) return reply('Everyone has talked! 🎉')
      return sock.sendMessage(chat, { text: `😶 *Inactive members (${quiet.length})*\n` + quiet.map(tag).join('\n'), mentions: quiet })
    },
  },
  {
    name: 'afk',
    aliases: ['away'],
    desc: 'Set yourself away; the bot tells people who mention you',
    usage: '[reason]',
    run: ({ reply, text, u }) => {
      u.afk = { reason: text || 'AFK', since: Date.now() }
      reply(`💤 You're now AFK: ${u.afk.reason}\n_Send any message to come back._`)
    },
  },
  {
    name: 'randommember',
    aliases: ['pick', 'random'],
    desc: 'Pick a random member',
    groupOnly: true,
    run: ({ sock, chat, meta }) => {
      const p = pick(meta.participants).id
      return sock.sendMessage(chat, { text: `🎯 The chosen one: ${tag(p)}`, mentions: [p] })
    },
  },
  {
    name: 'who',
    desc: 'Ask "who is most likely to…" and the bot picks someone',
    usage: '<question>',
    groupOnly: true,
    run: ({ sock, chat, meta, text, reply }) => {
      if (!text) return reply('Usage: !who is most likely to become famous?')
      const p = pick(meta.participants).id
      return sock.sendMessage(chat, { text: `❓ Who ${text}\n👉 ${tag(p)}`, mentions: [p] })
    },
  },
  {
    name: 'couple',
    aliases: ['pair'],
    desc: 'Pick a random couple of the day 💞',
    groupOnly: true,
    run: ({ sock, chat, meta, reply }) => {
      if (meta.participants.length < 2) return reply('Need at least 2 members.')
      const [a, b] = shuffle(meta.participants).map((p) => p.id)
      return sock.sendMessage(chat, { text: `💞 Couple of the day: ${tag(a)} + ${tag(b)}`, mentions: [a, b] })
    },
  },
  {
    name: 'teams',
    desc: 'Split members into random teams',
    usage: '[number of teams]',
    groupOnly: true,
    run: ({ sock, chat, meta, args }) => {
      const n = Math.min(Math.max(Number(args[0]) || 2, 2), 10)
      const ids = shuffle(meta.participants.map((p) => p.id))
      const teams = Array.from({ length: n }, () => [])
      ids.forEach((id, i) => teams[i % n].push(id))
      return sock.sendMessage(chat, { text: teams.map((t, i) => `*Team ${i + 1}*\n${t.map(tag).join('\n')}`).join('\n\n'), mentions: ids })
    },
  },
  {
    name: 'mywarns',
    desc: 'How many warnings you have',
    groupOnly: true,
    run: ({ reply, g, sender }) => reply(`⚠️ You have ${g.warns[sender] || 0}/${g.warnLimit} warnings.`),
  },
]

