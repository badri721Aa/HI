import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, generateMessageIDV2, useMultiFileAuthState } from 'baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { registry } from './commands/index.js'
import { config } from './config.js'
import { cachedMeta, forgetMeta, handleMessage, handleParticipants, settings, tick } from './handler.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' })

// IDs of messages the bot sent itself. When the bot runs on your own number, your messages and the
// bot's both show up as "from me" — this is how we tell them apart and avoid answering ourselves.
const sentByBot = new Set()
let sock

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    markOnlineOnConnect: false,
    cachedGroupMetadata: async (jid) => cachedMeta(jid),
  })

  // Pick the message ID up front and remember it, so the echo of our own message is ignored.
  const send = sock.sendMessage.bind(sock)
  sock.sendMessage = (jid, content, options = {}) => {
    const messageId = options.messageId || generateMessageIDV2(sock.user?.id)
    sentByBot.add(messageId)
    if (sentByBot.size > 5000) sentByBot.delete(sentByBot.values().next().value)
    return send(jid, content, { ...options, messageId })
  }

  sock.ev.on('creds.update', saveCreds)

  // First run: link by pairing code (if PHONE_NUMBER is set) or by QR code.
  let pairingRequested = false
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (config.phoneNumber && !pairingRequested) {
        pairingRequested = true
        const code = await sock.requestPairingCode(config.phoneNumber)
        console.log(`\nPairing code: ${code}\nOn your phone: WhatsApp → Linked devices → Link a device → Link with phone number instead\n`)
      } else if (!config.phoneNumber) {
        console.log('\nScan with WhatsApp → Linked devices → Link a device:\n')
        qrcode.generate(qr, { small: true })
      }
    }
    if (connection === 'open') {
      console.log(`✅ Connected as ${sock.user?.id} — ${registry.list.length} commands, prefix "${settings.prefix}", mode "${settings.mode}"`)
    }
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
    for (const u of updates) if (u.id) forgetMeta(u.id)
  })

  sock.ev.on('group-participants.update', (ev) => handleParticipants(sock, ev).catch((err) => logger.error(err, 'welcome failed')))

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (sentByBot.has(msg.key.id)) continue
      // Messages you type on your phone can arrive as "append"; only take fresh ones (not history).
      const fresh = Date.now() / 1000 - Number(msg.messageTimestamp || 0) < 60
      if (type !== 'notify' && !(msg.key.fromMe && fresh)) continue
      try {
        await handleMessage(sock, msg)
      } catch (err) {
        logger.error(err, 'handler failed')
      }
    }
  })
}

setInterval(() => sock?.user && tick(sock).catch((err) => logger.error(err, 'tick failed')), 15_000)

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
