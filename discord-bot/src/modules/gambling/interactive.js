'use strict';
/** Button-driven games. Bets are taken up front; one interactive game per user at a time. */
const { ComponentType } = require('discord.js');
const db = require('../../core/db');
const { randInt, pick, sleep, formatNumber } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { placeBet, settle, outcome, color, balanceFooter } = require('./_lib');

const g = (ctx) => ctx.guild.id;
const NOT_YOURS = { content: 'This is not your game.', flags: 64 };

/** Collector over the game message; ends after `idle` ms without input. */
function collect(msg, ctx, prefix, idle) {
  return msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle, filter: (i) => i.customId.startsWith(`${prefix}:`) });
}

/** Push a final view either through the clicked button or by editing the message. */
async function finalView(i, msg, view) {
  if (i) return i.update(view).catch(() => msg.edit(view).catch(() => {}));
  return msg.edit(view).catch(() => {});
}

// ============================ BLACKJACK ============================
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const draw = () => ({ r: pick(RANKS), s: pick(SUITS) });
function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.r === 'A') {
      aces++;
      total += 11;
    } else total += ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : Number(c.r);
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return total;
}
const showHand = (hand, hideSecond = false) => hand.map((c, i) => (hideSecond && i === 1 ? '`??`' : `\`${c.r}${c.s}\``)).join(' ');

async function blackjack(ctx) {
  const b = await placeBet(ctx, ctx.args[0], { interactive: true });
  if (!b) return;
  const player = [draw(), draw()];
  const dealer = [draw(), draw()];
  let bet = b.bet;
  let done = false;

  const view = (status, final = false, paid = 0) => {
    const e = ctx.embed({
      title: '🃏 Blackjack',
      description: `**Your hand** (${handValue(player)})\n${showHand(player)}\n\n**Dealer** (${final ? handValue(dealer) : '?'})\n${showHand(dealer, !final)}${status ? `\n\n${status}` : ''}`,
      color: final ? color(bet, paid) : undefined,
      footer: final ? balanceFooter(b.acc) : `Bet: ${formatNumber(bet)} • hit, stand or double down`,
    });
    const canDouble = player.length === 2 && b.acc.wallet >= bet;
    return {
      embeds: [e],
      components: final ? [] : [row(button('bj:hit', 'Hit', 'Primary', '➕'), button('bj:stand', 'Stand', 'Secondary', '✋'), button('bj:double', 'Double', 'Success', '💰').setDisabled(!canDouble))],
    };
  };

  const finish = async (i, msg, natural = false) => {
    if (done) return;
    done = true;
    b.release();
    const pv = handValue(player);
    if (pv <= 21 && !natural) while (handValue(dealer) < 17) dealer.push(draw());
    const dv = handValue(dealer);
    let pay = 0;
    let why;
    if (natural) {
      if (pv === 21 && dv === 21) [pay, why] = [bet, 'Both have blackjack.'];
      else if (pv === 21) [pay, why] = [bet * 2.5, '**Blackjack!** Pays 3:2.'];
      else [pay, why] = [0, 'Dealer has blackjack.'];
    } else if (pv > 21) [pay, why] = [0, `You bust with ${pv}.`];
    else if (dv > 21) [pay, why] = [bet * 2, `Dealer busts with ${dv}!`];
    else if (pv > dv) [pay, why] = [bet * 2, `${pv} beats ${dv}.`];
    else if (pv === dv) [pay, why] = [bet, `Both have ${pv}.`];
    else [pay, why] = [0, `${dv} beats ${pv}.`];
    const paid = settle(b.acc, bet, pay);
    const v = view(`${why}\n${outcome(g(ctx), bet, paid)}`, true, paid);
    if (msg) await finalView(i, msg, v);
    else await ctx.reply(v);
  };

  if (handValue(player) === 21 || handValue(dealer) === 21) return finish(null, null, true);

  const msg = await ctx.reply(view());
  if (!msg?.createMessageComponentCollector) {
    // Could not attach buttons (should not happen) — play it out as a stand.
    return finish(null, null);
  }
  const collector = collect(msg, ctx, 'bj', 60000);
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
    if (done) return;
    const action = i.customId.split(':')[1];
    if (action === 'double') {
      if (player.length !== 2 || b.acc.wallet < bet) return i.reply({ content: 'You cannot double down right now.', flags: 64 }).catch(() => {});
      b.acc.wallet -= bet;
      b.acc.stats.gambled += bet;
      db.save();
      bet *= 2;
      player.push(draw());
      collector.stop('done');
      return finish(i, msg);
    }
    if (action === 'hit') {
      player.push(draw());
      if (handValue(player) >= 21) {
        collector.stop('done');
        return finish(i, msg);
      }
      return i.update(view()).catch(() => {});
    }
    collector.stop('done');
    return finish(i, msg);
  });
  collector.on('end', (_collected, reason) => {
    if (reason === 'done') return;
    if (!done) finish(null, msg); // idle -> automatic stand
  });
}

