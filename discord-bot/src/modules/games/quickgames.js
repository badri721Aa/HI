'use strict';
const { ComponentType } = require('discord.js');
const { pick, randInt, shuffle, sleep } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { FIVE, HANGMAN, SENTENCES } = require('./_words');
const { claim, record, setBest, typedGameProblem, normalize } = require('./_lib');

const ZWSP = '​';

function scrambleWord(w) {
  if (new Set(w).size < 2) return w;
  let s = w;
  for (let i = 0; i < 10 && s === w; i++) s = shuffle([...w]).join('');
  return s;
}

function mathQuestion(level) {
  if (level === 'easy') {
    const a = randInt(1, 20);
    const b = randInt(1, 20);
    return Math.random() < 0.5 ? { q: `${a} + ${b}`, a: a + b } : { q: `${Math.max(a, b)} − ${Math.min(a, b)}`, a: Math.max(a, b) - Math.min(a, b) };
  }
  if (level === 'hard') {
    const kind = randInt(0, 2);
    if (kind === 0) {
      const a = randInt(11, 30);
      const b = randInt(11, 30);
      const c = randInt(1, 99);
      return { q: `${a} × ${b} + ${c}`, a: a * b + c };
    }
    if (kind === 1) {
      const a = randInt(5, 40);
      const b = randInt(5, 40);
      const c = randInt(2, 12);
      return { q: `(${a} + ${b}) × ${c}`, a: (a + b) * c };
    }
    const b = randInt(3, 15);
    const ans = randInt(5, 40);
    return { q: `${b * ans} ÷ ${b}`, a: ans };
  }
  const kind = randInt(0, 2);
  const a = randInt(2, 12);
  const b = randInt(2, 12);
  if (kind === 0) return { q: `${a} × ${b}`, a: a * b };
  const x = randInt(10, 99);
  const y = randInt(10, 99);
  return kind === 1 ? { q: `${x} + ${y}`, a: x + y } : { q: `${Math.max(x, y)} − ${Math.min(x, y)}`, a: Math.max(x, y) - Math.min(x, y) };
}

