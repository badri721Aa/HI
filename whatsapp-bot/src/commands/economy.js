// Virtual coins 🪙 — just for fun, nothing real.
import * as C from '../data/content.js'
import { getDb, user } from '../store.js'
import { fmtDuration, fmtNum, pick, rand, tag } from '../util.js'

const coin = (n) => `${fmtNum(n)} 🪙`

// Returns remaining ms if the action is on cooldown, else starts the cooldown and returns 0.
function cooldown(u, key, ms) {
  const left = (u.cooldowns[key] || 0) - Date.now()
  if (left > 0) return left
  u.cooldowns[key] = Date.now() + ms
  return 0
}

const amountArg = (arg, max) => (arg === 'all' || arg === 'max' ? max : Math.floor(Number(arg)))

function useItem(u, item) {
  if (!u.inventory[item]) return false
  if (--u.inventory[item] <= 0) delete u.inventory[item]
  return true
}

// Builds a timed earning command (daily, work, beg…).
const earn = (name, desc, ms, fn, aliases = []) => ({
  name,
  aliases,
  desc: `${desc} (every ${fmtDuration(ms)})`,
  run: (ctx) => {
    const left = cooldown(ctx.u, name, ms)
    if (left) return ctx.reply(`⏳ Try again in ${fmtDuration(left)}`)
    return fn(ctx)
  },
})

// Builds a gathering command that needs a tool (fish, hunt, mine).
const gather = (name, tool, loot, emoji) => ({
  name,
  desc: `Go ${name}ing (needs a ${tool} from !shop)`,
  run: ({ u, reply }) => {
    if (!u.inventory[tool]) return reply(`You need a *${tool}*. Buy one: !buy ${tool}`)
    const left = cooldown(u, name, 5 * 60_000)
    if (left) return reply(`⏳ Rest a bit — ${fmtDuration(left)}`)
    const [what, value] = pick(loot)
    const v = value ? rand(Math.round(value * 0.7), Math.round(value * 1.3)) : 0
    u.wallet += v
    if (Math.random() < 0.05) {
      useItem(u, tool)
      return reply(`${emoji} You got ${what} (+${coin(v)})… but your ${tool} broke! 💥`)
    }
    reply(`${emoji} You got ${what}${v ? ` and sold it for ${coin(v)}` : ''}`)
  },
})

