'use strict';
const { pick } = require('../../core/utils');
const { FIVE } = require('./_words');
const { claim, record, setBest, typedGameProblem } = require('./_lib');

const MAX_TRIES = 6;
const KEYS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Standard Wordle scoring with correct duplicate-letter handling. 2=green 1=yellow 0=grey */
function score(guess, answer) {
  const res = Array(5).fill(0);
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) res[i] = 2;
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 0 && left[guess[i]]) {
      res[i] = 1;
      left[guess[i]]--;
    }
  }
  return res;
}

const SQUARES = ['⬛', '🟨', '🟩'];
const letterEmoji = (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 97);

module.exports = [
  {
    name: 'wordle',
    description: 'Guess the 5-letter word in 6 tries (type your guesses in chat)',
    examples: [''],
    cooldown: 5,
    slash: true,
    args: [],
    async execute(ctx) {
      const problem = typedGameProblem(ctx);
      if (problem) return ctx.fail(problem);
      const release = claim(ctx, `wordle:${ctx.author.id}`);
      if (!release) return ctx.fail('You already have a Wordle running here!');

      const answer = pick(FIVE);
      const rows = [];
      const keyState = {}; // letter -> 0/1/2 best known
      const board = () => {
        const lines = rows.map(({ guess, res }) => `${res.map((r) => SQUARES[r]).join('')}  ${[...guess].map(letterEmoji).join('​')}`);
        for (let i = rows.length; i < MAX_TRIES; i++) lines.push('⬜⬜⬜⬜⬜');
        return lines.join('\n');
      };
      const keyboard = () =>
        KEYS.map((line) =>
          [...line]
            .map((c) => (keyState[c] === 2 ? `**${c.toUpperCase()}**` : keyState[c] === 1 ? `__${c.toUpperCase()}__` : keyState[c] === 0 ? '~~' + c.toUpperCase() + '~~' : c.toUpperCase()))
            .join(' '),
        ).join('\n');
      const view = (status, color) => ({
        embeds: [
          ctx.embed({
            title: `🟩 Wordle — ${ctx.author.username}`,
            description: `${board()}\n\n${keyboard()}\n\n${status}`,
            footer: 'Keyboard: bold = right spot • underlined = wrong spot • struck out = not in word • type "stop" to give up',
            color,
          }),
        ],
      });

      const msg = await ctx.reply(view(`Type a 5-letter word to guess. You have **${MAX_TRIES}** tries.`));
      const update = (s, color) => (msg?.edit ? msg.edit(view(s, color)).catch(() => {}) : null);

      const col = ctx.channel.createMessageCollector({
        idle: 5 * 60000,
        filter: (m) => m.author.id === ctx.author.id && (/^[a-z]{5}$/i.test(m.content.trim()) || m.content.trim().toLowerCase() === 'stop'),
      });
      col.on('collect', (m) => {
        const guess = m.content.trim().toLowerCase();
        m.delete().catch(() => {});
        if (guess === 'stop') return col.stop('stopped');
        if (rows.some((r) => r.guess === guess)) return update(`You already tried **${guess.toUpperCase()}**.`);
        const res = score(guess, answer);
        rows.push({ guess, res });
        [...guess].forEach((c, i) => {
          keyState[c] = Math.max(keyState[c] ?? -1, res[i]);
        });
        if (guess === answer) return col.stop('won');
        if (rows.length >= MAX_TRIES) return col.stop('lost');
        return update(`${MAX_TRIES - rows.length} tries left.`);
      });
      col.on('end', (_c, reason) => {
        release();
        if (reason === 'won') {
          record(ctx.guild?.id, ctx.author.id, 'wordle', 'win');
          const best = setBest(ctx.guild?.id, ctx.author.id, 'wordle', rows.length, true);
          return update(`🎉 Solved in **${rows.length}/${MAX_TRIES}**!${best ? ' New personal best!' : ''}`, 0x57f287);
        }
        record(ctx.guild?.id, ctx.author.id, 'wordle', 'loss');
        const why = reason === 'lost' ? '💀 Out of tries!' : reason === 'stopped' ? '🛑 Game stopped.' : '⌛ Game timed out.';
        return update(`${why} The word was **${answer.toUpperCase()}**.`, 0xed4245);
      });
    },
  },
];

module.exports.score = score;
