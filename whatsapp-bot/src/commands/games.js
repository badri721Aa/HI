// Chat games. One game runs per chat; players answer by just typing (no prefix needed).
import * as C from '../data/content.js'
import { user } from '../store.js'
import { pick, rand, shuffle, tag } from '../util.js'

const games = new Map() // chat → game state
const TIMEOUT = 3 * 60_000

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

function startGame(chat, game) {
  clearTimeout(games.get(chat)?.timer)
  game.startedAt = Date.now()
  games.set(chat, game)
  game.timer = setTimeout(() => {
    if (games.get(chat) === game) {
      games.delete(chat)
      game.sock.sendMessage(chat, { text: `⌛ Time's up! ${game.reveal ? `The answer was: *${game.reveal()}*` : 'Game over.'}` })
    }
  }, TIMEOUT)
}

function endGame(chat) {
  clearTimeout(games.get(chat)?.timer)
  games.delete(chat)
}

async function win(ctx, game, extra = '') {
  endGame(ctx.chat)
  const reward = game.reward ?? 50
  const u = user(ctx.sender)
  u.wins = (u.wins || 0) + 1
  u.wallet += reward
  await ctx.sock.sendMessage(ctx.chat, { text: `🎉 ${tag(ctx.sender)} got it!${extra}\n+${reward} 🪙`, mentions: [ctx.sender] }, { quoted: ctx.msg })
}

// Simple question/answer game factory (scramble, emoji quiz, flags, capitals, math…).
function quiz(ctx, question, answers, opts = {}) {
  const list = (Array.isArray(answers) ? answers : [answers]).map(norm)
  startGame(ctx.chat, {
    sock: ctx.sock,
    kind: opts.kind,
    reward: opts.reward,
    hint: opts.hint,
    reveal: () => list[0],
    check: (t) => list.includes(norm(t)),
  })
  return ctx.reply(`${question}\n_Type your answer · !hint · !stopgame_`)
}

const hangmanArt = ['', '😐', '😐\n |', '😐\n/|', '😐\n/|\\', '😐\n/|\\\n/', '😵\n/|\\\n/ \\']

function tttBoard(b) {
  const icon = (c, i) => c || ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][i]
  return [0, 3, 6].map((r) => b.slice(r, r + 3).map((c, i) => icon(c, r + i)).join('')).join('\n')
}
const tttLines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]

