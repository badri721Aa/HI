'use strict';
/**
 * Help menu built for 1000+ commands: category picker (select menus) + paged
 * command lists. All buttons are stateless (state lives in the customId), so
 * help menus keep working after restarts.
 */
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { CATEGORIES, meta } = require('../../core/categories');
const { chunk } = require('../../core/utils');
const { prefixFor, moduleEnabled } = require('../../core/handler');
const embeds = require('../../core/embeds');

const PER_PAGE = 15;
const ORDER = Object.keys(CATEGORIES);

function visibleCategories(client) {
  return [...client.registry.categories.entries()]
    .filter(([cat]) => moduleEnabled(client, cat))
    .map(([cat, cmds]) => [cat, cmds.filter((c) => !c.hidden && !c.ownerOnly)])
    .filter(([, cmds]) => cmds.length)
    .sort((a, b) => (ORDER.indexOf(a[0]) + 1 || 999) - (ORDER.indexOf(b[0]) + 1 || 999));
}

function selectRows(client, ownerId) {
  const cats = visibleCategories(client);
  return chunk(cats, 25)
    .slice(0, 2)
    .map((group, i) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`help:cat:${ownerId}:${i}`)
          .setPlaceholder(i === 0 ? '📂 Pick a category…' : '📂 More categories…')
          .addOptions(
            group.map(([cat, cmds]) => ({
              label: `${meta(cat).label} (${cmds.length})`.slice(0, 100),
              value: cat,
              emoji: meta(cat).emoji,
              description: (meta(cat).description || `${cmds.length} commands`).slice(0, 100),
            })),
          ),
      ),
    );
}

function renderHome(client, prefix, ownerId) {
  const cats = visibleCategories(client);
  const total = cats.reduce((n, [, cmds]) => n + cmds.length, 0);
  const lines = cats.map(([cat, cmds]) => `${meta(cat).emoji} **${meta(cat).label}** — ${cmds.length}`);
  const half = Math.ceil(lines.length / 2);
  const e = embeds.embed({
    color: client.botProfile.color,
    title: `📖 ${client.user.username} — ${total} commands`,
    description:
      `Prefix: \`${prefix}\` • Slash: \`/cmd <name>\` runs **any** command • Mention me works too.\n` +
      `\`${prefix}help <command>\` for details • \`${prefix}help <category>\` to list a category.`,
    fields: [
      { name: 'Categories', value: lines.slice(0, half).join('\n') || '—', inline: true },
      { name: '​', value: lines.slice(half).join('\n') || '​', inline: true },
    ],
    thumbnail: client.user.displayAvatarURL?.(),
    footer: 'Pick a category below to browse its commands.',
  });
  return { embeds: [e], components: selectRows(client, ownerId) };
}

function renderCategory(client, prefix, ownerId, cat, page = 0) {
  const entry = visibleCategories(client).find(([c]) => c === cat);
  if (!entry) return renderHome(client, prefix, ownerId);
  const cmds = [...entry[1]].sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(cmds.length / PER_PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = cmds.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
  const m = meta(cat);
  const e = embeds.embed({
    color: client.botProfile.color,
    title: `${m.emoji} ${m.label} — ${cmds.length} commands`,
    description: slice.map((c) => `\`${prefix}${c.name}\` — ${c.description}`).join('\n'),
    footer: `Page ${p + 1}/${pages} • ${prefix}help <command> for usage`,
  });
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`help:home:${ownerId}`).setEmoji('🏠').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`help:page:${ownerId}:${cat}:${p - 1}:prev`).setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(p === 0),
    new ButtonBuilder().setCustomId(`help:noop:${ownerId}`).setLabel(`${p + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`help:page:${ownerId}:${cat}:${p + 1}:next`).setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(p >= pages - 1),
    new ButtonBuilder().setCustomId(`help:page:${ownerId}:${cat}:${pages - 1}:last`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(p >= pages - 1),
  );
  return { embeds: [e], components: [...selectRows(client, ownerId), nav] };
}

function renderCommand(client, prefix, cmd) {
  const perms = [...cmd.userPerms].map((p) => p.replace(/([a-z])([A-Z])/g, '$1 $2'));
  return {
    embeds: [
      embeds.embed({
        color: client.botProfile.color,
        title: `${meta(cmd.category).emoji} ${prefix}${cmd.name}`,
        description: cmd.description,
        fields: [
          { name: 'Usage', value: `\`${prefix}${cmd.name}${cmd.usage ? ` ${cmd.usage}` : ''}\`` },
          { name: 'Examples', value: cmd.examples?.length ? cmd.examples.slice(0, 4).map((e) => `\`${prefix}${cmd.name} ${e}\``).join('\n') : null },
          { name: 'Aliases', value: cmd.aliases.length ? cmd.aliases.map((a) => `\`${a}\``).join(', ') : null, inline: true },
          { name: 'Category', value: meta(cmd.category).label, inline: true },
          { name: 'Cooldown', value: `${cmd.cooldown}s`, inline: true },
          { name: 'Permissions', value: perms.length ? perms.join(', ') : null, inline: true },
          { name: 'Slash', value: cmd.slash ? `\`/${cmd.name}\`` : `\`/cmd command:${cmd.name}\``, inline: true },
        ],
      }),
    ],
  };
}

