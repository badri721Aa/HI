// Tiny JSON database: everything lives in one file, saved a moment after each change.
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

let db = { groups: {}, users: {}, reminders: [], stats: { commands: 0, perCommand: {} }, settings: {} }
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(config.dataFile, 'utf8')) }
} catch {}

let timer
export function save() {
  clearTimeout(timer)
  timer = setTimeout(flush, 1000)
}
export function flush() {
  clearTimeout(timer)
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true })
  const tmp = config.dataFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1))
  fs.renameSync(tmp, config.dataFile)
}
process.on('exit', () => {
  try { flush() } catch {}
})

export const getDb = () => db

export function group(jid) {
  return (db.groups[jid] ??= {
    welcome: config.welcome,
    antiLink: config.antiLink,
    antiSpam: false,
    antiBadword: false,
    badwords: [],
    rules: null,
    welcomeMsg: null,
    goodbyeMsg: null,
    warnLimit: 3,
    warns: {},
    banned: [],
    notes: {},
    msgCount: {},
    xp: {},
    levelUp: true,
    muteUntil: null,
  })
}

export function user(id) {
  return (db.users[id] ??= { wallet: 0, bank: 0, inventory: {}, cooldowns: {}, todos: [], afk: null, wins: 0 })
}
