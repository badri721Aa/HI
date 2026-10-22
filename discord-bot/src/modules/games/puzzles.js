'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { pick, randInt, shuffle } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { claim, record, setBest } = require('./_lib');

const NOT_YOURS = { content: 'Start your own game to play!', flags: 64 };

// ---------------- Minesweeper ----------------
const NUM_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

function mineGrid(size, mines) {
  const cells = shuffle([...Array(size * size).keys()]);
  const isMine = new Set(cells.slice(0, mines));
  const grid = [];
  for (let r = 0; r < size; r++) {
    grid.push([]);
    for (let c = 0; c < size; c++) {
      if (isMine.has(r * size + c)) {
        grid[r].push(-1);
        continue;
      }
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < size && cc >= 0 && cc < size && isMine.has(rr * size + cc)) n++;
      }
      grid[r].push(n);
    }
  }
  return grid;
}

// ---------------- 2048 ----------------
function slideRow(rowVals) {
  const nums = rowVals.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      out.push(nums[i] * 2);
      gained += nums[i] * 2;
      i++;
    } else out.push(nums[i]);
  }
  while (out.length < 4) out.push(0);
  return { row: out, gained };
}

function move2048(g, dir) {
  const get = (i, j) => (dir === 'left' ? g[i][j] : dir === 'right' ? g[i][3 - j] : dir === 'up' ? g[j][i] : g[3 - j][i]);
  const set = (n, i, j, v) => {
    if (dir === 'left') n[i][j] = v;
    else if (dir === 'right') n[i][3 - j] = v;
    else if (dir === 'up') n[j][i] = v;
    else n[3 - j][i] = v;
  };
  const next = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  let gained = 0;
  for (let i = 0; i < 4; i++) {
    const res = slideRow([0, 1, 2, 3].map((j) => get(i, j)));
    gained += res.gained;
    res.row.forEach((v, j) => set(next, i, j, v));
  }
  const moved = next.some((r, i) => r.some((v, j) => v !== g[i][j]));
  return { grid: next, gained, moved };
}

function spawn(g) {
  const empty = [];
  g.forEach((r, i) => r.forEach((v, j) => !v && empty.push([i, j])));
  if (!empty.length) return;
  const [i, j] = pick(empty);
  g[i][j] = Math.random() < 0.9 ? 2 : 4;
}

const canMove = (g) => ['left', 'right', 'up', 'down'].some((d) => move2048(g, d).moved);
const render2048 = (g) => `\`\`\`\n${g.map((r) => r.map((v) => String(v || '·').padStart(5)).join('')).join('\n\n')}\n\`\`\``;

