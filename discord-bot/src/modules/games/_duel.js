'use strict';
const { ComponentType } = require('discord.js');
const { button, row } = require('../../core/ui');

const nameOf = (u) => u?.displayName || u?.globalName || u?.username || 'someone';

/**
 * Ask `opponent` to accept a 2-player game. Resolves { msg, accepted, interaction }.
 * On accept, `interaction` is the opponent's button press (call interaction.update to start the game in place).
 */
async function challenge(ctx, opponent, label) {
  const msg = await ctx.reply({
    content: `<@${opponent.id}>`,
    embeds: [ctx.embed({ description: `⚔️ **${nameOf(ctx.author)}** challenged **${nameOf(opponent)}** to **${label}**!\nAccept within 60 seconds.` })],
    components: [row(button('duel:yes', 'Accept', 'Success', '✅'), button('duel:no', 'Decline', 'Danger', '✖️'))],
    allowedMentions: { users: [opponent.id] },
  });
  if (!msg?.createMessageComponentCollector) return { msg, accepted: false };
  return new Promise((resolve) => {
    const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000, filter: (i) => i.customId.startsWith('duel:') });
    let settled = false;
    col.on('collect', async (i) => {
      const isOpp = i.user.id === opponent.id;
      const isAuthor = i.user.id === ctx.author.id;
      if (!isOpp && !(isAuthor && i.customId === 'duel:no')) {
        return i.reply({ content: 'This challenge is not for you.', flags: 64 }).catch(() => {});
      }
      settled = true;
      col.stop('done');
      if (i.customId === 'duel:yes') return resolve({ msg, accepted: true, interaction: i });
      await i.update({ content: '', embeds: [ctx.embed({ description: isAuthor ? '❎ Challenge cancelled.' : `❎ **${nameOf(opponent)}** declined the challenge.` })], components: [] }).catch(() => {});
      return resolve({ msg, accepted: false });
    });
    col.on('end', () => {
      if (settled) return;
      msg.edit({ content: '', embeds: [ctx.embed({ description: `⌛ **${nameOf(opponent)}** didn't answer in time.` })], components: [] }).catch(() => {});
      resolve({ msg, accepted: false });
    });
  });
}

/** Validates a 2-player opponent argument. Returns { opponent, vsBot } or { error }. */
async function pickOpponent(ctx, arg) {
  if (!arg) return { opponent: null, vsBot: true };
  const u = await ctx.resolveUser(arg);
  if (!u) return { error: 'I could not find that user.' };
  if (u.id === ctx.author.id) return { error: "You can't play against yourself!" };
  if (u.id === ctx.client.user.id) return { opponent: null, vsBot: true };
  if (u.bot) return { error: "Bots can't play — challenge a human, or leave it empty to play me." };
  return { opponent: u, vsBot: false };
}

module.exports = { challenge, pickOpponent, nameOf };