export const commands = [
  {
    name: 'balance',
    aliases: ['bal', 'wallet', 'money'],
    desc: 'Your coins (wallet + bank)',
    usage: '[@user]',
    run: ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      const u = user(who)
      return sock.sendMessage(chat, { text: `💰 ${tag(who)}\nWallet: ${coin(u.wallet)}\nBank: ${coin(u.bank)}\nTotal: ${coin(u.wallet + u.bank)}`, mentions: [who] })
    },
  },
  earn('daily', 'Claim your daily coins', 24 * 3600_000, ({ u, reply }) => {
    const amt = rand(400, 700)
    u.wallet += amt
    reply(`📅 Daily reward: +${coin(amt)}`)
  }),
  earn('weekly', 'Claim your weekly coins', 7 * 24 * 3600_000, ({ u, reply }) => {
    const amt = rand(2500, 4000)
    u.wallet += amt
    reply(`🗓️ Weekly reward: +${coin(amt)}`)
  }),
  earn('work', 'Work a shift for coins', 60 * 60_000, ({ u, reply }) => {
    const amt = rand(100, 350)
    u.wallet += amt
    reply(`💼 You ${pick(C.workJobs)} and earned ${coin(amt)}`)
  }, ['job']),
  earn('beg', 'Beg for spare coins', 10 * 60_000, ({ u, reply }) => {
    if (Math.random() < 0.3) return reply('🙅 Nobody gave you anything.')
    const amt = rand(10, 80)
    u.wallet += amt
    reply(`🥺 A stranger gave you ${coin(amt)}`)
  }),
  earn('crime', 'Risky crime — win big or pay a fine', 30 * 60_000, ({ u, reply }) => {
    if (Math.random() < 0.45) {
      const amt = rand(300, 900)
      u.wallet += amt
      return reply(`🦹 Heist successful! +${coin(amt)}`)
    }
    const fine = Math.min(u.wallet, rand(150, 500))
    u.wallet -= fine
    reply(`🚔 Caught! You paid a ${coin(fine)} fine.`)
  }),
  {
    name: 'bet',
    aliases: ['gamble'],
    desc: 'Bet coins on a coin flip (double or nothing)',
    usage: '<amount|all>',
    run: ({ u, args, reply }) => {
      const amt = amountArg(args[0], u.wallet)
      if (!(amt > 0)) return reply('Usage: !bet 100')
      if (amt > u.wallet) return reply(`You only have ${coin(u.wallet)}`)
      const lucky = useItem(u, 'luckycharm')
      if (Math.random() < (lucky ? 0.6 : 0.48)) {
        u.wallet += amt
        reply(`🎰 You won ${coin(amt)}!${lucky ? ' 🍀' : ''} Wallet: ${coin(u.wallet)}`)
      } else {
        u.wallet -= amt
        reply(`😢 You lost ${coin(amt)}. Wallet: ${coin(u.wallet)}`)
      }
    },
  },
  {
    name: 'slots',
    aliases: ['slot'],
    desc: 'Spin the slot machine',
    usage: '<amount>',
    run: ({ u, args, reply }) => {
      const amt = amountArg(args[0] || '50', u.wallet)
      if (!(amt > 0) || amt > u.wallet) return reply(`Usage: !slots 50 (you have ${coin(u.wallet)})`)
      const reels = ['🍒', '🍋', '🍇', '🔔', '⭐', '💎']
      const lucky = useItem(u, 'luckycharm')
      const spin = Array.from({ length: 3 }, () => pick(reels))
      if (lucky && Math.random() < 0.3) spin[2] = spin[1] = spin[0]
      const [a, b, c] = spin
      const mult = a === b && b === c ? (a === '💎' ? 10 : 5) : a === b || b === c || a === c ? 1.5 : 0
      const win = Math.floor(amt * mult) - amt
      u.wallet += win
      reply(`🎰 | ${spin.join(' | ')} |\n${win > 0 ? `You won ${coin(win)}!` : win === 0 ? 'Broke even' : `You lost ${coin(-win)}`}\nWallet: ${coin(u.wallet)}`)
    },
  },
  {
    name: 'give',
    aliases: ['pay', 'transfer'],
    desc: 'Give coins to someone',
    usage: '@user <amount>',
    run: ({ sock, chat, u, targets, args, reply, sender }) => {
      const to = targets[0]
      const amt = amountArg(args.find((a) => !a.startsWith('@')), u.wallet)
      if (!to || !(amt > 0)) return reply('Usage: !give @user 100')
      if (to === sender) return reply('You cannot pay yourself 🙃')
      if (amt > u.wallet) return reply(`You only have ${coin(u.wallet)}`)
      u.wallet -= amt
      user(to).wallet += amt
      return sock.sendMessage(chat, { text: `💸 ${tag(sender)} gave ${coin(amt)} to ${tag(to)}`, mentions: [sender, to] })
    },
  },
  {
    name: 'rob',
    aliases: ['steal'],
    desc: "Try to steal from someone's wallet",
    usage: '@user',
    run: ({ sock, chat, u, targets, reply, sender }) => {
      const to = targets[0]
      if (!to || to === sender) return reply('Usage: !rob @user')
      const v = user(to)
      if (v.wallet < 100) return reply("They're too broke to rob 😅")
      if (u.wallet < 200) return reply('You need at least 200 🪙 to attempt a robbery.')
      const left = cooldown(u, 'rob', 60 * 60_000)
      if (left) return reply(`⏳ Lay low for ${fmtDuration(left)}`)
      if (useItem(v, 'padlock')) return sock.sendMessage(chat, { text: `🔒 ${tag(to)}'s padlock stopped the robbery!`, mentions: [to] })
      if (Math.random() < 0.4) {
        const amt = Math.floor(v.wallet * (rand(10, 40) / 100))
        v.wallet -= amt
        u.wallet += amt
        return sock.sendMessage(chat, { text: `🦹 ${tag(sender)} stole ${coin(amt)} from ${tag(to)}!`, mentions: [sender, to] })
      }
      const fine = rand(100, 300)
      u.wallet = Math.max(0, u.wallet - fine)
      v.wallet += fine
      return sock.sendMessage(chat, { text: `🚨 ${tag(sender)} got caught and paid ${tag(to)} ${coin(fine)}`, mentions: [sender, to] })
    },
  },
  {
    name: 'deposit',
    aliases: ['dep'],
    desc: 'Move coins to the bank (safe from robbers)',
    usage: '<amount|all>',
    run: ({ u, args, reply }) => {
      const amt = amountArg(args[0], u.wallet)
      if (!(amt > 0) || amt > u.wallet) return reply(`Usage: !deposit 100 (wallet: ${coin(u.wallet)})`)
      u.wallet -= amt
      u.bank += amt
      reply(`🏦 Deposited ${coin(amt)}. Bank: ${coin(u.bank)}`)
    },
  },
  {
    name: 'withdraw',
    aliases: ['wd'],
    desc: 'Take coins out of the bank',
    usage: '<amount|all>',
    run: ({ u, args, reply }) => {
      const amt = amountArg(args[0], u.bank)
      if (!(amt > 0) || amt > u.bank) return reply(`Usage: !withdraw 100 (bank: ${coin(u.bank)})`)
      u.bank -= amt
      u.wallet += amt
      reply(`🏧 Withdrew ${coin(amt)}. Wallet: ${coin(u.wallet)}`)
    },
  },
  {
    name: 'richest',
    aliases: ['baltop', 'forbes'],
    desc: 'Richest members in this group',
    groupOnly: true,
    run: ({ sock, chat, meta, reply }) => {
      const users = getDb().users
      const top = meta.participants
        .map((p) => [p.id, (users[p.id]?.wallet || 0) + (users[p.id]?.bank || 0)])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
      if (!top.length) return reply('Everyone is broke! Try !daily')
      return sock.sendMessage(chat, { text: '🤑 *Richest members*\n' + top.map(([id, v], i) => `${i + 1}. ${tag(id)} — ${coin(v)}`).join('\n'), mentions: top.map(([id]) => id) })
    },
  },
  {
    name: 'shop',
    aliases: ['store'],
    desc: 'Items you can buy',
    run: ({ reply }) => reply('🛒 *Shop*\n' + Object.entries(C.shopItems).map(([k, v]) => `• *${k}* — ${coin(v.price)}\n   ${v.desc}`).join('\n') + '\n\nBuy with !buy <item>'),
  },
  {
    name: 'buy',
    desc: 'Buy an item from the shop',
    usage: '<item> [qty]',
    run: ({ u, args, reply }) => {
      const name = args[0]?.toLowerCase()
      const item = C.shopItems[name]
      const qty = Math.max(1, Math.min(Number(args[1]) || 1, 100))
      if (!item) return reply('Unknown item. See !shop')
      const cost = item.price * qty
      if (u.wallet < cost) return reply(`You need ${coin(cost)} (you have ${coin(u.wallet)})`)
      u.wallet -= cost
      u.inventory[name] = (u.inventory[name] || 0) + qty
      reply(`✅ Bought ${qty}× ${name} for ${coin(cost)}`)
    },
  },
  {
    name: 'sell',
    desc: 'Sell an item back for half price',
    usage: '<item> [qty]',
    run: ({ u, args, reply }) => {
      const name = args[0]?.toLowerCase()
      const qty = Math.max(1, Number(args[1]) || 1)
      if (!u.inventory[name] || u.inventory[name] < qty) return reply("You don't have that. See !inventory")
      const value = Math.floor(C.shopItems[name].price / 2) * qty
      u.inventory[name] -= qty
      if (!u.inventory[name]) delete u.inventory[name]
      u.wallet += value
      reply(`💱 Sold ${qty}× ${name} for ${coin(value)}`)
    },
  },
  {
    name: 'inventory',
    aliases: ['inv', 'bag'],
    desc: 'Items you own',
    usage: '[@user]',
    run: ({ sock, chat, targets, sender }) => {
      const who = targets[0] || sender
      const inv = Object.entries(user(who).inventory)
      return sock.sendMessage(chat, { text: `🎒 ${tag(who)}\n` + (inv.map(([k, n]) => `• ${k} ×${n}`).join('\n') || 'Empty'), mentions: [who] })
    },
  },
  gather('fish', 'fishingrod', C.fishLoot, '🎣'),
  gather('hunt', 'rifle', C.huntLoot, '🏹'),
  gather('mine', 'pickaxe', C.mineLoot, '⛏️'),
]