// ---------------- Lights Out ----------------
const LO = 5;
function toggle(lights, idx) {
  const r = Math.floor(idx / LO);
  const c = idx % LO;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < LO && cc >= 0 && cc < LO) lights[rr * LO + cc] = !lights[rr * LO + cc];
  }
}
function loButtons(lights, disabled = false) {
  const rows = [];
  for (let r = 0; r < LO; r++) {
    const ar = new ActionRowBuilder();
    for (let c = 0; c < LO; c++) {
      const i = r * LO + c;
      ar.addComponents(new ButtonBuilder().setCustomId(`lo:${i}`).setEmoji(lights[i] ? '💡' : '⬛').setStyle(lights[i] ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(disabled));
    }
    rows.push(ar);
  }
  return rows;
}

// ---------------- Simon ----------------
const SIMON = ['🟥', '🟦', '🟩', '🟨'];
const simonRow = (disabled) => row(...SIMON.map((e, i) => button(`simon:${i}`, null, 'Secondary', e).setDisabled(disabled)));

module.exports = [
  {
    name: 'minesweeper',
    aliases: ['ms'],
    description: 'A spoiler-tag minesweeper board (click the squares to reveal)',
    usage: '[size 4-9] [mines]',
    examples: ['', '6 5', '9 15'],
    async execute(ctx) {
      const size = Math.min(9, Math.max(4, parseInt(ctx.args[0], 10) || 8));
      const maxMines = size * size - 9;
      const mines = Math.min(maxMines, Math.max(1, parseInt(ctx.args[1], 10) || Math.round(size * size * 0.16)));
      const grid = mineGrid(size, mines);
      // Reveal one safe zero (or the lowest number) as a starting hint.
      const safe = [];
      grid.forEach((r, i) => r.forEach((v, j) => v >= 0 && safe.push([i, j, v])));
      const lowest = Math.min(...safe.map((s) => s[2]));
      const [sr, sc] = pick(safe.filter((s) => s[2] === lowest));
      const text = grid.map((r, i) => r.map((v, j) => {
        const e = v < 0 ? '💣' : NUM_EMOJI[v];
        return i === sr && j === sc ? e : `||${e}||`;
      }).join('')).join('\n');
      await ctx.reply({ content: `💣 **Minesweeper** — ${size}×${size}, ${mines} mines (the unhidden square is safe)\n${text}` });
    },
  },
  {
    name: '2048',
    aliases: ['game2048'],
    description: 'Play 2048 with arrow buttons',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const release = claim(ctx, `2048:${ctx.author.id}`);
      if (!release) return ctx.fail('You already have a 2048 game here!');
      let grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      spawn(grid);
      spawn(grid);
      let score = 0;
      let won = false;
      const controls = (disabled = false) =>
        row(
          button('2048:left', null, 'Primary', '⬅️').setDisabled(disabled),
          button('2048:up', null, 'Primary', '⬆️').setDisabled(disabled),
          button('2048:down', null, 'Primary', '⬇️').setDisabled(disabled),
          button('2048:right', null, 'Primary', '➡️').setDisabled(disabled),
          button('2048:stop', null, 'Danger', '🛑').setDisabled(disabled),
        );
      const view = (status = '', disabled = false, color) => ({
        embeds: [ctx.embed({ title: `🔢 2048 — ${ctx.author.username}`, description: `${render2048(grid)}\n**Score:** ${score}${status ? `\n${status}` : ''}`, color })],
        components: [controls(disabled)],
      });
      const msg = await ctx.reply(view('Merge tiles to reach **2048**!'));
      if (!msg?.createMessageComponentCollector) return release();
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 120000, filter: (i) => i.customId.startsWith('2048:') });
      col.on('collect', async (i) => {
        if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
        const dir = i.customId.split(':')[1];
        if (dir === 'stop') {
          col.stop('stopped');
          return i.update(view('🛑 Game over.', true)).catch(() => {});
        }
        const res = move2048(grid, dir);
        if (!res.moved) return i.deferUpdate().catch(() => {});
        grid = res.grid;
        score += res.gained;
        spawn(grid);
        let status = '';
        if (!won && grid.some((r) => r.some((v) => v >= 2048))) {
          won = true;
          status = '🎉 You reached **2048**! Keep going for a high score.';
        }
        if (!canMove(grid)) {
          col.stop('over');
          return i.update(view('💀 No moves left — game over!', true, 0xed4245)).catch(() => {});
        }
        return i.update(view(status)).catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        record(ctx.guild?.id, ctx.author.id, '2048', won ? 'win' : 'play');
        setBest(ctx.guild?.id, ctx.author.id, '2048', score);
        if (reason === 'idle') msg.edit(view('⌛ Game ended due to inactivity.', true)).catch(() => {});
      });
    },
  },
  {
    name: 'lightsout',
    aliases: ['lights'],
    description: 'Lights Out puzzle — turn off every light (each press toggles neighbours)',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const release = claim(ctx, `lightsout:${ctx.author.id}`);
      if (!release) return ctx.fail('You already have a Lights Out game here!');
      const lights = Array(LO * LO).fill(false);
      // Scramble by pressing random cells from the solved state, so the puzzle is always solvable.
      while (!lights.some(Boolean)) {
        const presses = randInt(6, 12);
        for (let k = 0; k < presses; k++) toggle(lights, randInt(0, LO * LO - 1));
      }
      let moves = 0;
      const content = (text) => `💡 **Lights Out** — ${ctx.author.username} • moves: **${moves}**\n${text}`;
      const msg = await ctx.reply({ content: content('Press a square to toggle it and its neighbours. Turn every light off!'), components: loButtons(lights) });
      if (!msg?.createMessageComponentCollector) return release();
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 180000, filter: (i) => i.customId.startsWith('lo:') });
      col.on('collect', async (i) => {
        if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
        toggle(lights, Number(i.customId.split(':')[1]));
        moves++;
        if (!lights.some(Boolean)) {
          col.stop('won');
          const best = setBest(ctx.guild?.id, ctx.author.id, 'lightsout', moves, true);
          return i.update({ content: content(`🎉 Solved in **${moves}** moves!${best ? ' New personal best!' : ''}`), components: loButtons(lights, true) }).catch(() => {});
        }
        return i.update({ content: content('Keep going!'), components: loButtons(lights) }).catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        record(ctx.guild?.id, ctx.author.id, 'lightsout', reason === 'won' ? 'win' : 'play');
        if (reason !== 'won') msg.edit({ content: content('⌛ Game ended due to inactivity.'), components: loButtons(lights, true) }).catch(() => {});
      });
    },
  },
  {
    name: 'simon',
    aliases: ['simonsays', 'memory'],
    description: 'Memorize the colour sequence and repeat it — how far can you go?',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const release = claim(ctx, `simon:${ctx.author.id}`);
      if (!release) return ctx.fail('You already have a Simon game here!');
      const seq = [pick(SIMON), pick(SIMON)];
      let pos = 0;
      let phase = 'show';
      const showView = () => ({ embeds: [ctx.embed({ title: `🧠 Simon — round ${seq.length - 1}`, description: `Memorize:\n# ${seq.join(' ')}` })], components: [simonRow(true)] });
      const inputView = (extra = '') => ({ embeds: [ctx.embed({ title: `🧠 Simon — round ${seq.length - 1}`, description: `Repeat the sequence (${seq.length} colours)!${extra}` })], components: [simonRow(false)] });
      const msg = await ctx.reply(showView());
      if (!msg?.createMessageComponentCollector) return release();
      const reveal = () =>
        setTimeout(() => {
          phase = 'input';
          msg.edit(inputView()).catch(() => {});
        }, 1500 + seq.length * 600).unref?.();
      reveal();
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 45000, filter: (i) => i.customId.startsWith('simon:') });
      col.on('collect', async (i) => {
        if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
        if (phase !== 'input') return i.deferUpdate().catch(() => {});
        const pressed = SIMON[Number(i.customId.split(':')[1])];
        if (pressed !== seq[pos]) {
          col.stop('lost');
          const score = seq.length - 1 - 1; // rounds fully completed
          const best = setBest(ctx.guild?.id, ctx.author.id, 'simon', score);
          return i.update({ embeds: [ctx.embed({ color: 0xed4245, title: '🧠 Simon — game over', description: `Wrong colour! The sequence was ${seq.join(' ')}\nRounds completed: **${score}**${best ? ' — new personal best!' : ''}` })], components: [] }).catch(() => {});
        }
        pos++;
        if (pos < seq.length) return i.deferUpdate().catch(() => {});
        seq.push(pick(SIMON));
        pos = 0;
        phase = 'show';
        await i.update(showView()).catch(() => {});
        reveal();
      });
      col.on('end', (_c, reason) => {
        release();
        record(ctx.guild?.id, ctx.author.id, 'simon', 'play');
        if (reason !== 'lost') msg.edit({ embeds: [ctx.embed({ description: `⌛ Simon ended. You reached round **${seq.length - 1}**.` })], components: [] }).catch(() => {});
      });
    },
  },
  {
    name: 'higherlower',
    aliases: ['hilo'],
    description: 'Guess if the next number (1-100) is higher or lower — build a streak',
    examples: [''],
    cooldown: 5,
    async execute(ctx) {
      const release = claim(ctx, `hilo:${ctx.author.id}`);
      if (!release) return ctx.fail('You already have a higher/lower game here!');
      let current = randInt(1, 100);
      let streak = 0;
      const controls = (disabled = false) => row(button('hilo:higher', 'Higher', 'Success', '⬆️').setDisabled(disabled), button('hilo:lower', 'Lower', 'Danger', '⬇️').setDisabled(disabled));
      const view = (text, disabled = false, color) => ({ embeds: [ctx.embed({ title: '🃏 Higher or Lower', description: `Current number: **${current}**\nStreak: **${streak}**\n\n${text}`, color })], components: [controls(disabled)] });
      const msg = await ctx.reply(view('Will the next number (1-100) be higher or lower?'));
      if (!msg?.createMessageComponentCollector) return release();
      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 30000, filter: (i) => i.customId.startsWith('hilo:') });
      col.on('collect', async (i) => {
        if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
        let next = randInt(1, 100);
        while (next === current) next = randInt(1, 100);
        const guessHigher = i.customId === 'hilo:higher';
        const right = guessHigher ? next > current : next < current;
        const prev = current;
        current = next;
        if (right) {
          streak++;
          return i.update(view(`✅ ${next} is ${guessHigher ? 'higher' : 'lower'} than ${prev}!`)).catch(() => {});
        }
        col.stop('lost');
        const best = setBest(ctx.guild?.id, ctx.author.id, 'higherlower', streak);
        return i.update(view(`❌ ${next} is ${guessHigher ? 'lower' : 'higher'} than ${prev}. Final streak: **${streak}**${best ? ' — new personal best!' : ''}`, true, 0xed4245)).catch(() => {});
      });
      col.on('end', (_c, reason) => {
        release();
        record(ctx.guild?.id, ctx.author.id, 'higherlower', 'play');
        if (reason !== 'lost') {
          setBest(ctx.guild?.id, ctx.author.id, 'higherlower', streak);
          msg.edit(view(`⌛ Game ended. Final streak: **${streak}**`, true)).catch(() => {});
        }
      });
    },
  },
];

module.exports.move2048 = move2048;
module.exports.mineGrid = mineGrid;
