// Text tools. Each works on the text after the command, or on the message you reply to.
const mapChars = (from, to) => {
  const a = [...from]
  const b = [...to]
  return (s) => [...s].map((c) => (a.indexOf(c) >= 0 ? b[a.indexOf(c)] : c)).join('')
}
const ABC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const offsetFont = (lower, upper, digit) => (s) =>
  [...s]
    .map((c) => {
      const code = c.charCodeAt(0)
      if (c >= 'a' && c <= 'z') return String.fromCodePoint(lower + code - 97)
      if (c >= 'A' && c <= 'Z') return String.fromCodePoint(upper + code - 65)
      if (digit && c >= '0' && c <= '9') return String.fromCodePoint(digit + code - 48)
      return c
    })
    .join('')

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.', '@': '.--.-.', ' ': '/',
}
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]))
const NATO = 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' ')

const rot = (s, n) => s.replace(/[a-z]/gi, (c) => {
  const base = c <= 'Z' ? 65 : 97
  return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base)
})

// Builds a "transform this text" command.
const tf = (name, desc, fn, aliases = []) => ({
  name,
  aliases,
  desc,
  usage: '<text>',
  run: ({ reply, text, quoted }) => {
    const input = text || quoted?.text
    if (!input) return reply(`Usage: !${name} your text (or reply to a message)`)
    const out = fn(input)
    return reply(out === '' ? '(empty)' : String(out).slice(0, 6000))
  },
})

const zalgoUp = [...'̍̎̄̅̿̑̆̐͒͗͑̇̈̊͂̓̈́͊͋͌']
const zalgoDown = [...'̖̗̘̙̜̝̞̟̠̤̥̦̩̪̫̬̭̮̯̰']
const rnd = (a) => a[Math.floor(Math.random() * a.length)]

