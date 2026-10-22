'use strict';
const { StickerFormatType } = require('discord.js');
const { button, row } = require('../../core/ui');

const CUSTOM_RE = /<(a?):(\w{2,32}):(\d{15,21})>/g;

const cleanName = (s) => String(s || '').replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 32);

function customEmojis(text) {
  return [...String(text).matchAll(CUSTOM_RE)].map((m) => ({ animated: !!m[1], name: m[2], id: m[3], url: `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'png'}` }));
}

/** Twemoji image URL for a Unicode emoji (strip VS16 unless it's a ZWJ sequence, as Twemoji does). */
function twemojiUrl(emoji) {
  const points = [...emoji].map((c) => c.codePointAt(0).toString(16));
  const hex = (points.includes('200d') ? points : points.filter((p) => p !== 'fe0f')).join('-');
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${hex}.png`;
}

function explain(err) {
  if (err?.code === 30008) return 'This server has no free emoji slots left.';
  if (err?.code === 30039) return 'This server has no free sticker slots left.';
  if (err?.code === 50035 || err?.code === 50045) return 'Discord rejected the file (emojis must be under 256 KB, stickers under 512 KB PNG/APNG/GIF).';
  if (err?.code === 50013) return 'I am missing the Manage Expressions permission.';
  return `Discord said: ${err?.message || 'unknown error'}`;
}

function findGuildEmoji(guild, arg) {
  const custom = customEmojis(arg)[0];
  const id = custom?.id || (/^\d{15,21}$/.test(arg) ? arg : null);
  if (id) return guild.emojis.cache.get(id) || null;
  const q = String(arg).replace(/:/g, '').toLowerCase();
  return guild.emojis.cache.find((e) => e.name.toLowerCase() === q) || null;
}

module.exports = [
  {
    name: 'addemoji',
    aliases: ['stealemoji', 'emojiadd'],
    description: 'Add custom emojis from other servers, an image URL, or an attachment',
    usage: '<emoji…> | <image url> <name> | <name> (with attachment)',
    examples: ['<:pepe:123456789012345678>', 'https://example.com/cat.png cat'],
    guildOnly: true,
    minArgs: 0,
    userPerms: ['ManageGuildExpressions'],
    botPerms: ['ManageGuildExpressions'],
    cooldown: 5,
    async execute(ctx) {
      const found = customEmojis(ctx.rest(0)).slice(0, 5);
      const jobs = [];
      if (found.length) {
        const custom = /^\w{2,32}$/.test(ctx.args[1] || '') && found.length === 1 ? ctx.args[1] : null;
        for (const e of found) jobs.push({ url: e.url, name: custom || e.name });
      } else if (/^https?:\/\//i.test(ctx.args[0] || '')) {
        jobs.push({ url: ctx.args[0], name: cleanName(ctx.args[1] || 'emoji') });
      } else if (ctx.attachments.length) {
        jobs.push({ url: ctx.attachments[0].url, name: cleanName(ctx.args[0] || ctx.attachments[0].name.split('.')[0]) });
      } else {
        return ctx.usage();
      }
      await ctx.defer();
      const results = [];
      for (const job of jobs) {
        if (job.name.length < 2) job.name = `${job.name}_emoji`;
        try {
          const created = await ctx.guild.emojis.create({ attachment: job.url, name: job.name, reason: `Added by ${ctx.author.username}` });
          results.push(`✅ ${created} \`:${created.name}:\``);
        } catch (err) {
          results.push(`❌ \`${job.name}\` — ${explain(err)}`);
        }
      }
      await ctx.reply({ embeds: [ctx.embed({ title: '😀 Add emoji', description: results.join('\n') })] });
    },
  },
  {
    name: 'enlarge',
    aliases: ['jumbo', 'bigemoji', 'emojiurl'],
    description: 'Show any emoji as a big image',
    usage: '<emoji>',
    examples: ['<:pepe:123456789012345678>', '🔥'],
    minArgs: 1,
    async execute(ctx) {
      const custom = customEmojis(ctx.args[0])[0];
      const url = custom ? `${custom.url}?size=4096` : /^[\w\s]+$/.test(ctx.args[0]) ? null : twemojiUrl(ctx.args[0]);
      if (!url) return ctx.fail('Give me an emoji, e.g. 🔥 or a custom one.');
      await ctx.reply({
        embeds: [ctx.embed({ title: custom ? `:${custom.name}:` : ctx.args[0], image: url })],
        components: [row(button(url, 'Open image', 'Link'))],
      });
    },
  },
  {
    name: 'deleteemoji',
    aliases: ['delemoji', 'removeemoji'],
    description: 'Delete a custom emoji from this server',
    usage: '<emoji | name>',
    examples: ['pepe'],
    guildOnly: true,
    minArgs: 1,
    userPerms: ['ManageGuildExpressions'],
    botPerms: ['ManageGuildExpressions'],
    async execute(ctx) {
      const emoji = findGuildEmoji(ctx.guild, ctx.args[0]);
      if (!emoji) return ctx.fail('That emoji is not from this server.');
      const name = emoji.name;
      try {
        await emoji.delete(`Deleted by ${ctx.author.username}`);
      } catch (err) {
        return ctx.fail(explain(err));
      }
      await ctx.ok(`Deleted \`:${name}:\`.`);
    },
  },
  {
    name: 'renameemoji',
    aliases: ['emojirename'],
    description: 'Rename a custom emoji in this server',
    usage: '<emoji | name> <new name>',
    examples: ['pepe pepe_happy'],
    guildOnly: true,
    minArgs: 2,
    userPerms: ['ManageGuildExpressions'],
    botPerms: ['ManageGuildExpressions'],
    async execute(ctx) {
      const emoji = findGuildEmoji(ctx.guild, ctx.args[0]);
      if (!emoji) return ctx.fail('That emoji is not from this server.');
      const name = cleanName(ctx.args[1]);
      if (name.length < 2) return ctx.fail('Emoji names need at least 2 letters, numbers or underscores.');
      try {
        await emoji.edit({ name, reason: `Renamed by ${ctx.author.username}` });
      } catch (err) {
        return ctx.fail(explain(err));
      }
      await ctx.ok(`Renamed ${emoji} to \`:${name}:\`.`);
    },
  },
  {
    name: 'stealsticker',
    aliases: ['addsticker', 'stickersteal'],
    description: 'Add a sticker to this server (reply to a message that has one)',
    usage: '[name]  (while replying to a sticker message)',
    examples: [''],
    guildOnly: true,
    userPerms: ['ManageGuildExpressions'],
    botPerms: ['ManageGuildExpressions'],
    cooldown: 5,
    async execute(ctx) {
      const ref = ctx.message?.reference?.messageId ? await ctx.channel.messages.fetch(ctx.message.reference.messageId).catch(() => null) : null;
      const sticker = ref?.stickers?.first?.() || ctx.message?.stickers?.first?.();
      if (!sticker) return ctx.usage('Reply to a message containing a sticker (prefix command only).');
      if (sticker.format === StickerFormatType.Lottie) return ctx.fail('That is an official Discord (Lottie) sticker — those cannot be added to servers.');
      const name = cleanName(ctx.args[0] || sticker.name).padEnd(2, '_');
      try {
        const created = await ctx.guild.stickers.create({ file: sticker.url, name, tags: 'star', description: `Added by ${ctx.author.username}`.slice(0, 100) });
        await ctx.ok(`Added sticker **${created.name}**.`);
      } catch (err) {
        await ctx.fail(explain(err));
      }
    },
  },
];
