import makeWASocket, {
  DisconnectReason,
  areJidsSameUser,
  fetchLatestBaileysVersion,
  isJidGroup,
  normalizeMessageContent,
  useMultiFileAuthState,
} from 'baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { commands } from './commands.js'
import { config } from './config.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })
const LINK_RE = /(chat\.whatsapp\.com\/|https?:\/\/|www\.)\S+/i

// Group metadata is fetched once and refreshed when the group changes.
const groupCache = new Map()
async function getMeta(sock, jid, fresh = false) {
  if (fresh || !groupCache.has(jid)) groupCache.set(jid, await sock.groupMetadata(jid))
  return groupCache.get(jid)
}

// A participant can be identified by LID or phone-number JID; match either.
const isSameParticipant = (p, jid) => [p.id, p.lid, p.phoneNumber].some((x) => x && areJidsSameUser(x, jid))
const isAdmin = (meta, jids) => meta.participants.some((p) => p.admin && jids.some((j) => j && isSameParticipant(p, j)))

function getText(message) {
  const m = normalizeMessageContent(message)
  if (!m) return ''
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || ''
}

function getContextInfo(message) {
  const m = normalizeMessageContent(message)
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    markOnlineOnConnect: false,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  })

  sock.ev.on('creds.update', saveCreds)

  // First run: link the bot by pairing code (if PHONE_NUMBER is set) or QR code.
  let pairingRequested = false
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (config.phoneNumber && !pairingRequested) {
        pairingRequested = true
        const code = await sock.requestPairingCode(config.phoneNumber)
        console.log(`\nPairing code: ${code}\nWhatsApp → Linked devices → Link a device → Link with phone number instead\n`)
      } else if (!config.phoneNumber) {
        console.log('\nScan this with WhatsApp → Linked devices → Link a device:\n')
        qrcode.generate(qr, { small: true })
      }
    }

    if (connection === 'open') console.log(`✅ Connected as ${sock.user?.id}`)

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        console.log(`Logged out. Delete the "${config.authDir}" folder and restart to link again.`)
        process.exit(1)
      }
      console.log(`Connection closed (${code ?? 'unknown'}), reconnecting…`)
      setTimeout(start, 3000)
    }
  })

  sock.ev.on('groups.update', (updates) => {
    for (const u of updates) if (u.id) groupCache.delete(u.id)
  })

  const allowed = (jid) => !config.allowedGroups.length || config.allowedGroups.includes(jid)

  // Welcome / goodbye messages
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    groupCache.delete(id)
    if (!config.welcome || !allowed(id)) return
    if (action !== 'add' && action !== 'remove') return
    try {
      const ids = participants.map((p) => (typeof p === 'string' ? p : p.id))
      const tags = ids.map((j) => `@${j.split('@')[0]}`).join(' ')
      const meta = await getMeta(sock, id, true)
      const text =
        action === 'add'
          ? `👋 Welcome ${tags} to *${meta.subject}*!\nType ${config.prefix}rules to see the group rules.`
          : `👋 Goodbye ${tags}`
      await sock.sendMessage(id, { text, mentions: ids })
    } catch (err) {
      logger.error(err, 'welcome failed')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg, allowed)
      } catch (err) {
        logger.error(err, 'handler failed')
      }
    }
  })
}

async function handleMessage(sock, msg, allowed) {
  const chat = msg.key.remoteJid
  if (!msg.message || msg.key.fromMe || !isJidGroup(chat) || !allowed(chat)) return

  const text = getText(msg.message).trim()
  const sender = [msg.key.participant, msg.key.participantAlt]
  const reply = (t) => sock.sendMessage(chat, { text: t }, { quoted: msg })
  const meta = await getMeta(sock, chat)
  const senderIsAdmin = isAdmin(meta, sender)
  const botIsAdmin = () => isAdmin(meta, [sock.user?.id, sock.user?.lid])

  // Anti-link: delete invite/links from non-admins (bot must be admin).
  if (config.antiLink && LINK_RE.test(text) && !senderIsAdmin && botIsAdmin()) {
    await sock.sendMessage(chat, { delete: msg.key })
    await sock.sendMessage(chat, {
      text: `🚫 @${msg.key.participant.split('@')[0]}, links aren't allowed here.`,
      mentions: [msg.key.participant],
    })
    return
  }

  if (!text.startsWith(config.prefix)) return
  const [name, ...args] = text.slice(config.prefix.length).trim().split(/\s+/)
  const cmd = commands[name?.toLowerCase()]
  if (!cmd) return

  if (cmd.adminOnly && !senderIsAdmin) return reply('⛔ Only group admins can use this command.')
  if (cmd.botAdmin && !botIsAdmin()) return reply('⚠️ Make me a group admin first.')

  const ctxInfo = getContextInfo(msg.message)
  const targets = [...(ctxInfo?.mentionedJid || []), ...(ctxInfo?.participant ? [ctxInfo.participant] : [])]

  await cmd.run({ sock, msg, chat, meta, args, reply, targets: [...new Set(targets)] })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
