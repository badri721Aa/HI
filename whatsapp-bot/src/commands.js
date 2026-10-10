import { config } from './config.js'

const p = config.prefix

// Each command: { description, adminOnly?, botAdmin?, run(ctx) }
export const commands = {
  help: {
    description: 'Show this list',
    run: ({ reply }) =>
      reply(
        '*Commands*\n' +
          Object.entries(commands)
            .map(([name, c]) => `${p}${name}${c.adminOnly ? ' _(admins)_' : ''} — ${c.description}`)
            .join('\n'),
      ),
  },

  ping: {
    description: 'Check the bot is alive',
    run: ({ reply }) => reply('pong 🏓'),
  },

  rules: {
    description: 'Show the group rules',
    run: ({ reply }) => reply(`*Group rules*\n${config.rules}`),
  },

  info: {
    description: 'Group name, size and admins',
    run: ({ reply, meta }) => {
      const admins = meta.participants.filter((x) => x.admin).length
      reply(`*${meta.subject}*\nMembers: ${meta.participants.length}\nAdmins: ${admins}\n\n${meta.desc || ''}`.trim())
    },
  },

  id: {
    description: "This group's ID (for ALLOWED_GROUPS)",
    run: ({ reply, chat }) => reply(chat),
  },

  tagall: {
    description: 'Mention everyone',
    adminOnly: true,
    run: ({ sock, chat, meta, args, msg }) => {
      const ids = meta.participants.map((x) => x.id)
      const text = (args.join(' ') || '📢 Attention everyone') + '\n\n' + ids.map((id) => `@${id.split('@')[0]}`).join(' ')
      return sock.sendMessage(chat, { text, mentions: ids }, { quoted: msg })
    },
  },

  kick: {
    description: 'Remove mentioned / replied-to members',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, chat, targets, reply }) => {
      if (!targets.length) return reply(`Mention someone or reply to their message: ${p}kick @user`)
      await sock.groupParticipantsUpdate(chat, targets, 'remove')
    },
  },

  promote: {
    description: 'Make mentioned members admin',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, chat, targets, reply }) => {
      if (!targets.length) return reply(`Usage: ${p}promote @user`)
      await sock.groupParticipantsUpdate(chat, targets, 'promote')
      reply('✅ Promoted')
    },
  },

  demote: {
    description: 'Remove admin from mentioned members',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, chat, targets, reply }) => {
      if (!targets.length) return reply(`Usage: ${p}demote @user`)
      await sock.groupParticipantsUpdate(chat, targets, 'demote')
      reply('✅ Demoted')
    },
  },

  lock: {
    description: 'Only admins can send messages',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, chat, reply }) => {
      await sock.groupSettingUpdate(chat, 'announcement')
      reply('🔒 Group locked — only admins can talk')
    },
  },

  unlock: {
    description: 'Everyone can send messages',
    adminOnly: true,
    botAdmin: true,
    run: async ({ sock, chat, reply }) => {
      await sock.groupSettingUpdate(chat, 'not_announcement')
      reply('🔓 Group unlocked')
    },
  },
}
