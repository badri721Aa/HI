// Lookups using free public APIs (no keys needed). These need internet access on the bot's machine.
async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'whatsapp-group-bot/1.0' }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}

const web = (name, desc, usage, fn, aliases = []) => ({
  name,
  aliases,
  desc,
  usage,
  run: async (ctx) => {
    if (usage && !ctx.text) return ctx.reply(`Usage: !${name} ${usage}`)
    try {
      await fn(ctx)
    } catch (err) {
      ctx.reply(err.status === 404 ? '🔍 Nothing found.' : '⚠️ That service is not responding right now. Try again later.')
    }
  },
})

export const commands = [
  web('weather', 'Current weather for a city', '<city>', async ({ text, reply }) => {
    const d = await getJson(`https://wttr.in/${encodeURIComponent(text)}?format=j1`)
    const c = d.current_condition[0]
    const area = d.nearest_area?.[0]
    const place = area ? `${area.areaName[0].value}, ${area.country[0].value}` : text
    const today = d.weather?.[0]
    reply(
      `🌤️ *${place}*\n${c.weatherDesc[0].value}\n🌡️ ${c.temp_C}°C (feels ${c.FeelsLikeC}°C)\n💧 Humidity ${c.humidity}%\n💨 Wind ${c.windspeedKmph} km/h` +
        (today ? `\n📈 High ${today.maxtempC}°C · 📉 Low ${today.mintempC}°C` : ''),
    )
  }),
  web('wiki', 'Wikipedia summary', '<topic>', async ({ text, reply }) => {
    const d = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text.replace(/ /g, '_'))}`)
    reply(`📚 *${d.title}*\n${d.extract}\n\n${d.content_urls?.desktop?.page || ''}`)
  }, ['wikipedia']),
  web('define', 'Dictionary definition', '<word>', async ({ text, reply }) => {
    const [d] = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`)
    const meanings = d.meanings.slice(0, 3).map((m) => `_${m.partOfSpeech}_: ${m.definitions[0].definition}`)
    reply(`📖 *${d.word}* ${d.phonetic || ''}\n${meanings.join('\n')}`)
  }, ['dict', 'meaning']),
  web('synonyms', 'Synonyms of a word', '<word>', async ({ text, reply }) => {
    const [d] = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`)
    const syn = [...new Set(d.meanings.flatMap((m) => [...m.synonyms, ...m.definitions.flatMap((x) => x.synonyms)]))].slice(0, 20)
    reply(syn.length ? `🔤 Synonyms for *${d.word}*: ${syn.join(', ')}` : 'No synonyms found.')
  }, ['syn']),
  web('currency', 'Convert currencies (live rates)', '<amount> <FROM> <TO>', async ({ args, reply }) => {
    const [amt, from, to] = [Number(args[0]), args[1]?.toUpperCase(), args[2]?.toUpperCase()]
    if (!Number.isFinite(amt) || !from || !to) return reply('Usage: !currency 100 USD EUR')
    const d = await getJson(`https://open.er-api.com/v6/latest/${from}`)
    const rate = d.rates?.[to]
    if (!rate) return reply('Unknown currency code.')
    reply(`💱 ${amt} ${from} = *${(amt * rate).toFixed(2)} ${to}*\n1 ${from} = ${rate} ${to}`)
  }, ['fx', 'exchange']),
  web('crypto', 'Crypto price in USD', '<coin e.g. bitcoin>', async ({ text, reply }) => {
    const id = text.toLowerCase().trim()
    const alias = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', doge: 'dogecoin', bnb: 'binancecoin', xrp: 'ripple', ada: 'cardano', ton: 'the-open-network' }
    const coin = alias[id] || id
    const d = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd&include_24hr_change=true`)
    if (!d[coin]) return reply('Coin not found. Use the full name, e.g. bitcoin')
    const ch = d[coin].usd_24h_change
    reply(`🪙 *${coin}*: $${d[coin].usd.toLocaleString('en-US')}${ch !== undefined ? ` (${ch >= 0 ? '📈 +' : '📉 '}${ch.toFixed(2)}% 24h)` : ''}`)
  }),
  web('translate', 'Translate text', '<lang> <text>  (e.g. !translate es hello)', async ({ args, quoted, reply }) => {
    const lang = args[0]
    const text = args.slice(1).join(' ') || quoted?.text
    if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(lang || '') || !text) return reply('Usage: !translate ar good morning (or reply to a message with !translate en)')
    const d = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=autodetect|${lang}`)
    reply(`🌐 ${d.responseData.translatedText}`)
  }, ['tr']),
  web('github', 'GitHub user profile', '<username>', async ({ text, reply }) => {
    const d = await getJson(`https://api.github.com/users/${encodeURIComponent(text.trim())}`)
    reply(`🐙 *${d.name || d.login}*\n${d.bio || ''}\nRepos: ${d.public_repos} · Followers: ${d.followers}\n${d.html_url}`)
  }, ['gh']),
  web('country', 'Facts about a country', '<name>', async ({ text, reply }) => {
    const [d] = await getJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}`)
    reply(
      `${d.flag || '🌍'} *${d.name.common}*\nCapital: ${d.capital?.join(', ') || '-'}\nRegion: ${d.region}\n` +
        `Population: ${d.population.toLocaleString('en-US')}\nLanguages: ${Object.values(d.languages || {}).join(', ')}\n` +
        `Currency: ${Object.values(d.currencies || {}).map((c) => `${c.name} (${c.symbol})`).join(', ')}`,
    )
  }),
  web('shorten', 'Shorten a link', '<url>', async ({ text, reply }) => {
    const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(text.trim())}`, { signal: AbortSignal.timeout(10_000) })
    const out = (await res.text()).trim()
    reply(out.startsWith('http') ? `🔗 ${out}` : `❌ ${out}`)
  }, ['short', 'tinyurl']),
  web('ipinfo', 'Location info for an IP address', '<ip>', async ({ text, reply }) => {
    const d = await getJson(`https://ipwho.is/${encodeURIComponent(text.trim())}`)
    if (!d.success) return reply('Invalid IP.')
    reply(`🌐 ${d.ip}\n${d.city}, ${d.region}, ${d.country} ${d.flag?.emoji || ''}\nISP: ${d.connection?.isp || '-'}`)
  }, ['ip']),
  web('catfact', 'A random cat fact', '', async ({ reply }) => {
    const d = await getJson('https://catfact.ninja/fact')
    reply(`🐱 ${d.fact}`)
  }),
  web('dog', 'A random dog photo', '', async ({ sock, chat, msg }) => {
    const d = await getJson('https://dog.ceo/api/breeds/image/random')
    await sock.sendMessage(chat, { image: { url: d.message }, caption: '🐶' }, { quoted: msg })
  }, ['doggo']),
  web('cat', 'A random cat photo', '', async ({ sock, chat, msg }) => {
    const [d] = await getJson('https://api.thecatapi.com/v1/images/search')
    await sock.sendMessage(chat, { image: { url: d.url }, caption: '🐱' }, { quoted: msg })
  }, ['kitty']),
]