// ============================ HIGH-LOW ============================
async function highlow(ctx) {
  const b = await placeBet(ctx, ctx.args[0], { interactive: true });
  if (!b) return;
  let current = randInt(1, 100);
  let mult = 1;
  let rounds = 0;
  let done = false;
  const history = [];

  const view = (status, final = false, paid = 0) => ({
    embeds: [
      ctx.embed({
        title: '🔼 Higher or Lower 🔽',
        description: `${history.length ? `${history.join(' → ')} → ` : ''}**${current}**\n\nWill the next number (1–100) be **higher** or **lower** than **${current}**?\nCurrent multiplier: **×${mult.toFixed(2)}** (${formatNumber(Math.floor(b.bet * mult))})${status ? `\n\n${status}` : ''}`,
        color: final ? color(b.bet, paid) : undefined,
        footer: final ? balanceFooter(b.acc) : `Bet: ${formatNumber(b.bet)} • odds update every round`,
      }),
    ],
    components: final
      ? []
      : [
          row(
            button('hl:higher', `Higher (×${(0.97 / ((100 - current) / 99 || 1)).toFixed(2)})`, 'Primary', '🔼').setDisabled(current === 100),
            button('hl:lower', `Lower (×${(0.97 / ((current - 1) / 99 || 1)).toFixed(2)})`, 'Primary', '🔽').setDisabled(current === 1),
            button('hl:cash', 'Cash out', 'Success', '💰').setDisabled(rounds === 0),
          ),
        ],
  });

  const end = async (i, msg, paid, status) => {
    if (done) return;
    done = true;
    b.release();
    const p = settle(b.acc, b.bet, paid);
    await finalView(i, msg, view(`${status}\n${outcome(g(ctx), b.bet, p)}`, true, p));
  };

  const msg = await ctx.reply(view());
  if (!msg?.createMessageComponentCollector) {
    done = true;
    b.release();
    settle(b.acc, b.bet, b.bet);
    return;
  }
  const collector = collect(msg, ctx, 'hl', 45000);
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
    if (done) return;
    const action = i.customId.split(':')[1];
    if (action === 'cash') {
      collector.stop('done');
      return end(i, msg, b.bet * mult, `💰 You cashed out at ×${mult.toFixed(2)}.`);
    }
    let next;
    do next = randInt(1, 100);
    while (next === current);
    const p = action === 'higher' ? (100 - current) / 99 : (current - 1) / 99;
    const right = action === 'higher' ? next > current : next < current;
    history.push(current);
    if (history.length > 8) history.shift();
    if (!right) {
      current = next;
      collector.stop('done');
      return end(i, msg, 0, `❌ It was **${next}**. Wrong guess!`);
    }
    mult = Math.floor(mult * (0.97 / p) * 100) / 100;
    rounds++;
    current = next;
    if (mult >= 1000) {
      collector.stop('done');
      return end(i, msg, b.bet * mult, '🏆 Maximum multiplier reached — auto cash out!');
    }
    return i.update(view(`✅ Correct! It was **${next}**.`)).catch(() => {});
  });
  collector.on('end', (_collected, reason) => {
    if (reason === 'done') return;
    if (done) return;
    if (rounds) end(null, msg, b.bet * mult, '⌛ Timed out — cashed out automatically.');
    else end(null, msg, b.bet, '⌛ Timed out before you played — bet refunded.');
  });
}