export const commands = [
  {
    name: 'trivia',
    aliases: ['quiz'],
    desc: 'Multiple-choice trivia question',
    run: (ctx) => {
      const [q, opts, ans] = pick(C.trivia)
      const letters = ['a', 'b', 'c', 'd']
      startGame(ctx.chat, {
        sock: ctx.sock,
        reveal: () => `${letters[ans].toUpperCase()}) ${opts[ans]}`,
        tried: new Set(), // one guess per person
        check: (t) => norm(t) === letters[ans] || norm(t) === norm(opts[ans]),
        wrong: (t) => letters.includes(norm(t)) || opts.some((o) => norm(o) === norm(t)),
      })
      ctx.reply(`❓ *${q}*\n${opts.map((o, i) => `${letters[i].toUpperCase()}) ${o}`).join('\n')}\n_Reply with A, B, C or D_`)
    },
  },
  {
    name: 'guess',
    aliases: ['guessnumber'],
    desc: 'Guess the number between 1 and 100',
    run: (ctx) => {
      const n = rand(1, 100)
      let tries = 0
      startGame(ctx.chat, {
        sock: ctx.sock,
        reveal: () => n,
        onText: async (c, t) => {
          if (!/^\d+$/.test(t.trim())) return false
          const g = Number(t)
          tries++
          if (g === n) await win(c, games.get(c.chat), ` The number was ${n} (${tries} tries)`)
          else await c.reply(g < n ? '⬆️ Higher' : '⬇️ Lower')
          return true
        },
      })
      ctx.reply('🔢 I picked a number from 1 to 100. Type your guesses!')
    },
  },
  {
    name: 'hangman',
    desc: 'Classic hangman — guess letters or the whole word',
    run: (ctx) => {
      const word = pick(C.hangmanWords)
      const state = { guessed: new Set(), wrong: 0 }
      const view = () => word.split('').map((l) => (state.guessed.has(l) ? l : '_')).join(' ')
      startGame(ctx.chat, {
        sock: ctx.sock,
        reward: 80,
        reveal: () => word,
        onText: async (c, t) => {
          const g = norm(t)
          if (!/^[a-z]+$/.test(g)) return false
          if (g === word) {
            await win(c, games.get(c.chat), ` The word was *${word}*`)
            return true
          }
          if (g.length !== 1) return false
          if (state.guessed.has(g)) {
            await c.reply(`Already guessed *${g}*`)
            return true
          }
          state.guessed.add(g)
          if (!word.includes(g)) state.wrong++
          if (word.split('').every((l) => state.guessed.has(l))) {
            await win(c, games.get(c.chat), ` The word was *${word}*`)
          } else if (state.wrong >= 6) {
            endGame(c.chat)
            await c.reply(`${hangmanArt[6]}\n💀 You lost! The word was *${word}*`)
          } else {
            await c.reply(`${hangmanArt[state.wrong]}\n\`${view()}\`\nWrong: ${[...state.guessed].filter((l) => !word.includes(l)).join(' ') || '-'} (${6 - state.wrong} lives)`)
          }
          return true
        },
      })
      ctx.reply(`🪢 *Hangman*\n\`${view()}\`\n${word.length} letters — type a letter!`)
    },
  },
  {
    name: 'scramble',
    aliases: ['unscramble'],
    desc: 'Unscramble the word',
    run: (ctx) => {
      const word = pick(C.hangmanWords)
      let s
      do s = shuffle(word.split('')).join('')
      while (s === word)
      return quiz(ctx, `🔀 Unscramble: *${s.toUpperCase()}*`, word, { hint: () => `Starts with *${word[0]}*, ${word.length} letters` })
    },
  },
  {
    name: 'mathquiz',
    aliases: ['math'],
    desc: 'Quick mental-math challenge',
    usage: '[easy|hard]',
    run: (ctx) => {
      const hard = ctx.args[0] === 'hard'
      const a = rand(2, hard ? 99 : 20)
      const b = rand(2, hard ? 99 : 20)
      const op = pick(hard ? ['+', '-', '*'] : ['+', '-'])
      const ans = op === '+' ? a + b : op === '-' ? a - b : a * b
      return quiz(ctx, `🧮 What is *${a} ${op === '*' ? '×' : op} ${b}*?`, String(ans), { reward: hard ? 80 : 40 })
    },
  },
  {
    name: 'emojiquiz',
    aliases: ['guessmovie'],
    desc: 'Guess the movie from emojis',
    run: (ctx) => {
      const [e, ans] = pick(C.emojiQuiz)
      return quiz(ctx, `🎬 Guess the movie: ${e}`, [ans, ans.replace(/^the /, '')], { hint: () => `${ans.split(' ').length} word(s), starts with *${ans[0].toUpperCase()}*` })
    },
  },
  {
    name: 'flagquiz',
    aliases: ['flag'],
    desc: 'Guess the country from its flag',
    run: (ctx) => {
      const [f, ans] = pick(C.flags)
      const alt = { 'united kingdom': ['uk', 'britain', 'england'], 'united states': ['usa', 'us', 'america'], 'united arab emirates': ['uae'], 'south korea': ['korea'] }
      return quiz(ctx, `🏳️ Which country? ${f}`, [ans, ...(alt[ans] || [])], { hint: () => `Starts with *${ans[0].toUpperCase()}*` })
    },
  },
  {
    name: 'capital',
    aliases: ['capitalquiz'],
    desc: 'Name the capital city',
    run: (ctx) => {
      const [country, city] = pick(C.capitals)
      return quiz(ctx, `🏛️ What is the capital of *${country}*?`, city, { hint: () => `Starts with *${city[0].toUpperCase()}*, ${city.length} letters` })
    },
  },
  {
    name: 'typerace',
    aliases: ['typing'],
    desc: 'First to type the sentence exactly wins',
    run: (ctx) => {
      const s = pick(C.typeRaceSentences)
      startGame(ctx.chat, {
        sock: ctx.sock,
        reward: 60,
        reveal: () => s,
        check: (t) => norm(t) === s,
        winText: (game) => ` in ${((Date.now() - game.startedAt) / 1000).toFixed(1)}s`,
      })
      // Zero-width joiners stop people copy-pasting the sentence.
      ctx.reply(`⌨️ *Type race!* Type this:\n\n${s.split('').join('​')}`)
    },
  },
  {
    name: 'ttt',
    aliases: ['tictactoe'],
    desc: 'Tic-tac-toe against another member',
    usage: '@opponent',
    groupOnly: true,
    run: (ctx) => {
      const opp = ctx.targets[0]
      if (!opp || opp === ctx.sender) return ctx.reply('Usage: !ttt @opponent')
      const board = Array(9).fill(null)
      const players = [ctx.sender, opp]
      let turn = 0
      startGame(ctx.chat, {
        sock: ctx.sock,
        reward: 100,
        onText: async (c, t) => {
          if (!/^[1-9]$/.test(t.trim()) || !players.includes(c.sender)) return false
          if (c.sender !== players[turn]) {
            await c.reply('⏳ Not your turn')
            return true
          }
          const i = Number(t) - 1
          if (board[i]) {
            await c.reply('That square is taken')
            return true
          }
          board[i] = turn ? '⭕' : '❌'
          const won = tttLines.some((l) => l.every((k) => board[k] === board[i]))
          if (won) return win(c, games.get(c.chat), `\n${tttBoard(board)}`).then(() => true)
          if (board.every(Boolean)) {
            endGame(c.chat)
            await c.reply(`${tttBoard(board)}\n🤝 Draw!`)
            return true
          }
          turn = 1 - turn
          await c.sock.sendMessage(c.chat, { text: `${tttBoard(board)}\n\nYour move ${tag(players[turn])} (${turn ? '⭕' : '❌'})`, mentions: [players[turn]] })
          return true
        },
      })
      return ctx.sock.sendMessage(ctx.chat, {
        text: `🎮 *Tic-tac-toe*\n❌ ${tag(players[0])} vs ⭕ ${tag(players[1])}\n\n${tttBoard(board)}\n\n${tag(players[0])} starts — type 1-9`,
        mentions: players,
      })
    },
  },
  {
    name: 'hint',
    desc: 'Get a hint for the current game',
    run: ({ reply, chat }) => {
      const g = games.get(chat)
      if (!g) return reply('No game running.')
      reply(g.hint ? `💡 ${g.hint()}` : 'No hints for this game 😅')
    },
  },
  {
    name: 'stopgame',
    aliases: ['endgame', 'giveup'],
    desc: 'Stop the current game and reveal the answer',
    run: ({ reply, chat }) => {
      const g = games.get(chat)
      if (!g) return reply('No game running.')
      endGame(chat)
      reply(`🛑 Game stopped.${g.reveal ? ` Answer: *${g.reveal()}*` : ''}`)
    },
  },
  {
    name: 'gamestats',
    aliases: ['wins'],
    desc: 'How many games you have won',
    usage: '[@user]',
    run: ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      return sock.sendMessage(chat, { text: `🏅 ${tag(who)} has won ${user(who).wins || 0} game(s)`, mentions: [who] })
    },
  },
]

// Called for every non-command message: lets players answer the running game.
export async function onMessage(ctx) {
  const game = games.get(ctx.chat)
  if (!game || !ctx.body) return false
  if (game.onText) return game.onText(ctx, ctx.body)
  if (game.tried?.has(ctx.sender)) return false
  if (game.check(ctx.body)) {
    await win(ctx, game, game.winText?.(game) || '')
    return true
  }
  if (game.wrong?.(ctx.body)) {
    game.tried?.add(ctx.sender)
    await ctx.react('❌')
    return true
  }
  return false
}
