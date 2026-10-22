'use strict';
const { pick } = require('../../core/utils');
const { HANGMAN } = require('./_words');
const { claim, record, typedGameProblem } = require('./_lib');

const STAGES = [
  '  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========',
  '  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========',
];
const MAX_WRONG = STAGES.length - 1;

module.exports = [
  {
    name: 'hangman',
    aliases: ['hm'],
    description: 'Guess the word letter by letter — everyone in the channel can help',
    usage: `[${Object.keys(HANGMAN).join('|')}]`,
    examples: ['', 'animals'],
    cooldown: 5,
    slash: true,
    args: [{ name: 'category', type: 'string', description: 'Word category', required: false, choices: Object.keys(HANGMAN) }],
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const wanted = String(ctx.args[0] || '').toLowerCase();
      if (wanted && !HANGMAN[wanted]) return ctx.usage(`Categories: ${Object.keys(HANGMAN).join(', ')}`);
      const category = wanted || pick(Object.keys(HANGMAN));
      const word = pick(HANGMAN[category]);

      const release = claim(ctx, 'hangman');
      if (!release) return ctx.fail('A hangman game is already running in this channel!');

      const guessed = new Set();
      const wrong = [];
      const players = new Set();
      const masked = () => [...word].map((c) => (guessed.has(c) ? c.toUpperCase() : '＿')).join(' ');
      const solved = () => [...word].every((c) => guessed.has(c));
      const view = (status = 'Type a **letter** or guess the **whole word**!', color) =>
        ctx.embed({
          title: `🪢 Hangman — ${category}`,
          description: `\`\`\`\n${STAGES[wrong.length]}\n\`\`\`\n**${masked()}**\n\n${status}`,
          fields: [{ name: `Wrong (${wrong.length}/${MAX_WRONG})`, value: wrong.length ? wrong.join(' ').toUpperCase() : '—' }],
          footer: 'Game ends after 2 minutes without a guess • type "stop" to give up',
          color,
        });

      const msg = await ctx.reply({ embeds: [view()] });
      const col = ctx.channel.createMessageCollector({
        idle: 120000,
        filter: (m) => {
          if (m.author.bot) return false;
          const t = m.content.trim();
          return /^[a-z]$/i.test(t) || t.toLowerCase() === 'stop' || (/^[a-z]+$/i.test(t) && t.length === word.length);
        },
      });
      const update = (status, color) => (msg?.edit ? msg.edit({ embeds: [view(status, color)] }).catch(() => {}) : ctx.channel.send({ embeds: [view(status, color)] }).catch(() => {}));

      col.on('collect', async (m) => {
        const g = m.content.trim().toLowerCase();
        players.add(m.author.id);
        m.delete().catch(() => {});
        if (g === 'stop') {
          if (m.author.id !== ctx.author.id) return;
          return col.stop('stopped');
        }
        if (g.length === 1) {
          if (guessed.has(g) || wrong.includes(g)) return update(`**${g.toUpperCase()}** was already guessed.`);
          if (word.includes(g)) guessed.add(g);
          else wrong.push(g);
          if (solved()) return col.stop(`won:${m.author.id}`);
          if (wrong.length >= MAX_WRONG) return col.stop('lost');
          return update(word.includes(g) ? `✅ <@${m.author.id}> found **${g.toUpperCase()}**!` : `❌ No **${g.toUpperCase()}** in the word.`);
        }
        if (g === word) {
          [...word].forEach((c) => guessed.add(c));
          return col.stop(`won:${m.author.id}`);
        }
        wrong.push(g);
        if (wrong.length >= MAX_WRONG) return col.stop('lost');
        return update(`❌ **${g}** is not the word.`);
      });

      col.on('end', (_c, reason) => {
        release();
        if (reason.startsWith('won:')) {
          const winner = reason.split(':')[1];
          for (const p of players) record(ctx.guild?.id, p, 'hangman', p === winner ? 'win' : 'play');
          [...word].forEach((c) => guessed.add(c));
          return update(`🎉 <@${winner}> solved it! The word was **${word.toUpperCase()}**.`, 0x57f287);
        }
        for (const p of players) record(ctx.guild?.id, p, 'hangman', 'loss');
        const why = reason === 'lost' ? '💀 Out of guesses!' : reason === 'stopped' ? '🛑 Game stopped.' : '⌛ Game timed out.';
        return update(`${why} The word was **${word.toUpperCase()}**.`, 0xed4245);
      });
    },
  },
];