// ============================ CRASH ============================
async function crash(ctx) {
  let auto = null;
  if (ctx.args[1] !== undefined) {
    auto = Number(String(ctx.args[1]).replace(/x$/i, ''));
    if (!Number.isFinite(auto) || auto < 1.01 || auto > 100) return ctx.usage('Auto cash-out must be between 1.01 and 100.');
  }
  const b = await placeBet(ctx, ctx.args[0], { interactive: true });
  if (!b) return;
  // House edge 3%: P(crash point >= x) = 0.97 / x.
  const crashAt = Math.min(100, Math.max(1, Math.floor((0.97 / (1 - Math.random())) * 100) / 100));
  let tick = 0;
  let mult = 1;
  let done = false;
  let timer = null;

  const view = (status, final = false, paid = 0) => ({
    embeds: [
      ctx.embed({
        title: '📈 Crash',
        description: `${final ? '' : '🚀 '}Multiplier: **×${mult.toFixed(2)}**\nCash out now: ${formatNumber(Math.floor(b.bet * mult))}${auto ? `\nAuto cash-out at ×${auto.toFixed(2)}` : ''}${status ? `\n\n${status}` : ''}`,
        color: final ? color(b.bet, paid) : 0x5865f2,
        footer: final ? balanceFooter(b.acc) : `Bet: ${formatNumber(b.bet)} • the rocket can explode at any moment`,
      }),
    ],
    components: final ? [] : [row(button('cr:cash', 'Cash out', 'Success', '💰'))],
  });

  const end = async (i, msg, paid, status, collector) => {
    if (done) return;
    done = true;
    clearInterval(timer);
    collector?.stop('done');
    b.release();
    const p = settle(b.acc, b.bet, paid);
    await finalView(i, msg, view(`${status}\n${outcome(g(ctx), b.bet, p)}`, true, p));
  };

  const msg = await ctx.reply(view());
  if (!msg?.createMessageComponentCollector) {
    done = true;
    b.release();
    settle(b.acc, b.bet, b.bet);
    return;
  }
  const collector = collect(msg, ctx, 'cr', 120000);
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
    if (done) return i.deferUpdate().catch(() => {});
    return end(i, msg, b.bet * mult, `💰 You cashed out at **×${mult.toFixed(2)}** (it would have crashed at ×${crashAt.toFixed(2)}).`, collector);
  });
  collector.on('end', (_collected, reason) => {
    if (reason === 'done') return;
    if (!done) end(null, msg, b.bet * mult, '⌛ Game ended — cashed out automatically.');
  });
  timer = setInterval(() => {
    if (done) return clearInterval(timer);
    tick++;
    const next = Math.floor(1.12 ** tick * 100) / 100;
    if (auto && auto <= next && auto < crashAt) {
      mult = auto;
      return end(null, msg, b.bet * auto, `🤖 Auto cash-out at **×${auto.toFixed(2)}** (crash point ×${crashAt.toFixed(2)}).`, collector);
    }
    if (next >= crashAt) {
      mult = crashAt;
      return end(null, msg, 0, `💥 **CRASHED** at ×${crashAt.toFixed(2)}!`, collector);
    }
    mult = next;
    msg.edit(view()).catch(() => {});
  }, 1500);
  timer.unref?.();
}

// ============================ MINES ============================
const TILES = 20;
function minesMultiplier(mines, picks) {
  let m = 0.97;
  for (let i = 0; i < picks; i++) m *= (TILES - i) / (TILES - mines - i);
  return Math.floor(m * 100) / 100;
}

