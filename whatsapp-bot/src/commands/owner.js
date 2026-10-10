// Commands only the bot owner (the linked account, or OWNER_NUMBERS) can use.
import { config } from '../config.js'
import { flush, getDb } from '../store.js'
import { sleep } from '../util.js'

const owner = (c) => ({ ...c, owner: true })

export const commands = [
  owner({
    name: 'mode',
    desc: 'public = everyone can use the bot, self = only you',
    usage: 'public|self',
    run: ({ args, reply }) => {
      const s = getDb().settings
      if (!['public', 'self'].includes(args[0])) return reply(`Mode is *${s.mode || config.mode}*. Use: !mode public|self`)
      s.mode = args[0]
      reply(`✅ Mode set to *${args[0]}*`)
    },
  }),
  owner({
    name: 'setprefix',
    desc: 'Change the command prefix',
    usage: '<symbol>',
    run: ({ args, reply }) => {
      if (!args[0] || args[0].length > 3) return reply('Usage: !setprefix .')
      getDb().settings.prefix = args[0]
      reply(`✅ Prefix is now *${args[0]}*`)
    },
  }),
  owner({
    name: 'groups',
    aliases: ['grouplist'],
    desc: 'Groups the bot is in',
    run: async ({ sock, reply }) => {
      const all = Object.values(await sock.groupFetchAllParticipating())
      reply(`👥 *${all.length} groups*\n` + all.map((g, i) => `${i + 1}. ${g.subject} (${g.participants.length})\n   ${g.id}`).join('\n'))
    },
  }),
  owner({
    name: 'broadcast',
    aliases: ['bc'],
    desc: 'Send a message to every group',
    usage: '<message>',
    run: async ({ sock, text, reply }) => {
      if (!text) return reply('Usage: !broadcast message')
      const ids = Object.keys(await sock.groupFetchAllParticipating()).filter((id) => !config.allowedGroups.length || config.allowedGroups.includes(id))
      for (const id of ids) {
        await sock.sendMessage(id, { text: `📢 *Broadcast*\n\n${text}` })
        await sleep(1500) // spacing to avoid looking like spam
      }
      reply(`✅ Sent to ${ids.length} groups`)
    },
  }),
  owner({
    name: 'leave',
    desc: 'Make the bot leave this group (or a group ID)',
    usage: '[group id]',
    run: async ({ sock, chat, args, reply }) => {
      const id = args[0] || chat
      if (!id.endsWith('@g.us')) return reply('Use in a group, or give a group ID.')
      await sock.sendMessage(id, { text: '👋 Bye!' })
      await sock.groupLeave(id)
    },
  }),
  owner({
    name: 'join',
    desc: 'Join a group from an invite link',
    usage: '<invite link>',
    run: async ({ sock, text, reply }) => {
      const code = /chat\.whatsapp\.com\/([\w-]+)/.exec(text)?.[1]
      if (!code) return reply('Usage: !join https://chat.whatsapp.com/XXXX')
      const id = await sock.groupAcceptInvite(code)
      reply(`✅ Joined ${id}`)
    },
  }),
  ...['block', 'unblock'].map((action) =>
    owner({
      name: action,
      desc: `${action[0].toUpperCase() + action.slice(1)} a user on WhatsApp`,
      usage: '@user | number',
      run: async ({ sock, targets, args, reply }) => {
        const who = targets[0] || (args[0] && `${args[0].replace(/\D/g, '')}@s.whatsapp.net`)
        if (!who) return reply(`Usage: !${action} @user`)
        await sock.updateBlockStatus(who, action)
        reply(`✅ ${action}ed`)
      },
    }),
  ),
  owner({
    name: 'setbio',
    aliases: ['setstatus'],
    desc: "Change the bot account's About text",
    usage: '<text>',
    run: async ({ sock, text, reply }) => {
      await sock.updateProfileStatus(text)
      reply('✅ About updated')
    },
  }),
  owner({
    name: 'setbotname',
    desc: "Change the bot account's display name",
    usage: '<name>',
    run: async ({ sock, text, reply }) => {
      if (!text) return reply('Usage: !setbotname My Bot')
      await sock.updateProfileName(text)
      reply('✅ Name updated')
    },
  }),
  owner({
    name: 'restart',
    desc: 'Restart the bot (needs pm2 or a process manager)',
    run: async ({ reply }) => {
      await reply('♻️ Restarting…')
      flush()
      setTimeout(() => process.exit(0), 500)
    },
  }),
  owner({
    name: 'backup',
    desc: 'Get a copy of the bot database',
    run: async ({ sock, chat, msg }) => {
      flush()
      await sock.sendMessage(chat, { document: Buffer.from(JSON.stringify(getDb(), null, 1)), fileName: `bot-backup-${new Date().toISOString().slice(0, 10)}.json`, mimetype: 'application/json' }, { quoted: msg })
    },
  }),
]