module.exports = [
  {
    name: 'guess',
    aliases: ['guessnumber', 'numberguess'],
    description: 'Guess the secret number — anyone can play, I give higher/lower hints',
    usage: '[max number]',
    examples: ['', '500'],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const max = Math.min(1_000_000, Math.max(10, parseInt(ctx.args[0], 10) || 100));
      const release = claim(ctx, 'guess');
      if (!release) return ctx.fail('A number-guessing game is already running here!');
      const secret = randInt(1, max);
      let attempts = 0;
      const players = new Set();
      await ctx.reply({ embeds: [ctx.embed({ title: '🔢 Guess the number', description: `I'm thinking of a number between **1** and **${max.toLocaleString()}**.\nType your guesses in chat! (1 minute without guesses ends the game)` })] });
      const col = ctx.channel.createMessageCollector({ idle: 60000, filter: (m) => !m.author.bot && /^\d{1,7}$/.test(m.content.trim()) });
      col.on('collect', (m) => {
        const n = Number(m.content.trim());
        attempts++;
        players.add(m.author.id);
        if (n === secret) return col.stop(`won:${m.author.id}`);
        m.react(n < secret ? '⬆️' : '⬇️').catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const w = reason.split(':')[1];
          for (const p of players) record(ctx.guild?.id, p, 'guess', p === w ? 'win' : 'play');
          return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, description: `🎉 <@${w}> guessed it! The number was **${secret}** (${attempts} guesses total).` })], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: `⌛ Nobody got it. The number was **${secret}**.` })] }).catch(() => {});
      });
    },
  },
  {
    name: 'scramble',
    aliases: ['unscramble', 'wordscramble'],
    description: 'Unscramble the word — first to type it wins',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const release = claim(ctx, 'scramble');
      if (!release) return ctx.fail('A scramble is already running here!');
      const category = pick(Object.keys(HANGMAN));
      const word = pick(HANGMAN[category]);
      const started = Date.now();
      await ctx.reply({ embeds: [ctx.embed({ title: '🔀 Word scramble', description: `Unscramble: **\`${scrambleWord(word).toUpperCase()}\`**\nHint: *${category}* • ${word.length} letters • 30 seconds!` })] });
      const col = ctx.channel.createMessageCollector({ time: 30000, filter: (m) => !m.author.bot && normalize(m.content) === word });
      col.on('collect', (m) => col.stop(`won:${m.author.id}`));
      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const w = reason.split(':')[1];
          record(ctx.guild?.id, w, 'scramble', 'win');
          return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, description: `🎉 <@${w}> got it in **${((Date.now() - started) / 1000).toFixed(1)}s**! The word was **${word}**.` })], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: `⌛ Time's up! The word was **${word}**.` })] }).catch(() => {});
      });
    },
  },
  {
    name: 'typerace',
    aliases: ['typingrace', 'typetest'],
    description: 'Typing race — first to type the sentence exactly wins (shows WPM)',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const release = claim(ctx, 'typerace');
      if (!release) return ctx.fail('A typing race is already running here!');
      const sentence = pick(SENTENCES);
      // Zero-width spaces make copy-pasting the sentence fail.
      const shown = [...sentence].join(ZWSP);
      await ctx.reply({ embeds: [ctx.embed({ title: '⌨️ Typing race', description: 'Get ready…' })] });
      await sleep(2000);
      const started = Date.now();
      await ctx.channel.send({ embeds: [ctx.embed({ title: '⌨️ Type this! (60s)', description: `**${shown}**` })] }).catch(() => {});
      const target = sentence.replace(/\s+/g, ' ').trim();
      const col = ctx.channel.createMessageCollector({ time: 60000, filter: (m) => !m.author.bot });
      col.on('collect', (m) => {
        if (m.content.includes(ZWSP)) return m.react('🚫').catch(() => {});
        if (m.content.replace(/\s+/g, ' ').trim() === target) col.stop(`won:${m.author.id}`);
      });
      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const w = reason.split(':')[1];
          const secs = (Date.now() - started) / 1000;
          const wpm = Math.round(target.length / 5 / (secs / 60));
          record(ctx.guild?.id, w, 'typerace', 'win');
          const best = setBest(ctx.guild?.id, w, 'typerace_wpm', wpm);
          return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, description: `🏁 <@${w}> wins in **${secs.toFixed(1)}s** — **${wpm} WPM**!${best ? ' New personal best!' : ''}` })], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: '⌛ Nobody finished the race in time.' })] }).catch(() => {});
      });
    },
  },
  {
    name: 'mathquiz',
    aliases: ['mathrace', 'quickmath'],
    description: 'Solve the math problem first to win',
    usage: '[easy|medium|hard]',
    examples: ['', 'hard'],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const level = ['easy', 'medium', 'hard'].includes(String(ctx.args[0]).toLowerCase()) ? String(ctx.args[0]).toLowerCase() : 'medium';
      const release = claim(ctx, 'mathquiz');
      if (!release) return ctx.fail('A math quiz is already running here!');
      const { q, a } = mathQuestion(level);
      const seconds = level === 'hard' ? 30 : 15;
      const started = Date.now();
      await ctx.reply({ embeds: [ctx.embed({ title: `🧮 Math quiz (${level})`, description: `What is **${q}**?\nFirst correct answer in ${seconds}s wins!` })] });
      const col = ctx.channel.createMessageCollector({ time: seconds * 1000, filter: (m) => !m.author.bot && /^-?\d+$/.test(m.content.trim()) });
      col.on('collect', (m) => {
        if (Number(m.content.trim()) === a) col.stop(`won:${m.author.id}`);
        else m.react('❌').catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const w = reason.split(':')[1];
          record(ctx.guild?.id, w, 'mathquiz', 'win');
          return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, description: `✅ <@${w}> answered **${a}** in ${((Date.now() - started) / 1000).toFixed(1)}s!` })], allowedMentions: { parse: [] } }).catch(() => {});
        }
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: `⌛ Time's up! ${q} = **${a}**.` })] }).catch(() => {});
      });
    },
  },
  {
    name: 'reactiontime',
    aliases: ['reaction', 'reflex'],
    description: 'Test your reflexes — click when the button turns green',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const release = claim(ctx, 'reaction');
      if (!release) return ctx.fail('A reaction test is already running here!');
      const wait = row(button('react:go', 'Wait for green…', 'Secondary', '⏳'));
      const msg = await ctx.reply({ embeds: [ctx.embed({ title: '⚡ Reaction test', description: 'Click the button **as soon as it turns green**. Clicking early disqualifies you!' })], components: [wait] });
      if (!msg?.createMessageComponentCollector) return release();
      let greenAt = 0;
      const out = new Set();
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20000, filter: (i) => i.customId === 'react:go' });
      col.on('collect', async (i) => {
        if (out.has(i.user.id)) return i.reply({ content: "You're disqualified this round.", flags: 64 }).catch(() => {});
        if (!greenAt) {
          out.add(i.user.id);
          return i.reply({ content: '🚫 Too early! You are out.', flags: 64 }).catch(() => {});
        }
        const ms = Date.now() - greenAt;
        col.stop('won');
        record(ctx.guild?.id, i.user.id, 'reaction', 'win');
        const best = setBest(ctx.guild?.id, i.user.id, 'reaction_ms', ms, true);
        await i.update({ embeds: [ctx.embed({ color: 0x57f287, title: '⚡ Reaction test', description: `🏆 <@${i.user.id}> clicked in **${ms} ms**!${best ? ' New personal best!' : ''}` })], components: [] }).catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        if (reason !== 'won') msg.edit({ embeds: [ctx.embed({ color: 0xed4245, description: '⌛ Nobody clicked in time.' })], components: [] }).catch(() => {});
      });
      setTimeout(() => {
        if (col.ended) return;
        greenAt = Date.now();
        msg.edit({ components: [row(button('react:go', 'CLICK!', 'Success', '🟢'))] }).catch(() => {});
      }, randInt(2000, 6000)).unref?.();
    },
  },
  {
    name: 'wordchain',
    aliases: ['shiritori'],
    description: 'Word chain: each word must start with the last letter of the previous one',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const release = claim(ctx, 'wordchain');
      if (!release) return ctx.fail('A word chain is already running here!');
      let last = pick(FIVE);
      let lastAuthor = null;
      const used = new Set([last]);
      const scores = new Map();
      await ctx.reply({
        embeds: [ctx.embed({ title: '🔗 Word chain', description: `Starting word: **${last}**\nType a word (3+ letters) starting with **${last.slice(-1).toUpperCase()}**. No repeats, no going twice in a row.\nThe chain breaks after **20 seconds** of silence — the last valid player wins!` })],
      });
      const col = ctx.channel.createMessageCollector({ idle: 20000, filter: (m) => !m.author.bot && /^[a-z]{3,}$/i.test(m.content.trim()) });
      col.on('collect', (m) => {
        const w = m.content.trim().toLowerCase();
        if (m.author.id === lastAuthor) return m.react('⏳').catch(() => {});
        if (w[0] !== last.slice(-1) || used.has(w)) return m.react('❌').catch(() => {});
        used.add(w);
        last = w;
        lastAuthor = m.author.id;
        scores.set(m.author.id, (scores.get(m.author.id) || 0) + 1);
        m.react('✅').catch(() => {});
      });
      col.on('end', () => {
        release();
        if (!lastAuthor) return ctx.channel.send({ embeds: [ctx.embed({ color: 0xed4245, description: '⌛ Nobody continued the chain.' })] }).catch(() => {});
        for (const id of scores.keys()) record(ctx.guild?.id, id, 'wordchain', id === lastAuthor ? 'win' : 'play');
        const board = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n], i) => `${i + 1}. <@${id}> — ${n} word${n === 1 ? '' : 's'}`).join('\n');
        return ctx.channel.send({ embeds: [ctx.embed({ color: 0x57f287, title: '🔗 Chain broken!', description: `Chain length: **${used.size - 1}** • Last word: **${last}**\n🏆 Winner: <@${lastAuthor}>\n\n${board}` })], allowedMentions: { parse: [] } }).catch(() => {});
      });
    },
  },
];

module.exports.mathQuestion = mathQuestion;
module.exports.scrambleWord = scrambleWord;
