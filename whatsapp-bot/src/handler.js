import { areJidsSameUser, isJidGroup, jidNormalizedUser, normalizeMessageContent } from 'baileys'
import { addWarning } from './commands/admin.js'
import { levelFor } from './commands/group.js'
import { registry } from './commands/index.js'
import { config } from './config.js'
import { getDb, group, save, user } from './store.js'
import { fmtDuration, rand, tag } from './util.js'

const LINK_RE = /(chat\.whatsapp\.com\/|https?:\/\/|www\.)\S+/i
const XP_COOLDOWN = 30_000
const lastXp = new Map() // `${chat}|${user}` → time
const recent = new Map() // `${chat}|${user}` → timestamps, for anti-spam
const groupCache = new Map()

export const settings = {
  get prefix() { return getDb().settings.prefix || config.prefix },
  get mode() { return getDb().settings.mode || config.mode },
}

export async function getMeta(sock, jid, fresh = false) {
  if (fresh || !groupCache.has(jid)) groupCache.set(jid, await sock.groupMetadata(jid))
  return groupCache.get(jid)
}
export const forgetMeta = (jid) => groupCache.delete(jid)
export const cachedMeta = (jid) => groupCache.get(jid)

export const isAllowedGroup = (jid) => !config.allowedGroups.length || config.allowedGroups.includes(jid)

// A participant can be identified by LID or phone-number JID; match either.
const sameParticipant = (p, jid) => [p.id, p.lid, p.phoneNumber].some((x) => x && areJidsSameUser(x, jid))

function getText(m) {
  return m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || m?.documentMessage?.caption || ''
}
function getContextInfo(m) {
  if (!m) return undefined
  for (const v of Object.values(m)) if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo
  return undefined
}

export async function handleMessage(sock, msg) {
  const chat = msg.key.remoteJid
  const m = normalizeMessageContent(msg.message)
  if (!m || !chat || chat === 'status@broadcast' || m.protocolMessage || m.reactionMessage) return

  const isGroup = isJidGroup(chat)
  if (isGroup && !isAllowedGroup(chat)) return

  const fromMe = !!msg.key.fromMe
  const sender = jidNormalizedUser(fromMe ? (isGroup && msg.key.participant) || sock.user.id : isGroup ? msg.key.participant : chat)
  const senderAlt = msg.key.participantAlt || msg.key.remoteJidAlt
  const body = getText(m).trim()
  const prefix = settings.prefix

  const isMine = (jid) => !!jid && [sock.user?.id, sock.user?.lid].some((me) => me && areJidsSameUser(me, jid))
  const isOwner = fromMe || isMine(sender) || [sender, senderAlt].some((j) => j && config.owners.includes(j.split('@')[0].split(':')[0]))

  const meta = isGroup ? await getMeta(sock, chat) : null
  const isAdmin = (jid) => !!meta?.participants.some((p) => p.admin && sameParticipant(p, jid))
  const senderIsAdmin = isGroup && (isAdmin(sender) || (senderAlt && isAdmin(senderAlt)))
  const botIsAdmin = () => isAdmin(sock.user?.id) || (sock.user?.lid && isAdmin(sock.user.lid))

  const ctxInfo = getContextInfo(m)
  const quoted = ctxInfo?.quotedMessage
    ? { id: ctxInfo.stanzaId, sender: ctxInfo.participant, message: ctxInfo.quotedMessage, text: getText(normalizeMessageContent(ctxInfo.quotedMessage)) }
    : null
  const targets = [...new Set([...(ctxInfo?.mentionedJid || []), ...(quoted?.sender ? [quoted.sender] : [])])]

  const g = isGroup ? group(chat) : null
  const u = user(sender)

  const ctx = {
    sock, msg, chat, isGroup, meta, g, u, body, prefix, registry, sender, senderAlt, quoted, targets,
    senderName: msg.pushName || sender.split('@')[0],
    isOwner, isAdmin: senderIsAdmin || isOwner, botIsAdmin, isMine,
    args: [], text: '',
    reply: (text, opts = {}) => sock.sendMessage(chat, { text, ...opts }, { quoted: msg }),
    react: (emoji) => sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }),
  }

  // ---------- Passive group features (run on every message) ----------
  if (isGroup && !fromMe) {
    g.msgCount[sender] = (g.msgCount[sender] || 0) + 1

    const exempt = senderIsAdmin || isOwner
    if (!exempt && (await moderate(ctx))) return save()

    const key = `${chat}|${sender}`
    if (Date.now() - (lastXp.get(key) || 0) > XP_COOLDOWN) {
      lastXp.set(key, Date.now())
      const before = levelFor(g.xp[sender] || 0)
      g.xp[sender] = (g.xp[sender] || 0) + rand(5, 15)
      const after = levelFor(g.xp[sender])
      if (after > before && g.levelUp) await sock.sendMessage(chat, { text: `🎉 ${tag(sender)} reached *level ${after}*!`, mentions: [sender] })
    }
  }

  // AFK: welcome back, and tell people when they mention someone who's away.
  if (u.afk && !body.toLowerCase().startsWith(prefix + 'afk')) {
    const away = fmtDuration(Date.now() - u.afk.since)
    u.afk = null
    await ctx.reply(`👋 Welcome back! You were away for ${away}.`)
  }
  for (const t of targets) {
    const a = getDb().users[t]?.afk
    if (a) await sock.sendMessage(chat, { text: `💤 ${tag(t)} is AFK: ${a.reason} (${fmtDuration(Date.now() - a.since)} ago)`, mentions: [t] }, { quoted: msg })
  }

  // ---------- Commands ----------
  if (!body.startsWith(prefix)) {
    for (const hook of registry.hooks) if (await hook(ctx)) break
    return save()
  }

  const [rawName, ...args] = body.slice(prefix.length).trim().split(/\s+/)
  const cmd = registry.byName[rawName?.toLowerCase()]
  if (!cmd) return save()

  if (settings.mode === 'self' && !isOwner) return
  if (!isGroup && !isOwner && !config.allowDms) return
  if (g?.banned.includes(sender) && !isOwner) return

  ctx.args = args
  ctx.text = body.slice(prefix.length).trim().slice(rawName.length).trim()

  if (cmd.owner && !isOwner) return ctx.reply('👑 Only the bot owner can use this.')
  if (cmd.groupOnly && !isGroup) return ctx.reply('👥 This command only works in groups.')
  if (cmd.admin && !ctx.isAdmin) return ctx.reply('⛔ Only group admins can use this.')
  if (cmd.botAdmin && !botIsAdmin()) return ctx.reply('⚠️ Make me a group admin first.')

  const stats = getDb().stats
  stats.commands++
  stats.perCommand[cmd.name] = (stats.perCommand[cmd.name] || 0) + 1

  try {
    await cmd.run(ctx)
  } catch (err) {
    console.error(`!${cmd.name} failed:`, err)
    await ctx.reply('❌ Something went wrong running that command.').catch(() => {})
  }
  save()
}

