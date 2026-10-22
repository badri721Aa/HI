'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { pick, shuffle } = require('../../core/utils');
const { COUNTRIES, flagOf, EMOJI_PUZZLES } = require('./_geo');
const { claim, record, typedGameProblem, normalize } = require('./_lib');

/** 4-option button quiz: anyone can answer once, first correct wins. */
async function buttonQuiz(ctx, { game, title, prompt, correct, wrong, seconds = 15 }) {
  const release = claim(ctx, game);
  if (!release) return ctx.fail('A quiz is already running in this channel!');
  const options = shuffle([correct, ...wrong]);
  const correctIndex = options.indexOf(correct);
  const rowOf = (reveal = false) =>
    new ActionRowBuilder().addComponents(
      options.map((o, i) => {
        const b = new ButtonBuilder().setCustomId(`${game}:${i}`).setLabel(o.slice(0, 80)).setStyle(ButtonStyle.Primary);
        if (reveal) b.setDisabled(true).setStyle(i === correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary);
        return b;
      }),
    );
  const embed = (extra = '', color) => ctx.embed({ title, description: `${prompt}${extra}`, footer: `${seconds}s • one guess each`, color });
  const msg = await ctx.reply({ embeds: [embed()], components: [rowOf()] });
  if (!msg?.createMessageComponentCollector) return release();
  const guessed = new Set();
  let winner = null;
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000, filter: (i) => i.customId.startsWith(`${game}:`) });
  col.on('collect', async (i) => {
    if (guessed.has(i.user.id)) return i.reply({ content: 'You already guessed!', flags: 64 }).catch(() => {});
    guessed.add(i.user.id);
    if (Number(i.customId.split(':')[1]) === correctIndex) {
      winner = i.user;
      await i.deferUpdate().catch(() => {});
      return col.stop('answered');
    }
    record(ctx.guild?.id, i.user.id, game, 'loss');
    return i.reply({ content: '❌ Wrong!', flags: 64 }).catch(() => {});
  });
  col.on('end', () => {
    release();
    if (winner) record(ctx.guild?.id, winner.id, game, 'win');
    const extra = winner ? `\n\n🎉 <@${winner.id}> got it: **${correct}**!` : `\n\n⌛ Time's up! It was **${correct}**.`;
    msg.edit({ embeds: [embed(extra, winner ? 0x57f287 : 0xed4245)], components: [rowOf(true)], allowedMentions: { parse: [] } }).catch(() => {});
  });
}

module.exports = [
  {
    name: 'flagquiz',
    aliases: ['guessflag', 'flags'],
    description: 'Which country does this flag belong to?',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const [code, name] = pick(COUNTRIES);
      const wrong = shuffle(COUNTRIES.filter((c) => c[0] !== code)).slice(0, 3).map((c) => c[1]);
      await buttonQuiz(ctx, { game: 'flagquiz', title: '🏳️ Flag quiz', prompt: `Which country has this flag?\n# ${flagOf(code)}`, correct: name, wrong });
    },
  },
  {
    name: 'capitalquiz',
    aliases: ['capitals', 'guesscapital'],
    description: 'What is the capital of this country?',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const pool = COUNTRIES.filter((c) => c[2]);
      const [code, name, capital] = pick(pool);
      const wrong = shuffle(pool.filter((c) => c[2] !== capital)).slice(0, 3).map((c) => c[2]);
      await buttonQuiz(ctx, { game: 'capitalquiz', title: '🏛️ Capital quiz', prompt: `What is the capital of **${name}** ${flagOf(code)}?`, correct: capital, wrong });
    },
  },
  {
    name: 'emojiquiz',
    aliases: ['guessemoji', 'emojigame'],
    description: 'Guess the movie or phrase from emojis — type your answer',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const release = claim(ctx, 'emojiquiz');
      if (!release) return ctx.fail('An emoji quiz is already running here!');
      const [emojis, answers] = pick(EMOJI_PUZZLES);
      const accepted = answers.map(normalize);
      const strip = (s) => normalize(s).replace(/^the /, '');
      await ctx.reply({ embeds: [ctx.embed({ title: '🤔 Emoji quiz', description: `Guess the movie or phrase:\n# ${emojis}\nType your answer — 30 seconds!` })] });
      const col = ctx.channel.createMessageCollector({ time: 30000, filter: (m) => !m.author.bot && accepted.some((a) => strip(a) === strip(m.content)) });
      col.on('collect', (m) => col.stop(`won:${m.author.id}`));
      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const w = reason.split(':')[1];
          record(ctx.guild?.id, w, 'emojiquiz', 'win');
          return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, description: `🎉 <@${w}> got it! **${answers[0]}**` })], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: `⌛ Time's up! It was **${answers[0]}**.` })] }).catch(() => {});
      });
    },
  },
];