module.exports = {
  commands: [
    {
      name: 'help',
      aliases: ['h'],
      description: 'Browse all commands, or get help for one command or category',
      usage: '[command | category]',
      examples: ['', 'ban', 'music'],
      slash: true,
      args: [{ name: 'query', type: 'string', description: 'A command or category name', required: false }],
      async execute(ctx) {
        const q = (ctx.args[0] || '').toLowerCase();
        if (!q) return ctx.reply(renderHome(ctx.client, ctx.prefix, ctx.author.id));
        const cmd = ctx.registry.get(q);
        if (cmd && !cmd.hidden && moduleEnabled(ctx.client, cmd.category)) return ctx.reply(renderCommand(ctx.client, ctx.prefix, cmd));
        const cat = visibleCategories(ctx.client).find(([c]) => c === q || meta(c).label.toLowerCase() === q);
        if (cat) return ctx.reply(renderCategory(ctx.client, ctx.prefix, ctx.author.id, cat[0], 0));
        const close = [...ctx.registry.commands.keys()].filter((n) => n.includes(q)).slice(0, 10);
        return ctx.fail(`No command or category called \`${q}\`.${close.length ? `\nDid you mean: ${close.map((n) => `\`${n}\``).join(', ')}?` : ''}`);
      },
    },
    {
      name: 'commands',
      aliases: ['cmds', 'cmdcount'],
      description: 'How many commands the bot has, per category',
      async execute(ctx) {
        const cats = visibleCategories(ctx.client);
        const total = cats.reduce((n, [, c]) => n + c.length, 0);
        const lines = cats.map(([cat, cmds]) => `${meta(cat).emoji} ${meta(cat).label}: **${cmds.length}**`);
        await ctx.reply({
          embeds: [
            ctx.embed({
              title: `🧮 ${total} commands (+${ctx.registry.aliases.size} aliases)`,
              description: lines.join('\n'),
              footer: `Plus unlimited custom commands per server • ${ctx.prefix}help <category>`,
            }),
          ],
        });
      },
    },
  ],
  components: {
    async help(interaction, parts, client) {
      const [action, ownerId, ...rest] = parts;
      const prefix = prefixFor(client, interaction.guild);
      const mine = interaction.user.id === ownerId;
      const owner = mine ? ownerId : interaction.user.id;
      let view;
      if (action === 'cat') view = renderCategory(client, prefix, owner, interaction.values[0], 0);
      else if (action === 'page') view = renderCategory(client, prefix, owner, rest[0], Number(rest[1]) || 0);
      else if (action === 'home') view = renderHome(client, prefix, owner);
      else return interaction.deferUpdate().catch(() => {});
      // Someone else's menu: give them their own private copy instead of flipping it for everyone.
      if (mine) return interaction.update(view);
      return interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
    },
  },
};