// Anti-link, bad-word filter and anti-spam. Returns true if the message was removed.
async function moderate(ctx) {
  const { sock, chat, g, body, sender, msg } = ctx
  const remove = async (why) => {
    if (ctx.botIsAdmin()) await sock.sendMessage(chat, { delete: msg.key })
    await addWarning(ctx, sender, why)
    return true
  }

  if (g.antiLink && LINK_RE.test(body)) return remove('Posting links')

  if (g.antiBadword && g.badwords.length) {
    const words = body.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    if (g.badwords.some((w) => words.includes(w))) return remove('Bad language')
  }

  if (g.antiSpam) {
    const key = `${chat}|${sender}`
    const now = Date.now()
    const times = (recent.get(key) || []).filter((t) => now - t < 8000)
    times.push(now)
    recent.set(key, times)
    if (times.length >= 7) {
      recent.set(key, [])
      await addWarning(ctx, sender, 'Spamming')
    }
  }
  return false
}

export async function handleParticipants(sock, { id, participants, action }) {
  forgetMeta(id)
  if (!isAllowedGroup(id)) return
  const g = group(id)
  if (!g.welcome || (action !== 'add' && action !== 'remove')) return
  const ids = participants.map((p) => (typeof p === 'string' ? p : p.id))
  if (ids.some((j) => [sock.user?.id, sock.user?.lid].some((me) => me && areJidsSameUser(me, j)))) return
  const meta = await getMeta(sock, id, true)
  const fill = (t) =>
    t.replaceAll('{user}', ids.map(tag).join(' ')).replaceAll('{group}', meta.subject).replaceAll('{count}', meta.participants.length).replaceAll('{desc}', meta.desc || '')
  const text =
    action === 'add'
      ? fill(g.welcomeMsg || `👋 Welcome {user} to *{group}*!\nYou're member #{count}. Type ${settings.prefix}rules to see the rules and ${settings.prefix}help for commands.`)
      : fill(g.goodbyeMsg || '👋 Goodbye {user}. We are now {count}.')
  await sock.sendMessage(id, { text, mentions: ids })
}

// Runs every few seconds: delivers reminders and lifts timed mutes.
export async function tick(sock) {
  const db = getDb()
  const now = Date.now()
  const due = db.reminders.filter((r) => r.at <= now)
  if (due.length) {
    db.reminders = db.reminders.filter((r) => r.at > now)
    save()
    for (const r of due) await sock.sendMessage(r.chat, { text: `⏰ Reminder for ${tag(r.who)}:\n${r.text}`, mentions: [r.who] }).catch(() => {})
  }
  for (const [jid, g] of Object.entries(db.groups)) {
    if (g.muteUntil && g.muteUntil <= now) {
      g.muteUntil = null
      save()
      await sock.groupSettingUpdate(jid, 'not_announcement').then(() => sock.sendMessage(jid, { text: '🔊 Mute is over — everyone can talk again.' })).catch(() => {})
    }
  }
}
