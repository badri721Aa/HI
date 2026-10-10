import os from 'node:os'
import { config } from '../config.js'
import { getDb, group } from '../store.js'
import { fmtDuration, fmtNum, tag } from '../util.js'

const startedAt = Date.now()

export const commands = [
  {
    name: 'help',
    aliases: ['h'],
    desc: 'Categories, or details for one category/command',
    usage: '[category | command]',
    run: ({ reply, args, registry, prefix }) => {
      const q = args[0]?.toLowerCase().replace(prefix, '')
      if (q && registry.byName[q]) {
        const c = registry.byName[q]
        const flags = [c.admin && 'group admins', c.owner && 'owner only', c.botAdmin && 'bot must be admin', c.groupOnly && 'groups only'].filter(Boolean)
        return reply(
          `*${prefix}${c.name}* ${c.usage || ''}\n${c.desc}` +
            (c.aliases?.length ? `\nAliases: ${c.aliases.map((a) => prefix + a).join(', ')}` : '') +
            (flags.length ? `\n_${flags.join(' · ')}_` : ''),
        )
      }
      const cat = q && registry.categories.find((x) => x.name === q)
      if (cat) {
        return reply(`*${cat.title}*\n\n` + cat.commands.map((c) => `${prefix}${c.name}${c.usage ? ' ' + c.usage : ''} — ${c.desc}`).join('\n'))
      }
      return reply(
        `🤖 *${config.botName}* — ${registry.list.length} commands\n\n` +
          registry.categories.map((x) => `${x.emoji} *${x.name}* (${x.commands.length})`).join('\n') +
          `\n\nType *${prefix}help <category>* (e.g. ${prefix}help fun)\nor *${prefix}help <command>* for details.\n*${prefix}menu* shows everything.`,
      )
    },
  },
  {
    name: 'menu',
    aliases: ['commands', 'allcmds'],
    desc: 'Every command, grouped by category',
    run: ({ reply, registry, prefix }) =>
      reply(
        `🤖 *${config.botName}* — ${registry.list.length} commands\n` +
          registry.categories
            .map((x) => `\n${x.emoji} *${x.title}*\n` + x.commands.map((c) => prefix + c.name).join('  '))
            .join('\n'),
      ),
  },
  { name: 'ping', desc: 'Check the bot is alive (with response time)', run: ({ reply, msg }) => reply(`🏓 pong — ${Math.max(0, Date.now() - Number(msg.messageTimestamp) * 1000)} ms`) },
  { name: 'uptime', desc: 'How long the bot has been running', run: ({ reply }) => reply(`⏱️ Up for ${fmtDuration(Date.now() - startedAt)}`) },
  {
    name: 'botinfo',
    aliases: ['about'],
    desc: 'Bot version, mode and server stats',
    run: ({ reply, registry, prefix }) => {
      const db = getDb()
      reply(
        `🤖 *${config.botName}*\nCommands: ${registry.list.length}\nPrefix: ${prefix}\nMode: ${config.mode}\n` +
          `Groups with data: ${Object.keys(db.groups).length}\nCommands run: ${fmtNum(db.stats.commands)}\n` +
          `Uptime: ${fmtDuration(Date.now() - startedAt)}\nMemory: ${Math.round(process.memoryUsage().rss / 1e6)} MB\n` +
          `Node ${process.version} on ${os.platform()}`,
      )
    },
  },
  {
    name: 'owner',
    desc: "Who runs this bot",
    run: ({ sock, chat, reply }) => {
      const id = sock.user?.id
      if (!id) return reply('Unknown')
      return sock.sendMessage(chat, { text: `👑 This bot runs on ${tag(id)}`, mentions: [id.replace(/:\d+@/, '@')] })
    },
  },
  {
    name: 'rules',
    desc: 'Show the group rules',
    run: ({ reply, g }) => reply(`📜 *Group rules*\n${g?.rules || config.rules}`),
  },
  { name: 'id', aliases: ['jid'], desc: "This chat's ID (for ALLOWED_GROUPS)", run: ({ reply, chat }) => reply(chat) },
  {
    name: 'time',
    desc: 'Current time, optionally in a timezone',
    usage: '[Region/City]',
    run: ({ reply, args }) => {
      const tz = args[0]
      try {
        const s = new Date().toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' })
        reply(`🕒 ${s}${tz ? '' : '\n_Tip: !time Asia/Riyadh_'}`)
      } catch {
        reply('Unknown timezone. Examples: Europe/London, Asia/Dubai, America/New_York')
      }
    },
  },
  {
    name: 'worldclock',
    desc: 'Time in major cities',
    run: ({ reply }) => {
      const zones = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney']
      reply('🌍 *World clock*\n' + zones.map((z) => `${z.split('/')[1].replace('_', ' ')}: ${new Date().toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' })}`).join('\n'))
    },
  },
  {
    name: 'date',
    desc: "Today's date with day of the year and week number",
    run: ({ reply }) => {
      const d = new Date()
      const start = new Date(d.getFullYear(), 0, 1)
      const day = Math.floor((d - start) / 86400000) + 1
      reply(`📅 ${d.toDateString()}\nDay ${day} of the year · Week ${Math.ceil(day / 7)}`)
    },
  },
  {
    name: 'calendar',
    aliases: ['cal'],
    desc: 'Calendar for a month',
    usage: '[month] [year]',
    run: ({ reply, args }) => {
      const now = new Date()
      const m = args[0] ? Number(args[0]) - 1 : now.getMonth()
      const y = args[1] ? Number(args[1]) : now.getFullYear()
      if (!(m >= 0 && m < 12) || !(y > 0 && y < 10000)) return reply('Usage: !calendar 12 2026')
      const first = new Date(y, m, 1).getDay()
      const days = new Date(y, m + 1, 0).getDate()
      const cells = [...Array(first).fill('  '), ...Array.from({ length: days }, (_, i) => String(i + 1).padStart(2))]
      const rows = []
      for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(' '))
      reply('```\n' + new Date(y, m).toLocaleString('en-US', { month: 'long', year: 'numeric' }) + '\nSu Mo Tu We Th Fr Sa\n' + rows.join('\n') + '\n```')
    },
  },
  {
    name: 'stats',
    desc: 'Most used commands',
    run: ({ reply }) => {
      const { stats } = getDb()
      const top = Object.entries(stats.perCommand).sort((a, b) => b[1] - a[1]).slice(0, 10)
      reply(`📊 *Bot stats*\nTotal commands run: ${fmtNum(stats.commands)}\n\n` + (top.map(([n, c], i) => `${i + 1}. ${n} — ${c}`).join('\n') || 'No data yet'))
    },
  },
  {
    name: 'feedback',
    desc: 'Send a message to the bot owner',
    usage: '<message>',
    run: async ({ sock, text, reply, sender, senderName }) => {
      if (!text) return reply('Usage: !feedback your message')
      const me = sock.user?.id?.replace(/:\d+@/, '@')
      await sock.sendMessage(me, { text: `📩 Feedback from ${senderName} (${tag(sender)}):\n${text}` })
      reply('✅ Sent to the owner. Thanks!')
    },
  },
  {
    name: 'report',
    desc: 'Report a member to the admins',
    usage: '@user <reason>',
    groupOnly: true,
    run: ({ sock, chat, meta, targets, args, reply }) => {
      if (!targets.length) return reply('Usage: !report @user reason')
      const admins = meta.participants.filter((p) => p.admin).map((p) => p.id)
      const reason = args.filter((a) => !a.startsWith('@')).join(' ') || 'no reason given'
      return sock.sendMessage(chat, {
        text: `🚨 *Report*\nUser: ${targets.map(tag).join(' ')}\nReason: ${reason}\n\nAdmins: ${admins.map(tag).join(' ')}`,
        mentions: [...targets, ...admins],
      })
    },
  },
  {
    name: 'prefix',
    desc: 'Show the command prefix',
    run: ({ reply, prefix }) => reply(`The prefix is *${prefix}*`),
  },
  {
    name: 'settings',
    desc: "This group's bot settings",
    groupOnly: true,
    run: ({ reply, chat }) => {
      const g = group(chat)
      const on = (v) => (v ? '✅ on' : '❌ off')
      reply(
        `⚙️ *Group settings*\nWelcome: ${on(g.welcome)}\nAnti-link: ${on(g.antiLink)}\nAnti-spam: ${on(g.antiSpam)}\n` +
          `Bad-word filter: ${on(g.antiBadword)} (${g.badwords.length} words)\nLevel-up messages: ${on(g.levelUp)}\n` +
          `Warn limit: ${g.warnLimit}\nBot-banned users: ${g.banned.length}`,
      )
    },
  },
]
