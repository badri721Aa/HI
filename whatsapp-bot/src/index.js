import fs from 'node:fs'
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, generateMessageIDV2, useMultiFileAuthState } from 'baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { registry } from './commands/index.js'
import { config } from './config.js'
import { cachedMeta, forgetMeta, handleMessage, handleParticipants, settings, tick } from './handler.js'

// The library's own logs are very noisy; set LOG_LEVEL=debug in .env when troubleshooting.
const logger = pino({ level: process.env.LOG_LEVEL || 'fatal' })
const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a)

// IDs of messages the bot sent itself. When the bot runs on your own number, your messages and the
// bot's both show up as "from me" — this is how we tell them apart and avoid answering ourselves.
const sentByBot = new Set()
let sock
let retries = 0

// Plain-language explanation for each reason WhatsApp can close the connection.
const closeReasons = {
  [DisconnectReason.restartRequired]: 'Linked successfully — reconnecting with the new login…',
  [DisconnectReason.timedOut]: 'The QR code / pairing code expired before it was used. Getting a new one…',
  [DisconnectReason.connectionClosed]: 'Connection dropped. Reconnecting…',
  [DisconnectReason.connectionReplaced]: 'Another copy of the bot connected with this login. Close the other window — only run one copy.',
  [DisconnectReason.loggedOut]: 'WhatsApp rejected or removed this login.',
  [DisconnectReason.badSession]: 'The saved login is damaged.',
  [DisconnectReason.forbidden]: 'WhatsApp blocked this connection (403). The number may be restricted.',
  [DisconnectReason.multideviceMismatch]: 'Multi-device mismatch.',
  [DisconnectReason.unavailableService]: 'WhatsApp service unavailable. Retrying…',
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))

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
    if (config.label && typeof content.text === 'string') content = { ...content, text: `🤖 *${config.botName}*\n${content.text}` }
    const messageId = options.messageId || generateMessageIDV2(sock.user?.id)
    sentByBot.add(messageId)
    if (sentByBot.size > 5000) sentByBot.delete(sentByBot.values().next().value)
    return send(jid, content, { ...options, messageId })
  }

  sock.ev.on('creds.update', saveCreds)

  if (!state.creds.registered) log(config.phoneNumber ? `Not linked yet — requesting a pairing code for +${config.phoneNumber}…` : 'Not linked yet — waiting for a QR code…')
  else log('Connecting with saved login…')

  // First run: link by pairing code (if PHONE_NUMBER is set) or by QR code.
  let pairingRequested = false
  let qrCount = 0
  let sawQr = false
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) sawQr = true
    if (qr && !state.creds.registered) {
      if (config.phoneNumber) {
        if (pairingRequested) return
        pairingRequested = true
        try {
          const code = await sock.requestPairingCode(config.phoneNumber)
          log(
            `\n\n   PAIRING CODE:  ${code.match(/.{1,4}/g).join('-')}\n\n` +
              '   On your phone: WhatsApp → Settings → Linked devices → Link a device\n' +
              '   → tap "Link with phone number instead" → type the code above.\n' +
              '   Use it within about 1 minute. If it expires, a new code will be shown here.\n',
          )
        } catch (err) {
          log(`❌ Could not get a pairing code: ${err.message}\n   Check PHONE_NUMBER in .env (digits only, with country code, no + or leading 0).`)
        }
      } else {
        qrCount++
        log(`Scan this QR code (#${qrCount}) — WhatsApp → Settings → Linked devices → Link a device.\n   It refreshes every ~20 seconds; always scan the newest one.\n`)
        qrcode.generate(qr, { small: true })
      }
    }

    if (connection === 'open') {
      retries = 0
      log(`✅ Connected as ${sock.user?.id?.split(':')[0]} — ${registry.list.length} commands, prefix "${settings.prefix}", mode "${settings.mode}"`)
      log(`Send ${settings.prefix}ping in your group to test.`)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const reason =
        !sawQr && !state.creds.registered && code === DisconnectReason.timedOut
          ? "Couldn't reach WhatsApp's servers. Check your internet; a VPN, firewall or antivirus may be blocking Node.js."
          : closeReasons[code] || lastDisconnect?.error?.message || 'unknown reason'
      log(`Connection closed (${code ?? 'unknown'}): ${reason}`)

      // A dead login can't recover: wipe it and start a fresh link instead of looping.
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.badSession || code === DisconnectReason.multideviceMismatch) {
        fs.rmSync(config.authDir, { recursive: true, force: true })
        log('Cleared the saved login. Starting a fresh link — remove any old "linked devices" for this bot on your phone first.')
      }
      if (code === DisconnectReason.connectionReplaced || code === DisconnectReason.forbidden) process.exit(1)

      retries++
      const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(30_000, 2000 * retries)
      setTimeout(() => start().catch((err) => log('Start failed:', err.message)), delay)
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
