import * as C from '../data/content.js'
import { pick, rand, sleep, tag } from '../util.js'

// Stable "random" score for a piece of text, so !rate pizza always gives the same answer today.
function seeded(text, max = 100) {
  let h = 2166136261
  for (const ch of text.toLowerCase() + new Date().toDateString()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return Math.abs(h) % (max + 1)
}

const simple = (name, desc, list, prefix = '', aliases = []) => ({ name, aliases, desc, run: ({ reply }) => reply(prefix + pick(list)) })

// Command that targets a member (or yourself) with a line from a list.
const targeted = (name, desc, list, emoji) => ({
  name,
  desc,
  usage: '[@user]',
  run: ({ sock, chat, targets, sender }) => {
    const who = targets[0] || sender
    return sock.sendMessage(chat, { text: `${emoji} ${tag(who)}, ${pick(list)}`, mentions: [who] })
  },
})

// Command that gives a member a deterministic percentage score.
const meter = (name, desc, emoji, label) => ({
  name,
  desc,
  usage: '[@user]',
  run: ({ sock, chat, targets, sender }) => {
    const who = targets[0] || sender
    const v = seeded(name + who)
    return sock.sendMessage(chat, { text: `${emoji} ${tag(who)} is *${v}%* ${label}`, mentions: [who] })
  },
})

let activeRiddle = new Map()

export const commands = [
  {
    name: '8ball',
    aliases: ['ask8'],
    desc: 'Ask the magic 8-ball a question',
    usage: '<question>',
    run: ({ reply, text }) => reply(text ? `🎱 ${pick(C.eightBall)}` : 'Ask a question: !8ball will it rain?'),
  },
  { name: 'coin', aliases: ['flip', 'coinflip'], desc: 'Flip a coin', run: ({ reply }) => reply(`🪙 ${Math.random() < 0.5 ? 'Heads' : 'Tails'}!`) },
  {
    name: 'dice',
    aliases: ['roll'],
    desc: 'Roll dice (e.g. 2d6, d20)',
    usage: '[NdM]',
    run: ({ reply, args }) => {
      const m = /^(\d*)d(\d+)$/i.exec(args[0] || 'd6')
      if (!m) return reply('Usage: !roll 2d6')
      const n = Math.min(Number(m[1] || 1), 50)
      const sides = Math.min(Math.max(Number(m[2]), 2), 1000)
      const rolls = Array.from({ length: n }, () => rand(1, sides))
      reply(`🎲 ${rolls.join(' + ')}${n > 1 ? ` = *${rolls.reduce((a, b) => a + b, 0)}*` : ''}`)
    },
  },
  {
    name: 'rate',
    desc: 'Rate anything out of 10',
    usage: '<thing>',
    run: ({ reply, text }) => reply(text ? `⭐ I rate *${text}* a ${Math.round(seeded(text) / 10)}/10` : 'Usage: !rate pizza'),
  },
  {
    name: 'ship',
    aliases: ['love'],
    desc: 'Love compatibility between two people',
    usage: '@user [@user]',
    run: ({ sock, chat, targets, sender, reply }) => {
      const [a, b] = targets.length >= 2 ? targets : [sender, targets[0]]
      if (!b) return reply('Usage: !ship @person1 @person2')
      const v = seeded([a, b].sort().join())
      const verdict = v > 80 ? 'Soulmates 💍' : v > 60 ? 'Great match 💕' : v > 40 ? 'Could work 🙂' : v > 20 ? 'Just friends 🤝' : 'Run 🏃'
      return sock.sendMessage(chat, { text: `💘 ${tag(a)} + ${tag(b)}\n${'❤️'.repeat(Math.round(v / 20)) || '💔'} *${v}%*\n${verdict}`, mentions: [a, b] })
    },
  },
  simple('joke', 'A random joke', C.jokes, '😂 '),
  simple('pun', 'A terrible pun', C.puns, '🙃 '),
  simple('fact', 'A random fun fact', C.facts, '🧠 ', ['funfact']),
  simple('quote', 'An inspiring quote', C.quotes, '💬 '),
  simple('advice', 'Some life advice', C.advice, '💡 '),
  simple('pickup', 'A cheesy pickup line', C.pickupLines, '😏 ', ['pickupline']),
  simple('truth', 'Truth question', C.truths, '🫢 *Truth:* '),
  simple('dare', 'A dare', C.dares, '😈 *Dare:* '),
  simple('wyr', 'Would you rather…', C.wouldYouRather, '🤔 Would you rather ', ['wouldyourather']),
  simple('nhie', 'Never have I ever…', C.neverHaveIEver, '🙈 Never have I ever ', ['neverhaveiever']),
  simple('fortune', 'Open a fortune cookie', C.fortunes, '🥠 '),
  simple('motivate', 'A motivational boost', C.motivations, '🔥 ', ['motivation']),
  targeted('compliment', 'Compliment someone', C.compliments, '💐'),
  targeted('roast', 'Lighthearted roast', C.roasts, '🔥'),
  {
    name: 'tod',
    aliases: ['truthordare'],
    desc: 'Random truth or dare',
    run: ({ reply }) => reply(Math.random() < 0.5 ? `🫢 *Truth:* ${pick(C.truths)}` : `😈 *Dare:* ${pick(C.dares)}`),
  },
  {
    name: 'riddle',
    desc: 'Get a riddle (reveal with !answer)',
    run: ({ reply, chat }) => {
      const r = pick(C.riddles)
      activeRiddle.set(chat, r)
      reply(`🧩 ${r[0]}\n_Type !answer to reveal_`)
    },
  },
  {
    name: 'answer',
    aliases: ['reveal'],
    desc: 'Reveal the answer to the last riddle',
    run: ({ reply, chat }) => {
      const r = activeRiddle.get(chat)
      if (!r) return reply('No riddle yet — try !riddle')
      activeRiddle.delete(chat)
      reply(`💡 ${r[1]}`)
    },
  },
  {
    name: 'choose',
    aliases: ['pickone'],
    desc: 'Let the bot choose for you',
    usage: 'a | b | c',
    run: ({ reply, text }) => {
      const opts = text.split(/\s*(?:\||,|\bor\b)\s*/i).filter(Boolean)
      reply(opts.length > 1 ? `🤔 I choose: *${pick(opts)}*` : 'Usage: !choose pizza | burger | sushi')
    },
  },
  {
    name: 'iq',
    desc: 'Very scientific IQ test',
    usage: '[@user]',
    run: ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      const iq = 60 + seeded('iq' + who, 100)
      return sock.sendMessage(chat, { text: `🧠 ${tag(who)}'s IQ today: *${iq}* ${iq > 130 ? '🤓 genius!' : iq > 100 ? '😎 sharp' : '🥴 needs coffee'}`, mentions: [who] })
    },
  },
  meter('cool', 'How cool is someone?', '😎', 'cool'),
  meter('lucky', "Today's luck meter", '🍀', 'lucky today'),
  meter('sus', 'How sus is someone?', '📮', 'sus'),
  meter('vibe', 'Vibe check', '✨', 'vibing'),
  {
    name: 'hack',
    desc: 'Fake "hack" someone (a harmless prank)',
    usage: '@user',
    run: async ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      const steps = ['💻 Connecting to mainframe…', '🔓 Bypassing firewall…', '📂 Downloading memes…', '🔍 Found 4,382 selfies', `✅ ${tag(who)} has been hacked! (just kidding 😜)`]
      for (const s of steps) {
        await sock.sendMessage(chat, { text: s, mentions: [who] })
        await sleep(900)
      }
    },
  },
  {
    name: 'horoscope',
    aliases: ['zodiac'],
    desc: "Today's (totally real) horoscope",
    usage: '<sign>',
    run: ({ reply, args }) => {
      const sign = args[0]?.toLowerCase()
      if (!C.horoscopeSigns.includes(sign)) return reply(`Signs: ${C.horoscopeSigns.join(', ')}`)
      reply(`🔮 *${sign[0].toUpperCase() + sign.slice(1)}*\n${C.horoscopeLines[seeded(sign, C.horoscopeLines.length - 1)]}\nLucky number: ${seeded(sign + 'n', 99)}`)
    },
  },
  {
    name: 'rps',
    desc: 'Rock, paper, scissors vs the bot',
    usage: 'rock|paper|scissors',
    run: ({ reply, args }) => {
      const opts = ['rock', 'paper', 'scissors']
      const icons = { rock: '🪨', paper: '📄', scissors: '✂️' }
      const me = opts.find((o) => o.startsWith(args[0]?.toLowerCase() || '-'))
      if (!me) return reply('Usage: !rps rock|paper|scissors')
      const bot = pick(opts)
      const res = me === bot ? "It's a tie!" : (opts.indexOf(me) + 1) % 3 === opts.indexOf(bot) ? 'I win! 😎' : 'You win! 🎉'
      reply(`${icons[me]} vs ${icons[bot]}\n${res}`)
    },
  },
  {
    name: 'mood',
    desc: "The bot guesses someone's mood",
    usage: '[@user]',
    run: ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      return sock.sendMessage(chat, { text: `${tag(who)} is feeling ${pick(C.moods)} today`, mentions: [who] })
    },
  },
  {
    name: 'emoji',
    aliases: ['randomemoji'],
    desc: 'Random emojis',
    usage: '[count]',
    run: ({ reply, args }) => {
      const pool = [...'😀😂🥰😎🤩🥳😴🤯🥶😈👻🤖👽🐶🐱🦊🐼🐸🐵🦄🍕🍔🍟🌮🍩🍪🎂⚽🏀🎮🎧🎸🚀🌈🔥⭐🌙☀️💎🎁']
      reply(Array.from({ length: Math.min(Number(args[0]) || 5, 50) }, () => pick(pool)).join(''))
    },
  },
  {
    name: 'color',
    aliases: ['randomcolor'],
    desc: 'Random colour with hex and RGB',
    run: ({ reply }) => {
      const [r, g, b] = [rand(0, 255), rand(0, 255), rand(0, 255)]
      reply(`🎨 #${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}\nrgb(${r}, ${g}, ${b})`)
    },
  },
  {
    name: 'fakename',
    aliases: ['randomname'],
    desc: 'Random name generator',
    run: ({ reply }) => reply(`🪪 ${pick(C.firstNames)} ${pick(C.lastNames)}`),
  },
  {
    name: 'slap',
    desc: 'Slap someone with a trout 🐟',
    usage: '@user',
    run: ({ sock, chat, targets, sender, reply }) => {
      if (!targets[0]) return reply('Usage: !slap @user')
      return sock.sendMessage(chat, { text: `🐟 ${tag(sender)} slaps ${tag(targets[0])} around a bit with a large trout`, mentions: [sender, targets[0]] })
    },
  },
  {
    name: 'hug',
    desc: 'Send someone a hug',
    usage: '@user',
    run: ({ sock, chat, targets, sender, reply }) => {
      if (!targets[0]) return reply('Usage: !hug @user')
      return sock.sendMessage(chat, { text: `🤗 ${tag(sender)} hugs ${tag(targets[0])}`, mentions: [sender, targets[0]] })
    },
  },
  {
    name: 'highfive',
    desc: 'High five someone',
    usage: '@user',
    run: ({ sock, chat, targets, sender, reply }) => {
      if (!targets[0]) return reply('Usage: !highfive @user')
      return sock.sendMessage(chat, { text: `🙏 ${tag(sender)} high-fives ${tag(targets[0])}!`, mentions: [sender, targets[0]] })
    },
  },
  {
    name: 'countdown',
    aliases: ['daysuntil'],
    desc: 'Days until a date',
    usage: '<YYYY-MM-DD>',
    run: ({ reply, args }) => {
      const d = new Date(args[0] + 'T00:00:00')
      if (isNaN(d)) return reply('Usage: !countdown 2026-12-31')
      const days = Math.ceil((d - Date.now()) / 86400000)
      reply(days >= 0 ? `⏳ ${days} day(s) until ${d.toDateString()}` : `📆 That was ${-days} day(s) ago`)
    },
  },
]
