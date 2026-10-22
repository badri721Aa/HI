'use strict';
const { formatNumber, truncate, randInt } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { getJson, userError, enc, stripHtml, cache } = require('./_http');

const apodCache = cache(60 * 60 * 1000);
const TYPE_COLORS = {
  normal: 0xa8a77a, fire: 0xee8130, water: 0x6390f0, electric: 0xf7d02c, grass: 0x7ac74c, ice: 0x96d9d6, fighting: 0xc22e28,
  poison: 0xa33ea1, ground: 0xe2bf65, flying: 0xa98ff3, psychic: 0xf95587, bug: 0xa6b91a, rock: 0xb6a136, ghost: 0x735797,
  dragon: 0x6f35fc, dark: 0x705746, steel: 0xb7b7ce, fairy: 0xd685ad,
};

async function jikan(kind, q) {
  const data = await getJson(`https://api.jikan.moe/v4/${kind}?q=${enc(q)}&limit=1&sfw=true`, { timeout: 15000 });
  const item = data?.data?.[0];
  if (!item) throw userError(`No ${kind} found for **${q}**.`);
  return item;
}

module.exports = [
  {
    name: 'anime',
    aliases: ['animesearch', 'mal'],
    description: 'Search anime on MyAnimeList',
    usage: '<title>',
    examples: ['Fullmetal Alchemist', 'Frieren'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 100);
      await ctx.defer();
      const a = await jikan('anime', q);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📺 ${a.title}${a.title_english && a.title_english !== a.title ? ` (${a.title_english})` : ''}`,
            url: a.url,
            description: truncate(a.synopsis || 'No synopsis.', 1500),
            thumbnail: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url,
            fields: [
              { name: 'Score', value: a.score ? `⭐ ${a.score} (${formatNumber(a.scored_by || 0)} votes)` : 'N/A', inline: true },
              { name: 'Rank / Popularity', value: `#${a.rank ?? '?'} / #${a.popularity ?? '?'}`, inline: true },
              { name: 'Type', value: `${a.type || '?'} • ${a.episodes ?? '?'} eps`, inline: true },
              { name: 'Status', value: a.status || '?', inline: true },
              { name: 'Aired', value: a.aired?.string || '?', inline: true },
              { name: 'Studios', value: a.studios?.map((s) => s.name).join(', ') || null, inline: true },
              { name: 'Genres', value: a.genres?.map((g) => g.name).join(', ') || null, inline: false },
              { name: 'Rating', value: a.rating || null, inline: false },
            ],
            footer: 'Data: MyAnimeList via Jikan',
          }),
        ],
      });
    },
  },
  {
    name: 'manga',
    aliases: ['mangasearch'],
    description: 'Search manga on MyAnimeList',
    usage: '<title>',
    examples: ['One Piece'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 100);
      await ctx.defer();
      const m = await jikan('manga', q);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📚 ${m.title}${m.title_english && m.title_english !== m.title ? ` (${m.title_english})` : ''}`,
            url: m.url,
            description: truncate(m.synopsis || 'No synopsis.', 1500),
            thumbnail: m.images?.jpg?.large_image_url || m.images?.jpg?.image_url,
            fields: [
              { name: 'Score', value: m.score ? `⭐ ${m.score}` : 'N/A', inline: true },
              { name: 'Rank', value: `#${m.rank ?? '?'}`, inline: true },
              { name: 'Type', value: m.type || '?', inline: true },
              { name: 'Chapters / Volumes', value: `${m.chapters ?? '?'} / ${m.volumes ?? '?'}`, inline: true },
              { name: 'Status', value: m.status || '?', inline: true },
              { name: 'Published', value: m.published?.string || '?', inline: true },
              { name: 'Authors', value: m.authors?.map((x) => x.name).join(', ') || null, inline: false },
              { name: 'Genres', value: m.genres?.map((g) => g.name).join(', ') || null, inline: false },
            ],
            footer: 'Data: MyAnimeList via Jikan',
          }),
        ],
      });
    },
  },
  {
    name: 'tvshow',
    aliases: ['tv', 'series'],
    description: 'Look up a TV show (rating, network, status)',
    usage: '<title>',
    examples: ['Breaking Bad'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 100);
      await ctx.defer();
      const s = await getJson(`https://api.tvmaze.com/singlesearch/shows?q=${enc(q)}`, { notFound: `No TV show found for **${q}**.` });
      if (!s?.name) throw userError(`No TV show found for **${q}**.`);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📺 ${s.name}`,
            url: s.url,
            description: truncate(stripHtml(s.summary) || 'No summary.', 1500),
            thumbnail: s.image?.original || s.image?.medium,
            fields: [
              { name: 'Rating', value: s.rating?.average ? `⭐ ${s.rating.average}/10` : 'N/A', inline: true },
              { name: 'Status', value: s.status || '?', inline: true },
              { name: 'Premiered', value: s.premiered || '?', inline: true },
              { name: 'Ended', value: s.ended || null, inline: true },
              { name: 'Network', value: s.network?.name || s.webChannel?.name || null, inline: true },
              { name: 'Runtime', value: s.runtime || s.averageRuntime ? `${s.runtime || s.averageRuntime} min` : null, inline: true },
              { name: 'Genres', value: s.genres?.length ? s.genres.join(', ') : null, inline: false },
            ],
            footer: 'Data: TVmaze',
          }),
        ],
      });
    },
  },
  {
    name: 'pokedex',
    aliases: ['pokemon', 'dex'],
    description: 'Pokédex entry: types, abilities, base stats and art',
    usage: '<name or number>',
    examples: ['pikachu', '25', 'mr mime'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).toLowerCase().trim().replace(/[.'’]/g, '').replace(/\s+/g, '-').slice(0, 40);
      await ctx.defer();
      const p = await getJson(`https://pokeapi.co/api/v2/pokemon/${enc(q)}`, { notFound: `No Pokémon called **${ctx.rest(0)}**.` });
      const species = await getJson(p.species.url).catch(() => null);
      const flavor = species?.flavor_text_entries?.filter((f) => f.language?.name === 'en').pop()?.flavor_text?.replace(/[\n\f\r]/g, ' ');
      const genus = species?.genera?.find((g) => g.language?.name === 'en')?.genus;
      const name = p.name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      const types = p.types.map((t) => t.type.name);
      const stats = p.stats.map((s) => `${s.stat.name.replace('special-', 'sp. ').replace('attack', 'atk').replace('defense', 'def').padEnd(8)} ${String(s.base_stat).padStart(3)} ${'█'.repeat(Math.round(s.base_stat / 15))}`);
      const total = p.stats.reduce((n, s) => n + s.base_stat, 0);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `#${String(p.id).padStart(4, '0')} ${name}${species?.is_legendary ? ' ✨ Legendary' : species?.is_mythical ? ' ✨ Mythical' : ''}`,
            url: `https://www.pokemon.com/us/pokedex/${p.species.name}`,
            color: TYPE_COLORS[types[0]],
            description: `${genus ? `*${genus}*\n` : ''}${flavor || ''}`,
            thumbnail: p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default,
            fields: [
              { name: 'Type', value: types.map((t) => t[0].toUpperCase() + t.slice(1)).join(' / '), inline: true },
              { name: 'Height / Weight', value: `${p.height / 10} m / ${p.weight / 10} kg`, inline: true },
              { name: 'Abilities', value: p.abilities.map((a) => `${a.ability.name.replace(/-/g, ' ')}${a.is_hidden ? ' (hidden)' : ''}`).join(', '), inline: false },
              { name: `Base stats (total ${total})`, value: `\`\`\`\n${stats.join('\n')}\n\`\`\`` },
            ],
            footer: 'Data: PokéAPI',
          }),
        ],
      });
    },
  },
  {
    name: 'xkcd',
    description: 'Read an xkcd comic: latest, random, or by number',
    usage: '[number | random]',
    examples: ['', '353', 'random'],
    cooldown: 3,
    async execute(ctx) {
      const arg = (ctx.args[0] || '').toLowerCase();
      await ctx.defer();
      let num = /^\d+$/.test(arg) ? +arg : null;
      if (arg === 'random') {
        const latest = await getJson('https://xkcd.com/info.0.json');
        num = randInt(1, latest.num);
        if (num === 404) num = 405; // comic 404 intentionally doesn't exist
      } else if (arg && num === null) {
        return ctx.usage();
      }
      const c = await getJson(num ? `https://xkcd.com/${num}/info.0.json` : 'https://xkcd.com/info.0.json', { notFound: `There is no xkcd #${num}.` });
      await ctx.reply({
        embeds: [ctx.embed({ title: `#${c.num}: ${c.safe_title || c.title}`, url: `https://xkcd.com/${c.num}/`, image: c.img, footer: truncate(c.alt, 2000), description: `Published ${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}` })],
      });
    },
  },
  {
    name: 'apod',
    aliases: ['nasa', 'spacepic'],
    description: 'NASA Astronomy Picture of the Day (optionally for a date)',
    usage: '[YYYY-MM-DD]',
    examples: ['', '2024-04-08'],
    cooldown: 5,
    async execute(ctx) {
      const date = ctx.args[0];
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ctx.usage('Use a date like `2024-04-08` (from 1995-06-16 to today).');
      await ctx.defer();
      const apiKey = process.env.NASA_API_KEY || 'DEMO_KEY';
      const a = await apodCache(date || 'today', () =>
        getJson(`https://api.nasa.gov/planetary/apod?api_key=${enc(apiKey)}${date ? `&date=${date}` : ''}`, { notFound: 'No picture for that date (valid range: 1995-06-16 to today).' }),
      );
      const isImage = a.media_type === 'image';
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🔭 ${a.title}`,
            url: a.hdurl || a.url,
            description: `${truncate(a.explanation || '', 1500)}${isImage ? '' : `\n\n🎬 This one is a video: ${a.url}`}`,
            image: isImage ? a.url : a.thumbnail_url,
            footer: `${a.date}${a.copyright ? ` • © ${a.copyright.trim()}` : ''} • NASA APOD`,
          }),
        ],
        components: a.hdurl || a.url ? [row(button(a.hdurl || a.url, isImage ? 'Full resolution' : 'Watch', 'Link'))] : [],
      });
    },
  },
];