export const commands = [
  tf('reverse', 'Reverse text', (s) => [...s].reverse().join('')),
  tf('upper', 'UPPERCASE', (s) => s.toUpperCase(), ['uppercase']),
  tf('lower', 'lowercase', (s) => s.toLowerCase(), ['lowercase']),
  tf('title', 'Title Case Every Word', (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()), ['titlecase']),
  tf('mock', 'sPoNgEbOb MoCk TeXt', (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join(''), ['spongebob']),
  tf('clap', 'Add 👏 between 👏 words', (s) => s.split(/\s+/).join(' 👏 ')),
  tf('vapor', 'Ｖａｐｏｒｗａｖｅ text', (s) => [...s].map((c) => (c >= '!' && c <= '~' ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c === ' ' ? '　' : c)).join(''), ['aesthetic']),
  tf('smallcaps', 'sᴍᴀʟʟ ᴄᴀᴘs', (s) => mapChars('abcdefghijklmnopqrstuvwxyz', 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ')(s.toLowerCase())),
  tf('bubble', 'ⓑⓤⓑⓑⓛⓔ text', offsetFont(0x24d0, 0x24b6, null)),
  tf('bold', '𝐁𝐨𝐥𝐝 unicode text', offsetFont(0x1d41a, 0x1d400, 0x1d7ce)),
  tf('italic', '𝘐𝘵𝘢𝘭𝘪𝘤 unicode text', offsetFont(0x1d622, 0x1d608, null)),
  tf('script', '𝓒𝓾𝓻𝓼𝓲𝓿𝓮 text', offsetFont(0x1d4ea, 0x1d4d0, null), ['cursive']),
  tf('mono', '𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 text', offsetFont(0x1d68a, 0x1d670, 0x1d7f6), ['monospace']),
  tf('double', '𝕕𝕠𝕦𝕓𝕝𝕖-𝕤𝕥𝕣𝕦𝕔𝕜 text', (s) => {
    const special = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }
    return [...s].map((c) => special[c] || offsetFont(0x1d552, 0x1d538, 0x1d7d8)(c)).join('')
  }),
  tf('strike', 'S̶t̶r̶i̶k̶e̶t̶h̶r̶o̶u̶g̶h̶', (s) => [...s].map((c) => c + '̶').join('')),
  tf('underline', 'U̲n̲d̲e̲r̲l̲i̲n̲e̲', (s) => [...s].map((c) => c + '̲').join('')),
  tf('upsidedown', 'uʍop ǝpısdn', (s) => [...mapChars(ABC + '.,!?\'', 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIſꓘ⅂WNOԀΌꓤS⊥∩ΛMX⅄Z0ƖᄅƐㄣϛ9ㄥ86˙\'¡¿,')(s)].reverse().join(''), ['fliptext']),
  tf('binary', 'Text → binary', (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(2).padStart(8, '0')).join(' ')),
  tf('unbinary', 'Binary → text', (s) => new TextDecoder().decode(new Uint8Array((s.match(/[01]{8}/g) || []).map((b) => parseInt(b, 2))))),
  tf('hex', 'Text → hexadecimal', (s) => Buffer.from(s).toString('hex').match(/../g).join(' ')),
  tf('unhex', 'Hexadecimal → text', (s) => Buffer.from(s.replace(/[^0-9a-f]/gi, ''), 'hex').toString()),
  tf('base64', 'Encode Base64', (s) => Buffer.from(s).toString('base64'), ['b64']),
  tf('unbase64', 'Decode Base64', (s) => Buffer.from(s, 'base64').toString(), ['unb64']),
  tf('morse', 'Text → Morse code', (s) => [...s.toLowerCase()].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ')),
  tf('unmorse', 'Morse code → text', (s) => s.trim().split(/\s+/).map((c) => UNMORSE[c] ?? '?').join('')),
  tf('rot13', 'ROT13 cipher', (s) => rot(s, 13)),
  {
    name: 'caesar',
    desc: 'Caesar cipher with a shift',
    usage: '<shift> <text>',
    run: ({ reply, args }) => {
      const n = Number(args[0])
      if (!Number.isInteger(n) || args.length < 2) return reply('Usage: !caesar 3 hello')
      reply(rot(args.slice(1).join(' '), n))
    },
  },
  tf('leet', '1337 5p34k', mapChars('aeiostlAEIOSTL', '43105714310571')),
  tf('nato', 'NATO phonetic alphabet', (s) => [...s.toLowerCase()].map((c) => (c >= 'a' && c <= 'z' ? NATO[c.charCodeAt(0) - 97] : c === ' ' ? '/' : c)).join(' ')),
  tf('piglatin', 'Pig Latin translator', (s) => s.replace(/[a-z]+/gi, (w) => (/^[aeiou]/i.test(w) ? w + 'way' : w.replace(/^([^aeiou]+)(.*)$/i, '$2$1ay')))),
  tf('emojify', 'Text → 🇪 🇲 🇴 🇯 🇮 letters', (s) => [...s.toLowerCase()].map((c) => (c >= 'a' && c <= 'z' ? String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 97) + ' ' : c === ' ' ? '  ' : c)).join('')),
  tf('space', 's p a c e   o u t   t e x t', (s) => [...s].join(' ')),
  tf('zalgo', 'Z̷a̴l̸g̵o̶ cursed text', (s) => [...s].map((c) => c + rnd(zalgoUp) + rnd(zalgoDown) + rnd(zalgoUp)).join('')),
  tf('shuffle', 'Shuffle the words', (s) => s.split(/\s+/).sort(() => Math.random() - 0.5).join(' ')),
  tf('sortlines', 'Sort lines alphabetically', (s) => s.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'), ['sort']),
  tf('dedupe', 'Remove duplicate lines', (s) => [...new Set(s.split('\n'))].join('\n')),
  tf('urlencode', 'URL-encode text', encodeURIComponent),
  tf('urldecode', 'URL-decode text', (s) => {
    try { return decodeURIComponent(s) } catch { return 'Invalid encoding' }
  }),
  tf('count', 'Count characters, words, lines', (s) => `Characters: ${[...s].length}\nWithout spaces: ${[...s.replace(/\s/g, '')].length}\nWords: ${s.trim().split(/\s+/).length}\nLines: ${s.split('\n').length}\nVowels: ${(s.match(/[aeiou]/gi) || []).length}`, ['wordcount', 'charcount']),
  tf('palindrome', 'Is it a palindrome?', (s) => {
    const c = s.toLowerCase().replace(/[^a-z0-9]/g, '')
    return c && c === [...c].reverse().join('') ? '✅ Yes, it’s a palindrome!' : '❌ Not a palindrome'
  }),
  tf('say', 'Make the bot say something', (s) => s, ['echo']),
  tf('readmore', 'Hide text behind “Read more”', (s) => {
    const [a, b] = s.includes('|') ? s.split('|') : ['', s]
    return a.trim() + '‎'.repeat(4001) + b.trim()
  }),
  {
    name: 'anagram',
    desc: 'Are two words anagrams?',
    usage: '<word1> <word2>',
    run: ({ reply, args }) => {
      if (args.length < 2) return reply('Usage: !anagram listen silent')
      const k = (w) => w.toLowerCase().replace(/[^a-z]/g, '').split('').sort().join('')
      reply(k(args[0]) === k(args[1]) ? '✅ Anagrams!' : '❌ Not anagrams')
    },
  },
  {
    name: 'repeat',
    desc: 'Repeat text N times (max 20)',
    usage: '<n> <text>',
    run: ({ reply, args }) => {
      const n = Math.min(Number(args[0]), 20)
      if (!(n > 0) || args.length < 2) return reply('Usage: !repeat 3 hello')
      reply(Array(n).fill(args.slice(1).join(' ')).join('\n'))
    },
  },
]
