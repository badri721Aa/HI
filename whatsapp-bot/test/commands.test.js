// Runs every command through the real message handler against a fake WhatsApp socket.
// Usage: npm test
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-')), 'db.json')
const { handleMessage, tick } = await import('../src/handler.js')
const { registry } = await import('../src/commands/index.js')
const { getDb } = await import('../src/store.js')

const GROUP = '120363000000000000@g.us'
const BOT = '15550000000:3@s.whatsapp.net'
const ADMIN = '15551111111@s.whatsapp.net'
const MEMBER = '15552222222@s.whatsapp.net'

const sent = []
const sock = {
  user: { id: BOT, lid: '99999@lid' },
  sendMessage: async (jid, content) => (sent.push({ jid, content }), { key: { id: 'X' + sent.length } }),
  groupMetadata: async () => ({
    id: GROUP, subject: 'Test Group', desc: 'A group', creation: 1700000000,
    participants: [
      { id: '15550000000@s.whatsapp.net', admin: 'admin' },
      { id: ADMIN, admin: 'superadmin' },
      { id: MEMBER, admin: null },
      { id: '15553333333@s.whatsapp.net', admin: null },
    ],
  }),
  groupParticipantsUpdate: async (_, ids) => ids.map((jid) => ({ jid, status: '200' })),
  groupSettingUpdate: async () => {},
  groupUpdateSubject: async () => {},
  groupUpdateDescription: async () => {},
  groupInviteCode: async () => 'INVITE',
  groupRevokeInvite: async () => 'NEWINVITE',
  groupRequestParticipantsList: async () => [],
  groupRequestParticipantsUpdate: async () => [],
  groupFetchAllParticipating: async () => ({ [GROUP]: { id: GROUP, subject: 'Test Group', participants: [1, 2] } }),
  groupLeave: async () => {},
  groupAcceptInvite: async () => GROUP,
  updateBlockStatus: async () => {},
  updateProfileStatus: async () => {},
  updateProfileName: async () => {},
  profilePictureUrl: async () => { throw new Error('no pic') },
}

let n = 0
const message = (text, { from = ADMIN, mentions = [], fromMe = false } = {}) => ({
  key: { remoteJid: GROUP, id: 'M' + ++n, participant: from, fromMe },
  pushName: 'Tester',
  messageTimestamp: Math.floor(Date.now() / 1000),
  message: mentions.length ? { extendedTextMessage: { text, contextInfo: { mentionedJid: mentions } } } : { conversation: text },
})

async function run(text, opts) {
  sent.length = 0
  const errors = []
  const origError = console.error
  console.error = (...a) => errors.push(a.join(' '))
  try {
    await handleMessage(sock, message(text, opts))
  } finally {
    console.error = origError
  }
  const replies = sent.map((s) => s.content.text ?? (s.content.poll ? '[poll]' : s.content.image ? '[image]' : s.content.document ? '[document]' : s.content.react ? '[react]' : JSON.stringify(s.content)))
  return { replies, errors }
}

// Example arguments for commands that need them (everything else also runs with no arguments).
const samples = {
  help: 'fun', ship: '@15552222222 @15553333333', rate: 'pizza', choose: 'a | b | c', horoscope: 'leo', rps: 'rock',
  dice: '2d6', countdown: '2030-01-01', '8ball': 'will it work?', calc: '(2+3)*4^2', sqrt: '16', square: '3', percent: '15 200',
  randnum: '1 10', isprime: '97', factors: '360', divisors: '36', fib: '10', factorial: '20', gcd: '12 18', lcm: '4 6',
  roman: '2026', average: '1 2 3 4', bmi: '70 175', tip: '100 15 2', split: '300 4', age: '2000-05-21', leapyear: '2024',
  base: 'ff 16 2', dayofweek: '2026-12-25', datediff: '2026-01-01 2026-12-31', quadratic: '1 -3 2', interest: '1000 5 10',
  discount: '80 25', convert: '10 km mi', temp: '100c', length: '5 km mi', weight: '70 kg lb', volume: '2 l cup',
  speed: '100 km/h mph', area: '1 acre m2', datasize: '1 gb mb', timeunit: '3 day h', hex2rgb: '#ff8800', rgb2hex: '255 136 0',
  epoch: '2026-01-01', shoesize: '42 eu', caesar: '3 hello', repeat: '2 hi', anagram: 'listen silent',
  poll: 'Lunch? | Pizza | Sushi', multipoll: 'Days? | Mon | Tue', save: 'wifi pass1234', note: 'wifi', delnote: 'wifi',
  todo: 'buy milk', done: '1', remind: '1s test reminder', password: '20', hash: 'hello', lorem: '10', qr: 'https://example.com',
  mention: '15552222222 hi', setwarnlimit: '3', mute: '1s', setname: 'New name', setdesc: 'New desc', add: '15554444444',
  antilink: 'on', antispam: 'on', antibadword: 'on', welcome: 'on', levelup: 'on', addbadword: 'darn', delbadword: 'darn',
  setwelcome: 'Hi {user} welcome to {group}', setgoodbye: 'Bye {user}', setrules: 'Be nice', resetwarn: 'all', resetxp: 'all',
  kickall: '', mode: 'public', setprefix: '!', broadcast: 'hello all', join: 'https://chat.whatsapp.com/ABC', setbio: 'bio',
  setbotname: 'Bot', bet: '10', slots: '10', deposit: '10', withdraw: '5', buy: 'padlock', sell: 'padlock', give: '@15552222222 5',
  mathquiz: 'hard', teams: '2', time: 'Asia/Riyadh', calendar: '12 2026', who: 'is the funniest?', report: '@15552222222 spam',
  feedback: 'nice bot', afk: 'eating', translate: 'es hello', currency: '100 USD EUR', weather: 'London', wiki: 'Cat',
  define: 'cat', synonyms: 'happy', crypto: 'btc', github: 'torvalds', country: 'japan', shorten: 'https://example.com', ipinfo: '8.8.8.8',
}
const withMention = new Set(['kick', 'promote', 'demote', 'warn', 'unwarn', 'warnings', 'botban', 'botunban', 'whois', 'rank', 'pfp',
  'compliment', 'roast', 'slap', 'hug', 'highfive', 'iq', 'cool', 'lucky', 'sus', 'vibe', 'mood', 'balance', 'inventory', 'gamestats',
  'rob', 'ttt', 'hack', 'block', 'unblock', 'wame'])
