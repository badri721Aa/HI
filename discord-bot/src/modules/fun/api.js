'use strict';
const { fetchJson, pick } = require('../../core/utils');
const content = require('./_content');

const OFFLINE = 'offline fallback — the online source did not answer';

/** Try the API; on any failure use the local fallback so the command always answers. */
async function withFallback(ctx, fetcher, fallback) {
  await ctx.defer();
  try {
    return { ...(await fetcher()), online: true };
  } catch {
    return { ...fallback(), online: false };
  }
}

function jokeEmbed(ctx, title, j, online) {
  return ctx.embed({ title, description: `${j.setup}\n\n||${j.punchline}||`, footer: online ? undefined : OFFLINE });
}

const MEME_SUBS = ['memes', 'dankmemes', 'wholesomememes', 'ProgrammerHumor', 'me_irl', 'meirl', 'AdviceAnimals', 'funny', 'Animemes', 'gaming'];

module.exports = [
  {
    name: 'joke',
    description: 'A random joke (punchline in a spoiler)',
    slash: true,
    args: [],
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const j = await fetchJson('https://official-joke-api.appspot.com/random_joke');
          if (!j?.setup) throw new Error('bad joke payload');
          return { setup: j.setup, punchline: j.punchline };
        },
        () => pick(content.jokes),
      );
      await ctx.reply({ embeds: [jokeEmbed(ctx, '😂 Joke', r, r.online)] });
    },
  },
  {
    name: 'dadjoke',
    aliases: ['dad'],
    description: 'A certified dad joke',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const j = await fetchJson('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json' } });
          if (!j?.joke) throw new Error('bad payload');
          return { text: j.joke };
        },
        () => {
          const j = pick(content.jokes);
          return { text: `${j.setup} ${j.punchline}` };
        },
      );
      await ctx.reply({ embeds: [ctx.embed({ title: '👨 Dad joke', description: r.text, footer: r.online ? undefined : OFFLINE })] });
    },
  },
  {
    name: 'programmingjoke',
    aliases: ['devjoke', 'codejoke'],
    description: 'A joke for programmers',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const arr = await fetchJson('https://official-joke-api.appspot.com/jokes/programming/random');
          const j = Array.isArray(arr) ? arr[0] : arr;
          if (!j?.setup) throw new Error('bad payload');
          return { setup: j.setup, punchline: j.punchline };
        },
        () => pick(content.programmingJokes),
      );
      await ctx.reply({ embeds: [jokeEmbed(ctx, '💻 Programming joke', r, r.online)] });
    },
  },
  {
    name: 'knockknock',
    aliases: ['kk'],
    description: 'A knock-knock joke',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const arr = await fetchJson('https://official-joke-api.appspot.com/jokes/knock-knock/random');
          const j = Array.isArray(arr) ? arr[0] : arr;
          if (!j?.setup) throw new Error('bad payload');
          return { text: `${j.setup}\n\n||${j.punchline}||` };
        },
        () => {
          const [who, punch] = pick(content.knockKnock);
          return { text: `**Knock knock.**\n*Who's there?*\n**${who}.**\n*${who} who?*\n||${punch}||` };
        },
      );
      await ctx.reply({ embeds: [ctx.embed({ title: '🚪 Knock knock', description: r.text, footer: r.online ? undefined : OFFLINE })] });
    },
  },
  {
    name: 'chucknorris',
    aliases: ['chuck'],
    description: 'A Chuck Norris "fact"',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const j = await fetchJson('https://api.chucknorris.io/jokes/random');
          if (!j?.value) throw new Error('bad payload');
          return { text: j.value };
        },
        () => ({ text: pick(content.chuckNorris) }),
      );
      await ctx.reply({ embeds: [ctx.embed({ title: '🥋 Chuck Norris fact', description: r.text, footer: r.online ? undefined : OFFLINE })] });
    },
  },
  {
    name: 'meme',
    aliases: ['memes'],
    description: 'A random meme from Reddit (SFW only)',
    usage: `[${MEME_SUBS.slice(0, 4).join('|')}|…]`,
    examples: ['', 'wholesomememes'],
    cooldown: 3,
    slash: true,
    args: [{ name: 'subreddit', type: 'string', description: 'Meme subreddit', required: false, choices: MEME_SUBS }],
    async execute(ctx) {
      const want = ctx.args[0] ? MEME_SUBS.find((s) => s.toLowerCase() === ctx.args[0].toLowerCase().replace(/^r\//, '')) : null;
      if (ctx.args[0] && !want) return ctx.fail(`Pick one of: ${MEME_SUBS.join(', ')}`);
      await ctx.defer();
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          const m = await fetchJson(`https://meme-api.com/gimme${want ? `/${want}` : ''}`);
          if (!m?.url || m.nsfw || m.spoiler) continue;
          return ctx.reply({
            embeds: [ctx.embed({ title: String(m.title || 'Meme').slice(0, 250), url: m.postLink, image: m.url, footer: `r/${m.subreddit} • 👍 ${m.ups ?? 0} • u/${m.author}` })],
          });
        }
        return ctx.fail('Could not find a safe meme right now — try again.');
      } catch {
        return ctx.fail('The meme service is not answering right now. Try again in a bit! 😅');
      }
    },
  },
  {
    name: 'fact',
    aliases: ['uselessfact', 'funfact'],
    description: 'A random (useless but true) fact',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const j = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
          if (!j?.text) throw new Error('bad payload');
          return { text: j.text };
        },
        () => ({ text: pick(content.facts) }),
      );
      await ctx.reply({ embeds: [ctx.embed({ title: '🧠 Did you know?', description: r.text, footer: r.online ? undefined : OFFLINE })] });
    },
  },
  {
    name: 'quote',
    aliases: ['inspirequote'],
    description: 'A random famous quote',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const arr = await fetchJson('https://zenquotes.io/api/random');
          const q = Array.isArray(arr) ? arr[0] : null;
          if (!q?.q || /too many requests/i.test(q.q)) throw new Error('bad payload');
          return { q: q.q, a: q.a };
        },
        () => pick(content.quotes),
      );
      await ctx.reply({ embeds: [ctx.embed({ description: `> ${r.q}\n— **${r.a}**`, footer: r.online ? 'Quotes by zenquotes.io' : OFFLINE })] });
    },
  },
  {
    name: 'advice',
    description: 'A random piece of advice',
    examples: [''],
    async execute(ctx) {
      const r = await withFallback(
        ctx,
        async () => {
          const j = await fetchJson(`https://api.adviceslip.com/advice?t=${Date.now()}`);
          if (!j?.slip?.advice) throw new Error('bad payload');
          return { text: j.slip.advice };
        },
        () => ({ text: pick(content.advice) }),
      );
      await ctx.reply({ embeds: [ctx.embed({ title: '🦉 Advice', description: r.text, footer: r.online ? undefined : OFFLINE })] });
    },
  },
  {
    name: 'kanye',
    aliases: ['ye'],
    description: 'A random Kanye West quote',
    examples: [''],
    async execute(ctx) {
      await ctx.defer();
      try {
        const j = await fetchJson('https://api.kanye.rest/');
        if (!j?.quote) throw new Error('bad payload');
        await ctx.reply({ embeds: [ctx.embed({ description: `> ${j.quote}\n— **Kanye West**` })] });
      } catch {
        await ctx.fail('The Kanye quote service is not answering right now. Try again later.');
      }
    },
  },
];
