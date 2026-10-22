'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { fetchJson, pick, shuffle } = require('../../core/utils');
const { CATEGORIES, LOCAL } = require('./_trivia');
const { claim, record } = require('./_lib');

const LETTERS = ['🇦', '🇧', '🇨', '🇩'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

async function fetchQuestion(category, difficulty) {
  const params = new URLSearchParams({ amount: '1', encode: 'url3986' });
  if (category) params.set('category', String(CATEGORIES[category]));
  if (difficulty) params.set('difficulty', difficulty);
  const data = await fetchJson(`https://opentdb.com/api.php?${params}`, { timeout: 7000 });
  if (data?.response_code !== 0 || !data.results?.length) throw new Error(`opentdb response ${data?.response_code}`);
  const r = data.results[0];
  return {
    type: safeDecode(r.type),
    question: safeDecode(r.question),
    correct: safeDecode(r.correct_answer),
    incorrect: r.incorrect_answers.map(safeDecode),
    category: safeDecode(r.category),
    difficulty: safeDecode(r.difficulty),
  };
}

function buttons(options, { reveal = null, correctIndex = -1 } = {}) {
  return new ActionRowBuilder().addComponents(
    options.map((opt, i) => {
      const b = new ButtonBuilder()
        .setCustomId(`trivia:${i}`)
        .setLabel(`${String.fromCharCode(65 + i)}. ${opt}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary);
      if (reveal) b.setDisabled(true).setStyle(i === correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary);
      return b;
    }),
  );
}

module.exports = [
  {
    name: 'trivia',
    aliases: ['quiz'],
    description: 'Answer a trivia question — first correct answer wins (anyone can play)',
    usage: '[category] [easy|medium|hard] • trivia categories',
    examples: ['', 'science easy', 'categories'],
    cooldown: 5,
    slash: true,
    args: [
      { name: 'category', type: 'string', description: 'Question category', required: false, choices: Object.keys(CATEGORIES).slice(0, 25) },
      { name: 'difficulty', type: 'string', description: 'Difficulty', required: false, choices: DIFFICULTIES },
    ],
    async execute(ctx) {
      const a0 = String(ctx.args[0] || '').toLowerCase();
      if (a0 === 'categories' || a0 === 'cats') {
        return ctx.info(Object.keys(CATEGORIES).map((c) => `\`${c}\``).join(' '), '🧠 Trivia categories');
      }
      let category = null;
      let difficulty = null;
      for (const a of ctx.args.map((x) => x.toLowerCase())) {
        if (DIFFICULTIES.includes(a)) difficulty = a;
        else if (CATEGORIES[a]) category = a;
        else return ctx.usage(`Unknown category or difficulty \`${a}\`. Use \`${ctx.prefix}trivia categories\`.`);
      }

      const release = claim(ctx, 'trivia');
      if (!release) return ctx.fail('A trivia question is already running in this channel!');
      try {
        await ctx.defer();
        let q;
        let offline = false;
        try {
          q = await fetchQuestion(category, difficulty);
        } catch {
          offline = true;
          const pool = LOCAL.filter((x) => !difficulty || x.difficulty === difficulty);
          q = pick(pool.length ? pool : LOCAL);
        }

        const options = q.type === 'boolean' ? ['True', 'False'] : shuffle([q.correct, ...q.incorrect]);
        const correctIndex = options.indexOf(q.correct);
        const seconds = 20;
        const embed = (extra = '', color) =>
          ctx.embed({
            title: `🧠 Trivia — ${q.category}`,
            description: `**${q.question}**\n\n${options.map((o, i) => `${LETTERS[i]} ${o}`).join('\n')}${extra}`,
            footer: `Difficulty: ${q.difficulty} • ${seconds}s • one guess per person${offline ? ' • offline question bank' : ''}`,
            color,
          });

        const msg = await ctx.reply({ embeds: [embed()], components: [buttons(options)] });
        if (!msg?.createMessageComponentCollector) return release();

        const guessed = new Set();
        let winner = null;
        const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000, filter: (i) => i.customId.startsWith('trivia:') });
        col.on('collect', async (i) => {
          if (guessed.has(i.user.id)) return i.reply({ content: 'You already answered this one!', flags: 64 }).catch(() => {});
          guessed.add(i.user.id);
          const choice = Number(i.customId.split(':')[1]);
          if (choice === correctIndex) {
            winner = i.user;
            await i.deferUpdate().catch(() => {});
            col.stop('answered');
          } else {
            record(ctx.guild?.id, i.user.id, 'trivia', 'loss');
            await i.reply({ content: `❌ **${options[choice]}** is wrong!`, flags: 64 }).catch(() => {});
          }
        });
        col.on('end', async () => {
          release();
          if (winner) record(ctx.guild?.id, winner.id, 'trivia', 'win');
          const result = winner ? `\n\n🎉 <@${winner.id}> got it right!` : `\n\n⌛ Time's up! The answer was **${q.correct}**.`;
          await msg.edit({ embeds: [embed(result, winner ? 0x57f287 : 0xed4245)], components: [buttons(options, { reveal: true, correctIndex })], allowedMentions: { parse: [] } }).catch(() => {});
        });
      } catch (err) {
        release();
        throw err;
      }
    },
  },
];
