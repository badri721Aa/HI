'use strict';
const { truncate } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { getJson, userError, enc, cache } = require('./_http');

const dictCache = cache(60 * 60 * 1000);

async function dictionary(word) {
  return dictCache(word.toLowerCase(), async () => {
    const data = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(word)}`, { notFound: `No dictionary entry for **${word}**.` });
    if (!Array.isArray(data) || !data.length) throw userError(`No dictionary entry for **${word}**.`);
    return data;
  });
}

async function wikiSummary(title) {
  const slug = enc(title.trim().replace(/ /g, '_'));
  try {
    return await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, { notFound: 'nf' });
  } catch (err) {
    if (err.userMessage !== 'nf') throw err;
    return null;
  }
}

async function wikiSearch(query, limit) {
  const data = await getJson(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${enc(query)}&limit=${limit}&namespace=0&format=json`);
  const [, titles = [], , urls = []] = Array.isArray(data) ? data : [];
  return titles.map((t, i) => ({ title: t, url: urls[i] }));
}

module.exports = [
  {
    name: 'define',
    aliases: ['dictionary', 'dict', 'meaning'],
    description: 'Dictionary definition of an English word',
    usage: '<word>',
    examples: ['serendipity', 'run'],
    minArgs: 1,
    cooldown: 3,
    slash: true,
    args: [{ name: 'word', type: 'string', description: 'The word to define', required: true }],
    async execute(ctx) {
      const word = ctx.args[0].slice(0, 60);
      await ctx.defer();
      const [entry] = await dictionary(word);
      const phonetic = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '';
      const audio = entry.phonetics?.find((p) => p.audio)?.audio;
      const fields = (entry.meanings || []).slice(0, 4).map((m) => ({
        name: `*${m.partOfSpeech}*`,
        value: truncate(
          m.definitions
            .slice(0, 3)
            .map((d, i) => `**${i + 1}.** ${d.definition}${d.example ? `\n> _${d.example}_` : ''}`)
            .join('\n'),
          1024,
        ),
      }));
      const syn = [...new Set((entry.meanings || []).flatMap((m) => m.synonyms || []))].slice(0, 10);
      if (syn.length) fields.push({ name: 'Synonyms', value: syn.join(', ') });
      await ctx.reply({
        embeds: [ctx.embed({ title: `📖 ${entry.word}${phonetic ? `  ${phonetic}` : ''}`, fields, footer: 'Data: dictionaryapi.dev (Wiktionary)' })],
        components: audio ? [row(button(audio, 'Pronunciation', 'Link', '🔊'))] : [],
      });
    },
  },
  {
    name: 'synonyms',
    aliases: ['synonym', 'thesaurus', 'antonyms'],
    description: 'Synonyms and antonyms of a word',
    usage: '<word>',
    examples: ['happy'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const word = ctx.args[0].slice(0, 60);
      await ctx.defer();
      const entries = await dictionary(word);
      const all = entries.flatMap((e) => e.meanings || []);
      const collect = (key) => [...new Set(all.flatMap((m) => [...(m[key] || []), ...m.definitions.flatMap((d) => d[key] || [])]))];
      const syn = collect('synonyms');
      const ant = collect('antonyms');
      if (!syn.length && !ant.length) return ctx.info(`No synonyms or antonyms listed for **${word}**.`);
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🔁 ${word}`,
            fields: [
              { name: `Synonyms (${syn.length})`, value: syn.length ? truncate(syn.join(', '), 1024) : 'None listed' },
              { name: `Antonyms (${ant.length})`, value: ant.length ? truncate(ant.join(', '), 1024) : 'None listed' },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'wiki',
    aliases: ['wikipedia'],
    description: 'Summary of a Wikipedia article',
    usage: '<topic>',
    examples: ['Albert Einstein', 'black hole'],
    minArgs: 1,
    cooldown: 3,
    slash: true,
    args: [{ name: 'topic', type: 'string', description: 'What to look up', required: true, rest: true }],
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 200);
      await ctx.defer();
      let page = await wikiSummary(q);
      if (!page || page.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
        const [hit] = await wikiSearch(q, 1);
        if (!hit) throw userError(`No Wikipedia article found for **${q}**.`);
        page = await wikiSummary(hit.title);
        if (!page) throw userError(`No Wikipedia article found for **${q}**.`);
      }
      const url = page.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${enc(page.title)}`;
      const disambig = page.type === 'disambiguation';
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📚 ${page.title}`,
            url,
            description: `${page.description ? `*${page.description}*\n\n` : ''}${truncate(page.extract || 'No summary available.', 3000)}${disambig ? `\n\nThis is a disambiguation page — try \`${ctx.prefix}wikisearch ${q}\`.` : ''}`,
            thumbnail: page.thumbnail?.source,
            footer: 'Wikipedia • CC BY-SA',
          }),
        ],
        components: [row(button(url, 'Read on Wikipedia', 'Link'))],
      });
    },
  },
  {
    name: 'wikisearch',
    aliases: ['wsearch'],
    description: 'Search Wikipedia article titles',
    usage: '<query>',
    examples: ['mercury'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 200);
      await ctx.defer();
      const hits = await wikiSearch(q, 10);
      if (!hits.length) throw userError(`No Wikipedia results for **${q}**.`);
      await ctx.reply({ embeds: [ctx.embed({ title: `🔎 Wikipedia: ${q}`, description: hits.map((h, i) => `**${i + 1}.** [${h.title}](${h.url})`).join('\n') })] });
    },
  },
  {
    name: 'bible',
    aliases: ['verse', 'bibleverse'],
    description: 'Look up a Bible verse or passage (e.g. John 3:16)',
    usage: '<reference> [--kjv]',
    examples: ['John 3:16', 'Psalm 23:1-3 --kjv'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const kjv = /--kjv\b/i.test(ctx.rest(0));
      const ref = ctx.rest(0).replace(/--kjv\b/i, '').trim().slice(0, 60);
      if (!ref) return ctx.usage();
      await ctx.defer();
      const data = await getJson(`https://bible-api.com/${enc(ref)}${kjv ? '?translation=kjv' : ''}`, { notFound: `I couldn't find **${ref}**.` });
      if (!data?.text) throw userError(`I couldn't find **${ref}**.`);
      await ctx.reply({ embeds: [ctx.embed({ title: `✝️ ${data.reference}`, description: truncate(data.text.trim(), 4000), footer: data.translation_name || 'World English Bible' })] });
    },
  },
  {
    name: 'quran',
    aliases: ['ayah', 'quranverse'],
    description: 'Look up a Quran verse with Arabic text and translation (e.g. 2:255)',
    usage: '<surah:ayah>',
    examples: ['2:255', '1:1'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const ref = ctx.args[0];
      if (!/^\d{1,3}:\d{1,3}$|^\d{1,4}$/.test(ref)) return ctx.usage('Use `surah:ayah`, e.g. `2:255`.');
      await ctx.defer();
      const data = await getJson(`https://api.alquran.cloud/v1/ayah/${enc(ref)}/editions/quran-uthmani,en.asad`, { notFound: `Verse **${ref}** was not found.` });
      const [arabic, english] = Array.isArray(data?.data) ? data.data : [];
      if (!arabic) throw userError(`Verse **${ref}** was not found.`);
      const s = arabic.surah;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📖 ${s.englishName} (${s.englishNameTranslation}) ${s.number}:${arabic.numberInSurah}`,
            description: `${truncate(arabic.text, 1800)}\n\n${truncate(english?.text || '', 1800)}`,
            footer: `${s.name} • Translation: ${english?.edition?.englishName || 'Muhammad Asad'}`,
          }),
        ],
      });
    },
  },
  {
    name: 'book',
    aliases: ['books', 'openlibrary'],
    description: 'Find a book: author, year, pages and cover',
    usage: '<title or author>',
    examples: ['Dune', 'The Hobbit'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 150);
      await ctx.defer();
      const data = await getJson(`https://openlibrary.org/search.json?q=${enc(q)}&limit=1&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,edition_count,ratings_average`);
      const b = data?.docs?.[0];
      if (!b) throw userError(`No books found for **${q}**.`);
      const url = `https://openlibrary.org${b.key}`;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📘 ${b.title}`,
            url,
            thumbnail: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : undefined,
            fields: [
              { name: 'Author', value: b.author_name?.slice(0, 3).join(', ') || 'Unknown', inline: true },
              { name: 'First published', value: b.first_publish_year ? String(b.first_publish_year) : 'Unknown', inline: true },
              { name: 'Pages', value: b.number_of_pages_median ? String(b.number_of_pages_median) : null, inline: true },
              { name: 'Editions', value: b.edition_count ? String(b.edition_count) : null, inline: true },
              { name: 'Rating', value: b.ratings_average ? `${b.ratings_average.toFixed(2)} / 5` : null, inline: true },
              { name: 'Subjects', value: b.subject?.length ? truncate(b.subject.slice(0, 8).join(', '), 300) : null },
            ],
            footer: 'Data: Open Library',
          }),
        ],
      });
    },
  },
];
