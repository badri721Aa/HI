'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');

const NOT_YOURS = { content: 'These buttons are not for you.', flags: 64 };

/**
 * Paginated reply with ⏮ ◀ ▶ ⏭ buttons. `pages` are EmbedBuilders or message options.
 * Only the command author can flip pages; buttons are removed after `time`.
 */
async function paginate(ctx, pages, { time = 180000, ephemeral = false } = {}) {
  const list = pages.map((p) => (p instanceof EmbedBuilder ? { embeds: [p] } : p));
  if (!list.length) return ctx.reply({ content: 'Nothing to show.', ephemeral });
  if (list.length === 1) return ctx.reply({ ...list[0], ephemeral });

  let i = 0;
  const row = (disabled = false) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pg:first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || i === 0),
      new ButtonBuilder().setCustomId('pg:prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(disabled || i === 0),
      new ButtonBuilder().setCustomId('pg:page').setLabel(`${i + 1}/${list.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('pg:next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || i === list.length - 1),
      new ButtonBuilder().setCustomId('pg:last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || i === list.length - 1),
    );

  // Pages may carry their own rows (e.g. link buttons); the pager row is appended last.
  const view = (disabled = false) => ({ ...list[i], components: [...(list[i].components || []).slice(0, 4), row(disabled)] });
  const msg = await ctx.reply({ ...view(), ephemeral });
  if (!msg?.createMessageComponentCollector) return msg;
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time, filter: (b) => b.customId.startsWith('pg:') });
  collector.on('collect', async (b) => {
    if (b.user.id !== ctx.author.id) return b.reply(NOT_YOURS).catch(() => {});
    if (b.customId === 'pg:first') i = 0;
    else if (b.customId === 'pg:prev') i = Math.max(0, i - 1);
    else if (b.customId === 'pg:next') i = Math.min(list.length - 1, i + 1);
    else if (b.customId === 'pg:last') i = list.length - 1;
    await b.update(view()).catch(() => {});
  });
  collector.on('end', () => msg.edit({ components: view(true).components }).catch(() => {}));
  return msg;
}

/** Yes/No buttons. Resolves true/false (false on timeout). */
async function confirm(ctx, prompt, { time = 30000, yes = 'Confirm', no = 'Cancel', danger = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cf:yes').setLabel(yes).setStyle(danger ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cf:no').setLabel(no).setStyle(ButtonStyle.Secondary),
  );
  const content = typeof prompt === 'string' ? { embeds: [ctx.embed({ description: prompt })] } : prompt;
  const msg = await ctx.reply({ ...content, components: [row] });
  if (!msg?.awaitMessageComponent) return false;
  try {
    const b = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time,
      filter: (x) => x.customId.startsWith('cf:') && x.user.id === ctx.author.id,
    });
    const ok = b.customId === 'cf:yes';
    await b.update({ components: [], embeds: [ctx.embed({ description: ok ? '✅ Confirmed.' : '❎ Cancelled.' })] }).catch(() => {});
    return ok;
  } catch {
    await msg.edit({ components: [], embeds: [ctx.embed({ description: '⌛ Timed out.' })] }).catch(() => {});
    return false;
  }
}

/** Quick button factory: button('id', 'Label', 'Primary', '🎉') */
function button(customId, label, style = 'Primary', emoji) {
  const b = new ButtonBuilder().setStyle(ButtonStyle[style] ?? ButtonStyle.Primary);
  if (style === 'Link') b.setURL(customId);
  else b.setCustomId(customId);
  if (label) b.setLabel(String(label).slice(0, 80));
  if (emoji) b.setEmoji(emoji);
  return b;
}

const row = (...components) => new ActionRowBuilder().addComponents(...components);

module.exports = { paginate, confirm, button, row };