async function mines(ctx) {
  const count = ctx.args[1] === undefined ? 3 : parseInt(ctx.args[1], 10);
  if (!Number.isInteger(count) || count < 1 || count > 15) return ctx.usage('Mines must be between 1 and 15.');
  const b = await placeBet(ctx, ctx.args[0], { interactive: true });
  if (!b) return;
  const bombs = new Set();
  while (bombs.size < count) bombs.add(randInt(0, TILES - 1));
  const opened = new Set();
  let done = false;

  const mult = () => (opened.size ? minesMultiplier(count, opened.size) : 1);
  const view = (status, final = false, paid = 0) => {
    const rows = [];
    for (let r = 0; r < 4; r++) {
      rows.push(
        row(
          ...Array.from({ length: 5 }, (_, c) => {
            const idx = r * 5 + c;
            const isOpen = opened.has(idx);
            const reveal = final || isOpen;
            const btn = button(`mn:t:${idx}`, null, isOpen ? 'Success' : reveal && bombs.has(idx) ? 'Danger' : 'Secondary', reveal ? (bombs.has(idx) ? '💣' : '💎') : '❔');
            return btn.setDisabled(final || isOpen);
          }),
        ),
      );
    }
    if (!final) rows.push(row(button('mn:cash', `Cash out ×${mult().toFixed(2)} (${formatNumber(Math.floor(b.bet * mult()))})`, 'Success', '💰').setDisabled(!opened.size)));
    return {
      embeds: [
        ctx.embed({
          title: '💣 Mines',
          description: `Mines: **${count}** • Gems found: **${opened.size}**\nNext gem: ×${minesMultiplier(count, opened.size + 1).toFixed(2)}${status ? `\n\n${status}` : ''}`,
          color: final ? color(b.bet, paid) : undefined,
          footer: final ? balanceFooter(b.acc) : `Bet: ${formatNumber(b.bet)} • find gems, avoid bombs`,
        }),
      ],
      components: rows,
    };
  };

  const end = async (i, msg, paid, status) => {
    if (done) return;
    done = true;
    b.release();
    const p = settle(b.acc, b.bet, paid);
    await finalView(i, msg, view(`${status}\n${outcome(g(ctx), b.bet, p)}`, true, p));
  };

  const msg = await ctx.reply(view());
  if (!msg?.createMessageComponentCollector) {
    done = true;
    b.release();
    settle(b.acc, b.bet, b.bet);
    return;
  }
  const collector = collect(msg, ctx, 'mn', 60000);
  collector.on('collect', async (i) => {
    if (i.user.id !== ctx.author.id) return i.reply(NOT_YOURS).catch(() => {});
    if (done) return;
    const parts = i.customId.split(':');
    if (parts[1] === 'cash') {
      collector.stop('done');
      return end(i, msg, b.bet * mult(), `💰 Cashed out with ${opened.size} gem${opened.size === 1 ? '' : 's'}.`);
    }
    const idx = Number(parts[2]);
    if (opened.has(idx)) return i.deferUpdate().catch(() => {});
    if (bombs.has(idx)) {
      collector.stop('done');
      return end(i, msg, 0, '💥 **BOOM!** You hit a mine.');
    }
    opened.add(idx);
    if (opened.size === TILES - count) {
      collector.stop('done');
      return end(i, msg, b.bet * mult(), '🏆 You found every gem!');
    }
    return i.update(view()).catch(() => {});
  });
  collector.on('end', (_collected, reason) => {
    if (reason === 'done') return;
    if (done) return;
    if (opened.size) end(null, msg, b.bet * mult(), '⌛ Timed out — cashed out automatically.');
    else end(null, msg, b.bet, '⌛ Timed out before you played — bet refunded.');
  });
}

// ============================ HORSE RACE ============================
const HORSES = ['Thunder', 'Blaze', 'Shadow', 'Comet', 'Lucky'];
const TRACK = 14;

