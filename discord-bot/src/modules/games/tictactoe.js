'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { pick } = require('../../core/utils');
const { record } = require('./_lib');
const { challenge, pickOpponent, nameOf } = require('./_duel');

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const MARK = { X: '❌', O: '⭕' };

function winner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line: [a, c, d] };
  return b.every(Boolean) ? { mark: 'draw', line: [] } : null;
}

function minimax(b, me, turn, depth = 0) {
  const w = winner(b);
  if (w) return w.mark === 'draw' ? 0 : w.mark === me ? 10 - depth : depth - 10;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    scores.push(minimax(b, me, turn === 'X' ? 'O' : 'X', depth + 1));
    b[i] = null;
  }
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/** Strong but beatable: perfect play most of the time, a random move ~20% of the time. */
function botMove(b, me) {
  const free = b.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  if (Math.random() < 0.2) return pick(free);
  let best = -Infinity;
  let moves = [];
  for (const i of free) {
    b[i] = me;
    const s = minimax(b, me, me === 'X' ? 'O' : 'X', 1);
    b[i] = null;
    if (s > best) {
      best = s;
      moves = [i];
    } else if (s === best) moves.push(i);
  }
  return pick(moves);
}

function grid(b, { disabled = false, highlight = [] } = {}) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const ar = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const btn = new ButtonBuilder().setCustomId(`ttt:${i}`).setDisabled(disabled || !!b[i]);
      if (b[i]) btn.setEmoji(MARK[b[i]]).setStyle(highlight.includes(i) ? ButtonStyle.Success : b[i] === 'X' ? ButtonStyle.Danger : ButtonStyle.Primary);
      else btn.setEmoji('➖').setStyle(ButtonStyle.Secondary);
      ar.addComponents(btn);
    }
    rows.push(ar);
  }
  return rows;
}

module.exports = [
  {
    name: 'tictactoe',
    aliases: ['ttt'],
    description: 'Play tic-tac-toe against a friend or against me',
    usage: '[@opponent]',
    examples: ['', '<@111111111111111111>'],
    cooldown: 5,
    slash: true,
    args: [{ name: 'opponent', type: 'user', description: 'Who to play against (leave empty to play the bot)', required: false }],
    async execute(ctx) {
      const { opponent, vsBot, error } = await pickOpponent(ctx, ctx.args[0]);
      if (error) return ctx.fail(error);

      const players = { X: ctx.author, O: vsBot ? ctx.client.user : opponent };
      const board = Array(9).fill(null);
      let turn = 'X';
      let msg;
      const status = (text) => ctx.embed({ title: '❌⭕ Tic-Tac-Toe', description: `${MARK.X} **${nameOf(players.X)}** vs ${MARK.O} **${nameOf(players.O)}**\n\n${text}` });

      if (vsBot) {
        msg = await ctx.reply({ embeds: [status(`Your turn, **${nameOf(players.X)}**!`)], components: grid(board) });
      } else {
        const res = await challenge(ctx, opponent, 'Tic-Tac-Toe');
        if (!res.accepted) return;
        msg = res.msg;
        await res.interaction.update({ content: '', embeds: [status(`${MARK.X} **${nameOf(players.X)}** goes first!`)], components: grid(board) }).catch(() => {});
      }
      if (!msg?.createMessageComponentCollector) return;

      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 60000, filter: (i) => i.customId.startsWith('ttt:') });
      const finish = async (i, result) => {
        col.stop('finished');
        let text;
        if (result.mark === 'draw') {
          text = "🤝 It's a draw!";
          for (const m of ['X', 'O']) if (!(vsBot && m === 'O')) record(ctx.guild?.id, players[m].id, 'tictactoe', 'draw');
        } else {
          const w = players[result.mark];
          const l = players[result.mark === 'X' ? 'O' : 'X'];
          text = w.id === ctx.client.user.id ? '🤖 I win! Better luck next time.' : `🎉 **${nameOf(w)}** wins!`;
          if (w.id !== ctx.client.user.id) record(ctx.guild?.id, w.id, 'tictactoe', 'win');
          if (l.id !== ctx.client.user.id) record(ctx.guild?.id, l.id, 'tictactoe', 'loss');
        }
        const payload = { embeds: [status(text)], components: grid(board, { disabled: true, highlight: result.line }) };
        if (i) await i.update(payload).catch(() => {});
        else await msg.edit(payload).catch(() => {});
      };

      col.on('collect', async (i) => {
        if (![players.X.id, players.O.id].includes(i.user.id)) return i.reply({ content: "You're not in this game.", flags: 64 }).catch(() => {});
        if (i.user.id !== players[turn].id) return i.reply({ content: "It's not your turn!", flags: 64 }).catch(() => {});
        const idx = Number(i.customId.split(':')[1]);
        if (board[idx]) return i.deferUpdate().catch(() => {});
        board[idx] = turn;
        let result = winner(board);
        if (result) return finish(i, result);
        turn = turn === 'X' ? 'O' : 'X';
        if (vsBot) {
          board[botMove(board, 'O')] = 'O';
          result = winner(board);
          if (result) return finish(i, result);
          turn = 'X';
        }
        await i.update({ embeds: [status(`Your turn, ${MARK[turn]} **${nameOf(players[turn])}**!`)], components: grid(board) }).catch(() => {});
      });
      col.on('end', async (_c, reason) => {
        if (reason === 'finished') return;
        const loser = players[turn];
        const other = players[turn === 'X' ? 'O' : 'X'];
        if (loser.id !== ctx.client.user.id) record(ctx.guild?.id, loser.id, 'tictactoe', 'loss');
        if (other.id !== ctx.client.user.id) record(ctx.guild?.id, other.id, 'tictactoe', 'win');
        await msg.edit({ embeds: [status(`⌛ **${nameOf(loser)}** took too long — **${nameOf(other)}** wins by timeout.`)], components: grid(board, { disabled: true }) }).catch(() => {});
      });
    },
  },
];
