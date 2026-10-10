import crypto from 'node:crypto'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { getMedia } from '../media.js'
import { getDb } from '../store.js'
import { fmtDuration, parseDuration, tag } from '../util.js'

const LOREM = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(' ')

export const commands = [
  {
    name: 'poll',
    aliases: ['vote'],
    desc: 'Create a WhatsApp poll',
    usage: 'Question | option 1 | option 2 …',
    run: ({ sock, chat, text, reply }) => {
      const [name, ...values] = text.split('|').map((s) => s.trim()).filter(Boolean)
      if (!name || values.length < 2) return reply('Usage: !poll Where to eat? | Pizza | Burgers | Sushi')
      return sock.sendMessage(chat, { poll: { name, values: values.slice(0, 12), selectableCount: 1 } })
    },
  },
  {
    name: 'multipoll',
    desc: 'Poll where people can pick several options',
    usage: 'Question | option 1 | option 2 …',
    run: ({ sock, chat, text, reply }) => {
      const [name, ...values] = text.split('|').map((s) => s.trim()).filter(Boolean)
      if (!name || values.length < 2) return reply('Usage: !multipoll Free days? | Mon | Tue | Wed')
      return sock.sendMessage(chat, { poll: { name, values: values.slice(0, 12), selectableCount: values.length } })
    },
  },
  {
    name: 'save',
    aliases: ['setnote', 'addnote'],
    desc: 'Save a group note (or reply to a message)',
    usage: '<name> <text>',
    groupOnly: true,
    run: ({ args, quoted, g, reply }) => {
      const name = args[0]?.toLowerCase()
      const body = args.slice(1).join(' ') || quoted?.text
      if (!name || !body) return reply('Usage: !save wifi The password is 1234')
      g.notes[name] = body
      reply(`📝 Saved *${name}* — get it with !note ${name}`)
    },
  },
  {
    name: 'note',
    aliases: ['get'],
    desc: 'Show a saved note',
    usage: '<name>',
    groupOnly: true,
    run: ({ args, g, reply }) => {
      const n = g.notes[args[0]?.toLowerCase()]
      reply(n ? `📝 *${args[0].toLowerCase()}*\n${n}` : 'Note not found. See !notes')
    },
  },
  {
    name: 'notes',
    desc: 'List saved notes',
    groupOnly: true,
    run: ({ g, reply }) => {
      const k = Object.keys(g.notes)
      reply(k.length ? `📒 *Notes*\n${k.map((x) => `• ${x}`).join('\n')}` : 'No notes yet. Save one with !save name text')
    },
  },
  {
    name: 'delnote',
    aliases: ['rmnote'],
    desc: 'Delete a saved note',
    usage: '<name>',
    admin: true,
    groupOnly: true,
    run: ({ args, g, reply }) => {
      const k = args[0]?.toLowerCase()
      if (!g.notes[k]) return reply('Note not found.')
      delete g.notes[k]
      reply('🗑️ Note deleted')
    },
  },
  {
    name: 'todo',
    desc: 'Add to your personal to-do list',
    usage: '<task>',
    run: ({ text, u, reply }) => {
      if (!text) return reply('Usage: !todo buy milk')
      u.todos.push({ text, done: false })
      reply(`✅ Added (#${u.todos.length}). See !todos`)
    },
  },
  {
    name: 'todos',
    aliases: ['todolist'],
    desc: 'Show your to-do list',
    run: ({ u, reply }) => reply(u.todos.length ? '📋 *Your to-dos*\n' + u.todos.map((t, i) => `${i + 1}. ${t.done ? '✅ ~' + t.text + '~' : '⬜ ' + t.text}`).join('\n') : 'Your list is empty. Add with !todo task'),
  },
  {
    name: 'done',
    desc: 'Tick off a to-do',
    usage: '<number>',
    run: ({ args, u, reply }) => {
      const t = u.todos[Number(args[0]) - 1]
      if (!t) return reply('Usage: !done 1 (see !todos)')
      t.done = true
      reply(`🎉 Done: ${t.text}`)
    },
  },
  {
    name: 'cleartodos',
    desc: 'Remove finished to-dos (or all with "all")',
    usage: '[all]',
    run: ({ args, u, reply }) => {
      u.todos = args[0] === 'all' ? [] : u.todos.filter((t) => !t.done)
      reply(`🧹 Cleared. ${u.todos.length} left.`)
    },
  },
  {
    name: 'remind',
    aliases: ['reminder', 'remindme'],
    desc: 'Set a reminder',
    usage: '<time e.g. 10m, 2h, 1d> <text>',
    run: ({ args, chat, sender, reply }) => {
      const ms = parseDuration(args[0] || '')
      const text = args.slice(1).join(' ')
      if (!ms || !text) return reply('Usage: !remind 30m take the pizza out')
      if (ms > 365 * 86400000) return reply('Max 1 year.')
      const db = getDb()
      const id = crypto.randomBytes(3).toString('hex')
      db.reminders.push({ id, chat, who: sender, text, at: Date.now() + ms })
      reply(`⏰ I'll remind you in ${fmtDuration(ms)} (id ${id})`)
    },
  },
  {
    name: 'reminders',
    desc: 'Your pending reminders',
    run: ({ sender, reply }) => {
      const mine = getDb().reminders.filter((r) => r.who === sender)
      reply(mine.length ? '⏰ *Reminders*\n' + mine.map((r) => `• [${r.id}] in ${fmtDuration(r.at - Date.now())}: ${r.text}`).join('\n') : 'No reminders.')
    },
  },
  {
    name: 'cancelremind',
    aliases: ['delremind'],
    desc: 'Cancel a reminder',
    usage: '<id>',
    run: ({ args, sender, reply }) => {
      const db = getDb()
      const before = db.reminders.length
      db.reminders = db.reminders.filter((r) => !(r.id === args[0] && r.who === sender))
      reply(db.reminders.length < before ? '🗑️ Reminder cancelled' : 'Not found. See !reminders')
    },
  },
  {
    name: 'stopwatch',
    aliases: ['sw'],
    desc: 'Start / stop a personal stopwatch',
    run: ({ u, reply }) => {
      if (u.stopwatch) {
        const t = Date.now() - u.stopwatch
        u.stopwatch = null
        return reply(`⏱️ Stopped: ${fmtDuration(t)} (${(t / 1000).toFixed(1)}s)`)
      }
      u.stopwatch = Date.now()
      reply('⏱️ Started! Send !stopwatch again to stop.')
    },
  },
  {
    name: 'password',
    aliases: ['pass', 'genpass'],
    desc: 'Generate a strong random password',
    usage: '[length]',
    run: ({ args, reply }) => {
      const len = Math.min(Math.max(Number(args[0]) || 16, 6), 64)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+'
      reply('🔐 `' + Array.from(crypto.randomBytes(len), (b) => chars[b % chars.length]).join('') + '`')
    },
  },
  { name: 'uuid', desc: 'Generate a random UUID', run: ({ reply }) => reply(crypto.randomUUID()) },
  {
    name: 'hash',
    desc: 'MD5 / SHA-1 / SHA-256 of text',
    usage: '<text>',
    run: ({ text, reply }) => {
      if (!text) return reply('Usage: !hash hello')
      reply(['md5', 'sha1', 'sha256'].map((a) => `*${a}*: ${crypto.createHash(a).update(text).digest('hex')}`).join('\n'))
    },
  },
  {
    name: 'lorem',
    desc: 'Placeholder text',
    usage: '[words]',
    run: ({ args, reply }) => {
      const n = Math.min(Number(args[0]) || 30, 300)
      const w = Array.from({ length: n }, (_, i) => LOREM[i % LOREM.length]).join(' ')
      reply(w[0].toUpperCase() + w.slice(1) + '.')
    },
  },
  {
    name: 'qr',
    aliases: ['qrcode'],
    desc: 'Make a QR code image from text or a link',
    usage: '<text>',
    run: async ({ sock, chat, text, quoted, reply, msg }) => {
      const t = text || quoted?.text
      if (!t) return reply('Usage: !qr https://example.com')
      const image = await QRCode.toBuffer(t, { width: 512, margin: 2 })
      await sock.sendMessage(chat, { image, caption: t.slice(0, 200) }, { quoted: msg })
    },
  },
  {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    desc: 'Turn an image into a sticker (send or reply to an image)',
    run: async (ctx) => {
      const media = await getMedia(ctx, ['imageMessage', 'stickerMessage'])
      if (!media) return ctx.reply('Send an image with caption !sticker, or reply to an image with !sticker')
      const sticker = await sharp(media.buffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer()
      await ctx.sock.sendMessage(ctx.chat, { sticker }, { quoted: ctx.msg })
    },
  },
  {
    name: 'toimg',
    aliases: ['toimage'],
    desc: 'Turn a sticker back into an image (reply to it)',
    run: async (ctx) => {
      const media = await getMedia(ctx, ['stickerMessage'])
      if (!media) return ctx.reply('Reply to a sticker with !toimg')
      const image = await sharp(media.buffer).png().toBuffer()
      await ctx.sock.sendMessage(ctx.chat, { image }, { quoted: ctx.msg })
    },
  },
  {
    name: 'circle',
    desc: 'Crop an image into a round sticker',
    run: async (ctx) => {
      const media = await getMedia(ctx, ['imageMessage'])
      if (!media) return ctx.reply('Send or reply to an image with !circle')
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256"/></svg>')
      const sticker = await sharp(media.buffer).resize(512, 512, { fit: 'cover' }).composite([{ input: mask, blend: 'dest-in' }]).webp().toBuffer()
      await ctx.sock.sendMessage(ctx.chat, { sticker }, { quoted: ctx.msg })
    },
  },
  ...[
    ['grayscale', 'Black & white version of an image', (img) => img.grayscale()],
    ['blur', 'Blur an image', (img) => img.blur(8)],
    ['invert', 'Invert image colours', (img) => img.negate({ alpha: false })],
    ['mirror', 'Mirror an image horizontally', (img) => img.flop()],
  ].map(([name, desc, fx]) => ({
    name,
    desc: `${desc} (send or reply to an image)`,
    run: async (ctx) => {
      const media = await getMedia(ctx, ['imageMessage'])
      if (!media) return ctx.reply(`Send or reply to an image with !${name}`)
      const image = await fx(sharp(media.buffer)).jpeg().toBuffer()
      await ctx.sock.sendMessage(ctx.chat, { image }, { quoted: ctx.msg })
    },
  })),
  {
    name: 'mention',
    desc: 'Mention a member by number',
    usage: '<number> [text]',
    run: ({ sock, chat, args, reply }) => {
      const n = args[0]?.replace(/\D/g, '')
      if (!n) return reply('Usage: !mention 9665xxxxxxxx hello')
      const jid = `${n}@s.whatsapp.net`
      return sock.sendMessage(chat, { text: `${tag(jid)} ${args.slice(1).join(' ')}`, mentions: [jid] })
    },
  },
  {
    name: 'wame',
    aliases: ['chatlink'],
    desc: 'wa.me link to chat with someone',
    usage: '[@user]',
    run: ({ targets, sender, reply }) => {
      const who = targets[0] || sender
      reply(who.endsWith('@lid') ? "Can't get a phone link for this member (their number is hidden)." : `https://wa.me/${who.split('@')[0]}`)
    },
  },
]