async function horserace(ctx) {
  const choice = parseInt(ctx.args[1], 10);
  if (!(choice >= 1 && choice <= HORSES.length)) return ctx.usage(`Pick a horse 1–${HORSES.length}: ${HORSES.map((h, i) => `${i + 1}. ${h}`).join(', ')}`);
  const b = await placeBet(ctx, ctx.args[0]);
  if (!b) return;
  const winner = randInt(1, HORSES.length);
  const paid = settle(b.acc, b.bet, winner === choice ? b.bet * 4.75 : 0); // RTP 95%
  const finals = HORSES.map((_, i) => (i + 1 === winner ? TRACK : randInt(TRACK - 6, TRACK - 1)));
  const frame = (t) =>
    HORSES.map((name, i) => {
      const pos = t >= 4 ? finals[i] : Math.max(0, Math.min(TRACK - 1, Math.round((finals[i] * (t + 1)) / 5 + randInt(-1, 1))));
      return `🏁${'·'.repeat(TRACK - pos)}🏇${'·'.repeat(pos)} **${i + 1}** ${name}${i + 1 === choice ? ' ⬅️' : ''}`;
    }).join('\n');
  const embedFor = (t, final) =>
    ctx.embed({
      title: '🏇 Horse race',
      description: `${frame(t)}${final ? `\n\n🏆 **${HORSES[winner - 1]}** (#${winner}) wins!\n${outcome(g(ctx), b.bet, paid)}` : '\n\nThey\'re off!'}`,
      color: final ? color(b.bet, paid) : undefined,
      footer: final ? balanceFooter(b.acc) : `You bet ${formatNumber(b.bet)} on #${choice} ${HORSES[choice - 1]} (pays ×4.75)`,
    });
  const msg = await ctx.reply({ embeds: [embedFor(0, false)] });
  // Animate in the background; the result was already paid out above.
  (async () => {
    for (let t = 1; t <= 4; t++) {
      await sleep(1300);
      const e = embedFor(t, t === 4);
      if (ctx.isSlash) await ctx.interaction.editReply({ embeds: [e] }).catch(() => {});
      else await msg?.edit?.({ embeds: [e] }).catch(() => {});
    }
  })().catch(() => {});
}

module.exports = [
  {
    name: 'blackjack',
    aliases: ['bj', '21'],
    description: 'Play blackjack against the dealer (blackjack pays 3:2, double down allowed)',
    usage: '<bet>',
    examples: ['100', 'all'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [{ name: 'bet', type: 'string', description: 'Amount to bet (e.g. 100, 1k, all)', required: true }],
    execute: blackjack,
  },
  {
    name: 'highlow',
    aliases: ['hl'],
    description: 'Guess if the next number is higher or lower — keep going to multiply your bet',
    usage: '<bet>',
    examples: ['100'],
    guildOnly: true,
    minArgs: 1,
    execute: highlow,
  },
  {
    name: 'crash',
    aliases: ['rocket'],
    description: 'Cash out before the rocket crashes! Optional auto cash-out multiplier',
    usage: '<bet> [autoCashout]',
    examples: ['100', '100 2x'],
    guildOnly: true,
    minArgs: 1,
    execute: crash,
  },
  {
    name: 'mines',
    aliases: ['minesgame'],
    description: 'Reveal gems on a 20-tile board without hitting a mine (choose 1–15 mines)',
    usage: '<bet> [mines]',
    examples: ['100', '100 5'],
    guildOnly: true,
    minArgs: 1,
    execute: mines,
  },
  {
    name: 'horserace',
    aliases: ['horses', 'horsebet'],
    description: 'Bet on one of 5 horses (pays ×4.75)',
    usage: '<bet> <horse 1-5>',
    examples: ['100 3'],
    guildOnly: true,
    minArgs: 2,
    cooldown: 6,
    execute: horserace,
  },
];
