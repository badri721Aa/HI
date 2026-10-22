'use strict';
/**
 * Server lottery. Tickets go into a pot (plus a 1,000 house seed); once a day the
 * owning bot draws a winner weighted by ticket count and pays the whole pot.
 * Collection "lottery", key guildId -> { botId, pot, tickets: { userId: n }, drawAt, channelId, lastWinner }.
 */
const db = require('../../core/db');
const { formatNumber, discordTimestamp } = require('../../core/utils');
const { confirm } = require('../../core/ui');
const eco = require('../economy/_lib');

const ROUND_MS = 24 * 60 * 60 * 1000;
const SEED = 1000;
const MAX_TICKETS_PER_USER = 10000;

function round(guildId, botId) {
  const r = db.ensure('lottery', guildId, { botId, pot: SEED, tickets: {}, drawAt: Date.now() + ROUND_MS, channelId: null, lastWinner: null });
  if (!r.botId) r.botId = botId;
  return r;
}

const totalTickets = (r) => Object.values(r.tickets).reduce((n, x) => n + x, 0);

/** Pick a winner weighted by tickets, pay the pot and start a new round. Returns { userId, amount } or null. */
function drawRound(guildId) {
  const r = db.get('lottery', guildId, null);
  if (!r) return null;
  const total = totalTickets(r);
  if (!total) {
    r.drawAt = Date.now() + ROUND_MS;
    db.set('lottery', guildId, r);
    return null;
  }
  let x = Math.random() * total;
  let winner = null;
  for (const [uid, n] of Object.entries(r.tickets)) {
    if ((x -= n) < 0) {
      winner = uid;
      break;
    }
  }
  winner = winner || Object.keys(r.tickets)[0];
  const acc = eco.account(guildId, winner);
  acc.wallet += r.pot;
  acc.stats.gambleWon += Math.max(0, r.pot - (r.tickets[winner] || 0) * eco.settings(guildId).lotteryTicketPrice);
  const result = { userId: winner, amount: r.pot, tickets: r.tickets[winner], total, at: Date.now() };
  db.set('lottery', guildId, { botId: r.botId, pot: SEED, tickets: {}, drawAt: Date.now() + ROUND_MS, channelId: r.channelId, lastWinner: result });
  return result;
}

async function announce(client, guildId, res) {
  const r = db.get('lottery', guildId, null);
  const ch = r?.channelId && client.channels.cache.get(r.channelId);
  if (!ch?.send) return;
  await ch
    .send({
      content: `🎟️ **Lottery draw!** <@${res.userId}> won the pot of ${eco.money(guildId, res.amount)} with ${formatNumber(res.tickets)} of ${formatNumber(res.total)} tickets! A new round has started — \`lottery buy <tickets>\`.`,
      allowedMentions: { users: [res.userId] },
    })
    .catch(() => {});
}

async function drawDue(client) {
  const me = client.user.id;
  for (const [guildId, r] of db.entries('lottery')) {
    if (r.drawAt > Date.now()) continue;
    if (r.botId && r.botId !== me) continue;
    if (!client.guilds.cache.has(guildId)) {
      // The owning bot left this server: release the round so another bot there can draw it.
      if (r.botId === me) {
        r.botId = null;
        db.save();
      }
      continue;
    }
    r.botId = me;
    const res = drawRound(guildId);
    if (res) await announce(client, guildId, res);
  }
}

module.exports = {
  tasks: [{ name: 'lottery-draw', interval: 60000, run: drawDue }],
  commands: [
    {
      name: 'lottery',
      aliases: ['lotto'],
      description: 'Daily server lottery: see the pot, buy tickets, or force a draw (admins)',
      usage: '[buy <tickets>|draw]',
      examples: ['', 'buy 5', 'buy max'],
      guildOnly: true,
      async execute(ctx) {
        const gid = ctx.guild.id;
        const s = eco.settings(gid);
        const sub = String(ctx.args[0] || 'info').toLowerCase();

        if (sub === 'buy') {
          const acc = eco.account(gid, ctx.author.id);
          const r = round(gid, ctx.client.user.id);
          const owned = r.tickets[ctx.author.id] || 0;
          const affordable = Math.min(Math.floor(acc.wallet / s.lotteryTicketPrice), MAX_TICKETS_PER_USER - owned);
          const n = ctx.args[1] === undefined ? 1 : eco.parseAmount(ctx.args[1], affordable);
          if (!n || n < 1) return affordable < 1 ? ctx.fail(`A ticket costs ${eco.money(gid, s.lotteryTicketPrice)} — you cannot afford one (or you hit the ${formatNumber(MAX_TICKETS_PER_USER)} ticket limit).`) : ctx.usage();
          if (owned + n > MAX_TICKETS_PER_USER) return ctx.fail(`You can hold at most ${formatNumber(MAX_TICKETS_PER_USER)} tickets per round.`);
          const cost = n * s.lotteryTicketPrice;
          if (cost > acc.wallet) return ctx.fail(`${formatNumber(n)} tickets cost ${eco.money(gid, cost)} — you have ${eco.money(gid, acc.wallet)}.`);
          acc.wallet -= cost;
          acc.stats.gambled += cost;
          acc.stats.gamesPlayed += 1;
          r.tickets[ctx.author.id] = owned + n;
          r.pot += cost;
          r.channelId = ctx.channel.id;
          db.save();
          const total = totalTickets(r);
          return ctx.ok(`You bought **${formatNumber(n)}** ticket${n === 1 ? '' : 's'} for ${eco.money(gid, cost)}. You hold ${formatNumber(r.tickets[ctx.author.id])}/${formatNumber(total)} tickets (${((r.tickets[ctx.author.id] / total) * 100).toFixed(1)}% chance). Pot: ${eco.money(gid, r.pot)}.`);
        }

        if (sub === 'draw') {
          if (!ctx.member?.permissions?.has?.('ManageGuild')) return ctx.fail('Only admins (Manage Server) can force a draw.');
          const r = db.get('lottery', gid, null);
          if (!r || !totalTickets(r)) return ctx.fail('Nobody has bought tickets this round.');
          if (!(await confirm(ctx, `Draw the lottery now? The pot is ${eco.money(gid, r.pot)}.`, { danger: false }))) return;
          const res = drawRound(gid);
          if (!res) return ctx.fail('Nobody has bought tickets this round.');
          return ctx.reply({ content: `🎟️ <@${res.userId}> won the lottery pot of ${eco.money(gid, res.amount)}!`, allowedMentions: { users: [res.userId] } });
        }

        const r = db.get('lottery', gid, null);
        const total = r ? totalTickets(r) : 0;
        const mine = r?.tickets?.[ctx.author.id] || 0;
        const last = r?.lastWinner;
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: '🎟️ Server lottery',
              description: r
                ? `**Pot:** ${eco.money(gid, r.pot)}\n**Tickets sold:** ${formatNumber(total)}\n**Your tickets:** ${formatNumber(mine)}${total ? ` (${((mine / total) * 100).toFixed(1)}% chance)` : ''}\n**Draw:** ${discordTimestamp(r.drawAt, 'R')}`
                : 'No round is running yet — buying the first ticket starts one.',
              fields: [
                { name: 'Ticket price', value: eco.money(gid, s.lotteryTicketPrice), inline: true },
                { name: 'How to play', value: '`lottery buy <tickets>`', inline: true },
                last ? { name: 'Last winner', value: `<@${last.userId}> won ${eco.money(gid, last.amount)} ${discordTimestamp(last.at, 'R')}` } : null,
              ],
            }),
          ],
        });
      },
    },
  ],
};