const skip = new Set(['restart']) // would exit the process

const failures = []
for (const cmd of registry.list) {
  if (skip.has(cmd.name)) continue
  const variants = ['']
  if (samples[cmd.name] !== undefined) variants.push(samples[cmd.name])
  if (withMention.has(cmd.name)) variants.push('@15552222222')
  if (cmd.name.match(/^(reverse|upper|lower|title|mock|clap|vapor|smallcaps|bubble|bold|italic|script|mono|double|strike|underline|upsidedown|binary|hex|base64|morse|rot13|leet|nato|piglatin|emojify|space|zalgo|shuffle|sortlines|dedupe|urlencode|urldecode|count|palindrome|say|readmore)$/)) variants.push('Hello World 123')
  for (const v of variants) {
    const mentions = v.match(/@\d+/g)?.map((m) => m.slice(1) + '@s.whatsapp.net') || []
    const { replies, errors } = await run(`!${cmd.name} ${v}`.trim(), { mentions, fromMe: !!cmd.owner })
    if (process.env.DUMP) console.log(`\n### !${cmd.name} ${v}\n${replies.join('\n---\n').slice(0, 400)}`)
    const bad = errors.length || replies.some((r) => r.includes('Something went wrong'))
    if (bad || !replies.length) failures.push(`!${cmd.name} ${v} → ${bad ? errors.join(' | ') || replies.join(' | ') : 'no reply'}`)
  }
}

// Permission checks
assert.match((await run('!kick @15553333333', { from: MEMBER, mentions: ['15553333333@s.whatsapp.net'] })).replies[0], /Only group admins/)
assert.match((await run('!broadcast hi', { from: MEMBER })).replies[0], /Only the bot owner/)
// Aliases
assert.ok((await run('!flip')).replies[0].match(/Heads|Tails/))
// Text tool output
assert.strictEqual((await run('!reverse abc')).replies[0], 'cba')
assert.strictEqual((await run('!unmorse .... ..')).replies[0], 'hi')
assert.match((await run('!calc 2+2*3')).replies[0], /\*8\*/)
// Games: start a number game, answer by typing
await run('!mathquiz')
const q = sent[0].content.text.match(/\*(\d+) ([-+×]) (\d+)\*/)
const ans = q[2] === '+' ? +q[1] + +q[3] : q[2] === '-' ? q[1] - q[3] : q[1] * q[3]
assert.match((await run(String(ans), { from: MEMBER })).replies[0], /got it/)
// Own messages from the phone (self mode) still run commands
assert.match((await run('!ping', { fromMe: true, from: undefined })).replies[0], /pong/)
// Reminders fire
await run('!remind 1s hello later')
getDb().reminders.forEach((r) => (r.at = 0))
sent.length = 0
await tick(sock)
assert.ok(sent.some((s) => /hello later/.test(s.content.text)))
// Self mode blocks other people
getDb().settings.mode = 'self'
assert.strictEqual((await run('!ping', { from: MEMBER })).replies.length, 0)
getDb().settings.mode = 'public'

console.log(`Checked ${registry.list.length} commands.`)
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n` + failures.join('\n'))
  process.exit(1)
}
console.log('All commands OK ✅')
process.exit(0)
