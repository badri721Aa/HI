'use strict';
const { ComponentType } = require('discord.js');
const { button, row } = require('../../core/ui');
const { record } = require('./_lib');
const { challenge, nameOf } = require('./_duel');
const { RPS, rpsOutcome } = require('../fun/random');

module.exports = [
  {
    name: 'rpsbattle',
    aliases: ['rpsduel'],
    description: 'Rock-paper-scissors duel against another member (secret picks)',
    usage: '<@opponent> [best-of 1|3|5]',
    examples: ['<@111111111111111111>', '<@111111111111111111> 3'],
    minArgs: 1,
    cooldown: 5,
    async execute(ctx) {
      const opponent = await ctx.resolveUser(ctx.args[0]);
      if (!opponent) return ctx.fail('I could not find that user.');
      if (opponent.id === ctx.author.id) return ctx.fail("You can't duel yourself!");
      if (opponent.bot) return ctx.fail(`Bots can't duel — use \`${ctx.prefix}rps\` to play me.`);
      const bestOf = [1, 3, 5].includes(Number(ctx.args[1])) ? Number(ctx.args[1]) : 1;
      const need = Math.ceil(bestOf / 2);

      const res = await challenge(ctx, opponent, `Rock-Paper-Scissors (best of ${bestOf})`);
      if (!res.accepted) return;
      const { msg } = res;
      const players = [ctx.author, opponent];
      const wins = { [ctx.author.id]: 0, [opponent.id]: 0 };
      let picks = {};
      const log = [];
      const controls = (disabled = false) => row(...Object.entries(RPS).map(([k, e]) => button(`rpsb:${k}`, k, 'Primary', e).setDisabled(disabled)));
      const view = (text, disabled = false) => ({
        content: '',
        embeds: [
          ctx.embed({
            title: `✊✋✌️ ${nameOf(players[0])} vs ${nameOf(players[1])}`,
            description: `**Score:** ${wins[players[0].id]} – ${wins[players[1].id]} (first to ${need})\n${log.slice(-5).join('\n')}\n\n${text}`,
          }),
        ],
        components: [controls(disabled)],
      });
      const waiting = () => `Waiting for: ${players.filter((p) => !picks[p.id]).map((p) => `**${nameOf(p)}**`).join(', ')}`;
      await res.interaction.update(view(`Both players: pick secretly! ${waiting()}`)).catch(() => {});

      const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: 60000, filter: (i) => i.customId.startsWith('rpsb:') });
      col.on('collect', async (i) => {
        if (!Object.hasOwn(wins, i.user.id)) return i.reply({ content: "You're not in this duel.", flags: 64 }).catch(() => {});
        if (picks[i.user.id]) return i.reply({ content: 'You already picked this round!', flags: 64 }).catch(() => {});
        picks[i.user.id] = i.customId.split(':')[1];
        if (Object.keys(picks).length < 2) {
          await i.reply({ content: `You picked ${RPS[picks[i.user.id]]} **${picks[i.user.id]}**. Waiting for your opponent…`, flags: 64 }).catch(() => {});
          return msg.edit(view(waiting())).catch(() => {});
        }
        const [a, b] = players;
        const out = rpsOutcome(picks[a.id], picks[b.id]);
        let line = `${RPS[picks[a.id]]} vs ${RPS[picks[b.id]]} — `;
        if (out === 'draw') line += 'draw';
        else {
          const w = out === 'win' ? a : b;
          wins[w.id]++;
          line += `**${nameOf(w)}** takes the round`;
        }
        log.push(line);
        picks = {};
        const champ = players.find((p) => wins[p.id] >= need);
        if (champ) {
          col.stop('finished');
          const loser = players.find((p) => p.id !== champ.id);
          record(ctx.guild?.id, champ.id, 'rpsbattle', 'win');
          record(ctx.guild?.id, loser.id, 'rpsbattle', 'loss');
          return i.update(view(`🏆 **${nameOf(champ)}** wins the duel!`, true)).catch(() => {});
        }
        return i.update(view(`Next round! ${waiting()}`)).catch(() => {});
      });
      col.on('end', (_c, reason) => {
        if (reason !== 'finished') msg.edit(view('⌛ The duel timed out.', true)).catch(() => {});
      });
    },
  },
];
