// Group management — every command here is for group admins.
import { config } from '../config.js'
import { getMedia } from '../media.js'
import { fmtDuration, parseDuration, tag } from '../util.js'

const onOff = (arg) => (arg === 'on' ? true : arg === 'off' ? false : null)

// Builds an on/off switch command for a per-group setting.
const toggle = (name, field, label, aliases = []) => ({
  name,
  aliases,
  desc: `Turn ${label} on or off`,
  usage: 'on|off',
  admin: true,
  groupOnly: true,
  run: ({ reply, args, g }) => {
    const v = onOff(args[0]?.toLowerCase())
    if (v === null) return reply(`${label} is ${g[field] ? 'ON' : 'OFF'}. Use: !${name} on|off`)
    g[field] = v
    reply(`✅ ${label} ${v ? 'enabled' : 'disabled'}`)
  },
})

// Builds a command that applies a participant action to mentioned/replied users.
const participantAction = (name, action, desc, done, aliases = []) => ({
  name,
  aliases,
  desc,
  usage: '@user',
  admin: true,
  botAdmin: true,
  groupOnly: true,
  run: async ({ sock, chat, targets, reply }) => {
    if (!targets.length) return reply(`Mention someone or reply to their message: !${name} @user`)
    await sock.groupParticipantsUpdate(chat, targets, action)
    if (done) reply(done)
  },
})

const groupSetting = (name, setting, done, desc) => ({
  name,
  desc,
  admin: true,
  botAdmin: true,
  groupOnly: true,
  run: async ({ sock, chat, reply }) => {
    await sock.groupSettingUpdate(chat, setting)
    reply(done)
  },
})

export async function addWarning(ctx, who, reason) {
  const { sock, chat, g } = ctx
  g.warns[who] = (g.warns[who] || 0) + 1
  const n = g.warns[who]
  if (n >= g.warnLimit) {
    g.warns[who] = 0
    await sock.sendMessage(chat, { text: `⛔ ${tag(who)} reached ${g.warnLimit} warnings and was removed.`, mentions: [who] })
    if (ctx.botIsAdmin()) await sock.groupParticipantsUpdate(chat, [who], 'remove')
    else await sock.sendMessage(chat, { text: '_(Make me an admin so I can remove them automatically.)_' })
    return
  }
  await sock.sendMessage(chat, { text: `⚠️ ${tag(who)} warned (${n}/${g.warnLimit})${reason ? `\nReason: ${reason}` : ''}`, mentions: [who] })
}

