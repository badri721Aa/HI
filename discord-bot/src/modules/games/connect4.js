'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { pick } = require('../../core/utils');
const { record } = require('./_lib');
const { challenge, pickOpponent, nameOf } = require('./_duel');

const ROWS = 6;
const COLS = 7;
const DISC = { 1: '🔴', 2: '🟡' };
const NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

const newBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));
const canDrop = (b, c) => b[0][c] === 0;
function drop(b, c, p) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][c] === 0) {
      b[r][c] = p;
      return r;
    }
  }
  return -1;
}
const undrop = (b, c) => {
  for (let r = 0; r < ROWS; r++) {
    if (b[r][c] !== 0) {
      b[r][c] = 0;
      return;
    }
  }
};

function isWin(b, r, c) {
  const p = b[r][c];
  if (!p) return false;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let rr = r + dr * s;
      let cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p) {
        n++;
        rr += dr * s;
        cc += dc * s;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}
const full = (b) => b[0].every((v) => v !== 0);

/** Simple but sensible AI: win if possible, block, avoid gifting a win, prefer the centre. */
function botColumn(b, me) {
  const them = me === 1 ? 2 : 1;
  const open = [...Array(COLS).keys()].filter((c) => canDrop(b, c));
  for (const who of [me, them]) {
    for (const c of open) {
      const r = drop(b, c, who);
      const w = isWin(b, r, c);
      undrop(b, c);
      if (w) return c;
    }
  }
  const safe = open.filter((c) => {
    drop(b, c, me);
    const gift = canDrop(b, c) && (() => {
      const r2 = drop(b, c, them);
      const w = isWin(b, r2, c);
      undrop(b, c);
      return w;
    })();
    undrop(b, c);
    return !gift;
  });
  const pool = safe.length ? safe : open;
  const weighted = pool.flatMap((c) => Array(4 - Math.abs(3 - c)).fill(c));
  return pick(weighted);
}

function render(b) {
  return `${b.map((row) => row.map((v) => DISC[v] || '⚫').join('')).join('\n')}\n${NUMS.join('')}`;
}

function controls(b, disabled = false) {
  const mk = (c) => new ButtonBuilder().setCustomId(`c4:${c}`).setEmoji(NUMS[c]).setStyle(ButtonStyle.Secondary).setDisabled(disabled || !canDrop(b, c));
  return [new ActionRowBuilder().addComponents([0, 1, 2, 3].map(mk)), new ActionRowBuilder().addComponents([4, 5, 6].map(mk))];
}

module.exports = [
  {
    name: 'connect4',
    aliases: ['c4', 'connectfour'],
    description: 'Play Connect Four against a friend or against me',
    usage: '[@opponent]',
    examples: ['', '<@111111111111111111>'],
    cooldown: 5,
    async execute(ctx) {
      const { opponent, vsBot, error } = await pickOpponent(ctx, ctx.args[0]);
      if (error) return ctx.fail(error);
      const players = { 1: ctx.author, 2: vsBot ? ctx.client.user : opponent };
      const board = newBoard();
      let turn = 1;
      let msg;
      const view = (text, disabled = false) => ({
        content: '',
        embeds: [ctx.embed({ title: '🔴🟡 Connect Four', description: `${DISC[1]} **${nameOf(players[1])}** vs ${DISC[2]} **${nameOf(players[2])}**\n\n${render(board)}\n\n${text}` })],
        components: controls(board, disabled),
      });

      if (vsBot) msg = await ctx.reply(view(`${DISC[1]} Your move, **${nameOf(players[1])}**!`));
      else {
        const res = await challenge(ctx, opponent, 'Connect Four');
        if (!res.accepted) return;
        msg = res.msg;
        await res.interaction.update(view(`${DISC[1]} **${nameOf(players[1])}** goes first!`)).catch(() => {});
      }
      if (!msg?.createMessageComponentCollector) return;

      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 120000, filter: (i) => i.customId.startsWith('c4:') });
      const end = async (i, winnerNum) => {
        col.stop('finished');
        let text;
        if (!winnerNum) {
          text = "🤝 The board is full — it's a draw!";
          for (const n of [1, 2]) if (players[n].id !== ctx.client.user.id) record(ctx.guild?.id, players[n].id, 'connect4', 'draw');
        } else {
          const w = players[winnerNum];
          const l = players[winnerNum === 1 ? 2 : 1];
          text = w.id === ctx.client.user.id ? '🤖 I win! Four in a row.' : `🎉 **${nameOf(w)}** connects four and wins!`;
          if (w.id !== ctx.client.user.id) record(ctx.guild?.id, w.id, 'connect4', 'win');
          if (l.id !== ctx.client.user.id) record(ctx.guild?.id, l.id, 'connect4', 'loss');
        }
        await i.update(view(text, true)).catch(() => {});
      };

      col.on('collect', async (i) => {
        if (![players[1].id, players[2].id].includes(i.user.id)) return i.reply({ content: "You're not in this game.", flags: 64 }).catch(() => {});
        if (i.user.id !== players[turn].id) return i.reply({ content: "It's not your turn!", flags: 64 }).catch(() => {});
        const c = Number(i.customId.split(':')[1]);
        if (!canDrop(board, c)) return i.reply({ content: 'That column is full.', flags: 64 }).catch(() => {});
        const r = drop(board, c, turn);
        if (isWin(board, r, c)) return end(i, turn);
        if (full(board)) return end(i, 0);
        turn = turn === 1 ? 2 : 1;
        if (vsBot) {
          const bc = botColumn(board, 2);
          const br = drop(board, bc, 2);
          if (isWin(board, br, bc)) return end(i, 2);
          if (full(board)) return end(i, 0);
          turn = 1;
        }
        await i.update(view(`${DISC[turn]} Your move, **${nameOf(players[turn])}**!`)).catch(() => {});
      });
      col.on('end', async (_c, reason) => {
        if (reason === 'finished') return;
        const loser = players[turn];
        const other = players[turn === 1 ? 2 : 1];
        if (loser.id !== ctx.client.user.id) record(ctx.guild?.id, loser.id, 'connect4', 'loss');
        if (other.id !== ctx.client.user.id) record(ctx.guild?.id, other.id, 'connect4', 'win');
        await msg.edit(view(`⌛ **${nameOf(loser)}** took too long — **${nameOf(other)}** wins by timeout.`, true)).catch(() => {});
      });
    },
  },
];

module.exports.botColumn = botColumn;
module.exports.isWin = isWin;