export const commands = [
  {
    name: 'tagall',
    aliases: ['everyone', 'all'],
    desc: 'Mention every member',
    usage: '[message]',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, meta, text, msg }) => {
      const ids = meta.participants.map((p) => p.id)
      return sock.sendMessage(chat, { text: `📢 ${text || 'Attention everyone'}\n\n${ids.map(tag).join(' ')}`, mentions: ids }, { quoted: msg })
    },
  },
  {
    name: 'hidetag',
    aliases: ['ht'],
    desc: 'Notify everyone without listing their names',
    usage: '<message>',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, meta, text, quoted }) =>
      sock.sendMessage(chat, { text: text || quoted?.text || '📢', mentions: meta.participants.map((p) => p.id) }),
  },
  {
    name: 'announce',
    desc: 'Post a formatted announcement and notify everyone',
    usage: '<message>',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, meta, text, reply, senderName }) => {
      if (!text) return reply('Usage: !announce message')
      return sock.sendMessage(chat, {
        text: `📣 *ANNOUNCEMENT*\n━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━\n— ${senderName}`,
        mentions: meta.participants.map((p) => p.id),
      })
    },
  },
  participantAction('kick', 'remove', 'Remove members (mention or reply)', '👢 Removed', ['remove']),
  participantAction('promote', 'promote', 'Make members admin', '✅ Promoted'),
  participantAction('demote', 'demote', 'Remove admin rights', '✅ Demoted'),
  {
    name: 'add',
    desc: 'Add a member by phone number',
    usage: '<number with country code>',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, args, reply }) => {
      const nums = args.map((a) => a.replace(/\D/g, '')).filter((n) => n.length >= 8)
      if (!nums.length) return reply('Usage: !add 9665xxxxxxxx')
      const res = await sock.groupParticipantsUpdate(chat, nums.map((n) => `${n}@s.whatsapp.net`), 'add')
      reply(res.map((r) => `${r.jid?.split('@')[0]}: ${r.status === '200' ? '✅ added' : r.status === '403' ? '📨 privacy settings — invite sent' : r.status === '409' ? 'already in group' : `failed (${r.status})`}`).join('\n'))
    },
  },
  groupSetting('lock', 'announcement', '🔒 Group locked — only admins can send messages', 'Only admins can send messages'),
  groupSetting('unlock', 'not_announcement', '🔓 Group unlocked — everyone can send messages', 'Everyone can send messages'),
  groupSetting('lockinfo', 'locked', '🔒 Only admins can edit group info now', 'Only admins can edit name/icon/description'),
  groupSetting('unlockinfo', 'unlocked', '🔓 Everyone can edit group info now', 'Everyone can edit name/icon/description'),
  {
    name: 'mute',
    desc: 'Lock the group for a while, then unlock automatically',
    usage: '<duration e.g. 30m, 2h>',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, args, reply, g }) => {
      const ms = parseDuration(args[0] || '')
      if (!ms) return reply('Usage: !mute 30m (or 2h, 1d)')
      await sock.groupSettingUpdate(chat, 'announcement')
      g.muteUntil = Date.now() + ms
      reply(`🔇 Group muted for ${fmtDuration(ms)}`)
    },
  },
  {
    name: 'setname',
    aliases: ['setsubject'],
    desc: 'Change the group name',
    usage: '<new name>',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, text, reply }) => {
      if (!text) return reply('Usage: !setname New group name')
      await sock.groupUpdateSubject(chat, text.slice(0, 100))
      reply('✅ Group name updated')
    },
  },
  {
    name: 'setdesc',
    desc: 'Change the group description',
    usage: '<text>',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, text, reply }) => {
      await sock.groupUpdateDescription(chat, text || undefined)
      reply('✅ Description updated')
    },
  },
  {
    name: 'setpic',
    aliases: ['seticon'],
    desc: 'Set the group picture (send or reply to an image)',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async (ctx) => {
      const media = await getMedia(ctx, ['imageMessage'])
      if (!media) return ctx.reply('Send an image with !setpic as caption, or reply to an image.')
      await ctx.sock.updateProfilePicture(ctx.chat, media.buffer)
      ctx.reply('✅ Group picture updated')
    },
  },
  {
    name: 'link',
    aliases: ['invite'],
    desc: "Get the group's invite link",
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, reply }) => reply(`🔗 https://chat.whatsapp.com/${await sock.groupInviteCode(chat)}`),
  },
  {
    name: 'revoke',
    aliases: ['resetlink'],
    desc: 'Reset the invite link (old one stops working)',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, reply }) => reply(`🔗 New link: https://chat.whatsapp.com/${await sock.groupRevokeInvite(chat)}`),
  },
  {
    name: 'delete',
    aliases: ['del'],
    desc: 'Delete the message you reply to',
    admin: true,
    groupOnly: true,
    run: async ({ sock, chat, quoted, reply, botIsAdmin, isMine }) => {
      if (!quoted) return reply('Reply to the message you want to delete.')
      if (!isMine(quoted.sender) && !botIsAdmin()) return reply('⚠️ Make me an admin to delete other people’s messages.')
      await sock.sendMessage(chat, { delete: { remoteJid: chat, id: quoted.id, participant: quoted.sender, fromMe: isMine(quoted.sender) } })
    },
  },
  {
    name: 'warn',
    desc: 'Warn a member; they are removed at the warn limit',
    usage: '@user [reason]',
    admin: true,
    groupOnly: true,
    run: async (ctx) => {
      if (!ctx.targets.length) return ctx.reply('Usage: !warn @user reason')
      const reason = ctx.args.filter((a) => !a.startsWith('@')).join(' ')
      for (const t of ctx.targets) await addWarning(ctx, t, reason)
    },
  },
  {
    name: 'unwarn',
    desc: 'Remove one warning',
    usage: '@user',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, targets, g, reply }) => {
      if (!targets.length) return reply('Usage: !unwarn @user')
      for (const t of targets) g.warns[t] = Math.max(0, (g.warns[t] || 0) - 1)
      return sock.sendMessage(chat, { text: targets.map((t) => `✅ ${tag(t)}: ${g.warns[t]}/${g.warnLimit}`).join('\n'), mentions: targets })
    },
  },
  {
    name: 'warnings',
    aliases: ['warns'],
    desc: 'Show warnings for a member or the whole group',
    usage: '[@user]',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, targets, g, reply }) => {
      const list = (targets.length ? targets.map((t) => [t, g.warns[t] || 0]) : Object.entries(g.warns)).filter(([, n]) => n || targets.length)
      if (!list.length) return reply('No warnings 😇')
      return sock.sendMessage(chat, { text: '⚠️ *Warnings*\n' + list.map(([id, n]) => `${tag(id)}: ${n}/${g.warnLimit}`).join('\n'), mentions: list.map(([id]) => id) })
    },
  },
  {
    name: 'resetwarn',
    aliases: ['clearwarns'],
    desc: "Clear a member's warnings (or everyone's with 'all')",
    usage: '@user | all',
    admin: true,
    groupOnly: true,
    run: ({ targets, args, g, reply }) => {
      if (args[0] === 'all') {
        g.warns = {}
        return reply('✅ All warnings cleared')
      }
      if (!targets.length) return reply('Usage: !resetwarn @user  or  !resetwarn all')
      for (const t of targets) delete g.warns[t]
      reply('✅ Warnings cleared')
    },
  },
  {
    name: 'setwarnlimit',
    desc: 'Warnings before auto-removal',
    usage: '<number>',
    admin: true,
    groupOnly: true,
    run: ({ args, g, reply }) => {
      const n = Number(args[0])
      if (!Number.isInteger(n) || n < 1 || n > 20) return reply('Usage: !setwarnlimit 3 (1–20)')
      g.warnLimit = n
      reply(`✅ Warn limit set to ${n}`)
    },
  },
  toggle('antilink', 'antiLink', 'Anti-link (deletes links from non-admins)'),
  toggle('antispam', 'antiSpam', 'Anti-spam (warns people who flood the chat)'),
  toggle('antibadword', 'antiBadword', 'Bad-word filter', ['filter']),
  toggle('welcome', 'welcome', 'Welcome & goodbye messages'),
  toggle('levelup', 'levelUp', 'Level-up announcements'),
  {
    name: 'addbadword',
    desc: 'Add words to the filter',
    usage: '<word> [word…]',
    admin: true,
    groupOnly: true,
    run: ({ args, g, reply }) => {
      if (!args.length) return reply('Usage: !addbadword word1 word2')
      for (const w of args) if (!g.badwords.includes(w.toLowerCase())) g.badwords.push(w.toLowerCase())
      reply(`✅ Filter has ${g.badwords.length} words${g.antiBadword ? '' : '\nTurn it on with !antibadword on'}`)
    },
  },
  {
    name: 'delbadword',
    desc: 'Remove words from the filter',
    usage: '<word>',
    admin: true,
    groupOnly: true,
    run: ({ args, g, reply }) => {
      g.badwords = g.badwords.filter((w) => !args.map((a) => a.toLowerCase()).includes(w))
      reply(`✅ Filter has ${g.badwords.length} words`)
    },
  },
  {
    name: 'badwords',
    desc: 'List filtered words',
    admin: true,
    groupOnly: true,
    run: ({ g, reply }) => reply(g.badwords.length ? `🚫 ${g.badwords.join(', ')}` : 'The filter list is empty.'),
  },
  {
    name: 'setwelcome',
    desc: 'Custom welcome text ({user} {group} {count} {desc})',
    usage: '<text> | reset',
    admin: true,
    groupOnly: true,
    run: ({ text, g, reply }) => {
      g.welcomeMsg = text && text !== 'reset' ? text : null
      reply(g.welcomeMsg ? '✅ Welcome message saved' : '✅ Welcome message reset to default')
    },
  },
  {
    name: 'setgoodbye',
    desc: 'Custom goodbye text ({user} {group} {count})',
    usage: '<text> | reset',
    admin: true,
    groupOnly: true,
    run: ({ text, g, reply }) => {
      g.goodbyeMsg = text && text !== 'reset' ? text : null
      reply(g.goodbyeMsg ? '✅ Goodbye message saved' : '✅ Goodbye message reset to default')
    },
  },
  {
    name: 'setrules',
    desc: 'Set the rules shown by !rules',
    usage: '<text> | reset',
    admin: true,
    groupOnly: true,
    run: ({ text, g, reply }) => {
      g.rules = text && text !== 'reset' ? text : null
      reply('✅ Rules updated\n\n' + (g.rules || config.rules))
    },
  },
  {
    name: 'botban',
    desc: 'Stop a member from using the bot in this group',
    usage: '@user',
    admin: true,
    groupOnly: true,
    run: ({ targets, g, reply }) => {
      if (!targets.length) return reply('Usage: !botban @user')
      for (const t of targets) if (!g.banned.includes(t)) g.banned.push(t)
      reply('🚫 Banned from using the bot')
    },
  },
  {
    name: 'botunban',
    desc: 'Let a member use the bot again',
    usage: '@user',
    admin: true,
    groupOnly: true,
    run: ({ targets, g, reply }) => {
      g.banned = g.banned.filter((b) => !targets.includes(b))
      reply('✅ Unbanned')
    },
  },
  {
    name: 'banlist',
    desc: 'Members banned from the bot',
    admin: true,
    groupOnly: true,
    run: ({ sock, chat, g, reply }) =>
      g.banned.length ? sock.sendMessage(chat, { text: '🚫 *Bot-banned*\n' + g.banned.map(tag).join('\n'), mentions: g.banned }) : reply('Nobody is banned.'),
  },
  {
    name: 'resetxp',
    desc: "Reset a member's XP (or everyone's with 'all')",
    usage: '@user | all',
    admin: true,
    groupOnly: true,
    run: ({ targets, args, g, reply }) => {
      if (args[0] === 'all') g.xp = {}
      else if (targets.length) for (const t of targets) delete g.xp[t]
      else return reply('Usage: !resetxp @user  or  !resetxp all')
      reply('✅ XP reset')
    },
  },
  {
    name: 'kickall',
    desc: 'Remove everyone who is not an admin (asks to confirm)',
    usage: 'confirm',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, meta, args, reply, isMine }) => {
      const targets = meta.participants.filter((p) => !p.admin && !isMine(p.id)).map((p) => p.id)
      if (args[0] !== 'confirm') return reply(`⚠️ This removes ${targets.length} non-admin members. Type *!kickall confirm* to proceed.`)
      for (let i = 0; i < targets.length; i += 5) await sock.groupParticipantsUpdate(chat, targets.slice(i, i + 5), 'remove')
      reply(`✅ Removed ${targets.length} members`)
    },
  },
  {
    name: 'requests',
    desc: 'List pending join requests',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, reply }) => {
      const list = await sock.groupRequestParticipantsList(chat)
      if (!list?.length) return reply('No pending join requests.')
      reply(`📝 *Join requests (${list.length})*\n` + list.map((r) => `• ${String(r.phone_number || r.jid).split('@')[0]}`).join('\n') + '\n\n!approve all  /  !reject all')
    },
  },
  ...['approve', 'reject'].map((action) => ({
    name: action,
    desc: `${action === 'approve' ? 'Approve' : 'Reject'} all pending join requests`,
    usage: 'all',
    admin: true,
    botAdmin: true,
    groupOnly: true,
    run: async ({ sock, chat, reply }) => {
      const list = await sock.groupRequestParticipantsList(chat)
      if (!list?.length) return reply('No pending join requests.')
      await sock.groupRequestParticipantsUpdate(chat, list.map((r) => r.jid), action)
      reply(`✅ ${action === 'approve' ? 'Approved' : 'Rejected'} ${list.length} request(s)`)
    },
  })),
]
