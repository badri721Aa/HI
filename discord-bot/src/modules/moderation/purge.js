'use strict';
const { clamp } = require('../../core/utils');
const lib = require('./_lib');

const FOURTEEN_DAYS = 14 * 86400000 - 60000;
const LINK_RE = /https?:\/\/\S+|www\.\S+/i;
const INVITE_RE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;

/**
 * Delete up to `amount` recent messages matching `filter` in the current channel.
 * Scans up to `scan` messages back; skips pinned and >14-day-old messages (Discord limit).
 */
async function purge(ctx, { amount, filter = () => true, scan = 100, label = 'messages' }) {
  if (!(await lib.requirePerm(ctx, 'ManageMessages'))) return;
  if (!(await lib.requireBotPerm(ctx, 'ManageMessages'))) return;
  amount = clamp(amount, 1, 100);
  if (!ctx.isSlash) await ctx.message.delete().catch(() => {});
  else await ctx.defer(true);

  const cutoff = Date.now() - FOURTEEN_DAYS;
  const picked = [];
  let before;
  let scanned = 0;
  let tooOld = false;
  while (picked.length < amount && scanned < scan) {
    const batch = await ctx.channel.messages.fetch({ limit: Math.min(100, scan - scanned), ...(before ? { before } : {}) });
    if (!batch.size) break;
    for (const m of batch.values()) {
      if (m.createdTimestamp < cutoff) {
        tooOld = true;
        break;
      }
      if (!m.pinned && (!ctx.message || m.id !== ctx.message.id) && filter(m)) picked.push(m);
      if (picked.length >= amount) break;
    }
    if (tooOld) break;
    scanned += batch.size;
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  let deleted = 0;
  if (picked.length) {
    const res = await ctx.channel.bulkDelete(picked, true);
    deleted = res?.size ?? 0;
  }
  const note = tooOld && deleted < amount ? ' (messages older than 14 days can\'t be bulk-deleted)' : '';
  const msg = await ctx.reply({ embeds: [ctx.embed({ description: `🧹 Deleted **${deleted}** ${label}${note}.` })], ephemeral: true });
  lib.autoDelete(ctx, msg, 5000);
  if (deleted) {
    await lib.postModlog(ctx.guild, lib.actionEmbed('🧹 Purge', `${ctx.author} deleted **${deleted}** ${label} in <#${ctx.channel.id}>.`));
  }
}

/** Parse "[amount]" from a position, defaulting to `def`. Returns NaN on garbage. */
function amountArg(token, def = 50) {
  if (token === undefined) return def;
  const n = parseInt(token, 10);
  return Number.isFinite(n) && String(n) === String(token).trim() ? n : NaN;
}

function simple(name, aliases, description, filter, label) {
  return {
    name,
    aliases,
    description,
    usage: '[amount=50]',
    examples: ['', '20'],
    guildOnly: true,
    cooldown: 5,
    async execute(ctx) {
      const amount = amountArg(ctx.args[0]);
      if (!(amount >= 1 && amount <= 100)) return ctx.usage('Amount must be between 1 and 100.');
      await purge(ctx, { amount, filter: (m) => filter(m, ctx), scan: 300, label });
    },
  };
}

const commands = [
  {
    name: 'purge',
    aliases: ['clear', 'prune', 'clean'],
    description: 'Bulk-delete 1-100 recent messages (optionally only from one user)',
    usage: '<amount> [user]',
    examples: ['10', '50 tester'],
    guildOnly: true,
    cooldown: 5,
    minArgs: 1,
    slash: true,
    args: [
      { name: 'amount', type: 'integer', description: 'How many messages (1-100)', required: true, min: 1, max: 100 },
      { name: 'user', type: 'user', description: 'Only delete this user\'s messages' },
    ],
    async execute(ctx) {
      const amount = amountArg(ctx.args[0], NaN);
      if (!(amount >= 1 && amount <= 100)) return ctx.usage('Amount must be between 1 and 100.');
      if (ctx.args[1]) {
        const user = await lib.getUser(ctx, ctx.args[1]);
        if (!user) return ctx.fail('User not found.');
        return purge(ctx, { amount, filter: (m) => m.author?.id === user.id, scan: 500, label: `messages from **${user.tag || user.username}**` });
      }
      await purge(ctx, { amount, scan: amount, label: 'messages' });
    },
  },
  {
    name: 'purgeuser',
    aliases: ['purgemember', 'clearuser'],
    description: 'Delete recent messages from one user',
    usage: '<user> [amount=50]',
    examples: ['tester', 'tester 20'],
    guildOnly: true,
    cooldown: 5,
    minArgs: 1,
    async execute(ctx) {
      const user = await lib.getUser(ctx, ctx.args[0]);
      if (!user) return ctx.fail('User not found.');
      const amount = amountArg(ctx.args[1]);
      if (!(amount >= 1 && amount <= 100)) return ctx.usage('Amount must be between 1 and 100.');
      await purge(ctx, { amount, filter: (m) => m.author?.id === user.id, scan: 500, label: `messages from **${user.tag || user.username}**` });
    },
  },
  simple('purgebots', ['clearbots'], 'Delete recent messages sent by bots', (m) => m.author?.bot, 'bot messages'),
  simple('purgehumans', ['clearhumans'], 'Delete recent messages sent by humans (not bots)', (m) => !m.author?.bot, 'human messages'),
  simple('purgelinks', ['clearlinks'], 'Delete recent messages containing links', (m) => LINK_RE.test(m.content || ''), 'messages with links'),
  simple('purgeinvites', ['clearinvites'], 'Delete recent messages containing Discord invites', (m) => INVITE_RE.test(m.content || ''), 'invite messages'),
  simple(
    'purgeimages',
    ['purgeattachments', 'purgefiles', 'clearimages'],
    'Delete recent messages with attachments or images',
    (m) => m.attachments?.size > 0 || (m.embeds || []).some((e) => e.image || e.thumbnail),
    'messages with files/images',
  ),
  simple('purgeembeds', ['clearembeds'], 'Delete recent messages that contain embeds', (m) => (m.embeds || []).length > 0, 'messages with embeds'),
  simple(
    'purgementions',
    ['clearmentions'],
    'Delete recent messages that mention users or roles',
    (m) => (m.mentions?.users?.size || 0) + (m.mentions?.roles?.size || 0) > 0 || m.mentions?.everyone,
    'messages with mentions',
  ),
  simple('purgestickers', ['clearstickers'], 'Delete recent messages that are stickers', (m) => (m.stickers?.size || 0) > 0, 'sticker messages'),
  simple(
    'purgeemojis',
    ['clearemojis'],
    'Delete recent messages that contain custom emojis',
    (m) => /<a?:\w+:\d+>/.test(m.content || ''),
    'messages with custom emojis',
  ),
  simple('purgecommands', ['clearcommands'], 'Delete recent messages that start with this server\'s prefix', (m, ctx) => (m.content || '').startsWith(ctx.prefix), 'command messages'),
  {
    name: 'purgecontains',
    aliases: ['purgematch', 'clearcontains'],
    description: 'Delete recent messages that contain some text (case-insensitive)',
    usage: '[amount=50] <text>',
    examples: ['free nitro', '30 buy now'],
    guildOnly: true,
    cooldown: 5,
    minArgs: 1,
    async execute(ctx) {
      let amount = 50;
      let text = ctx.rest(0);
      if (/^\d+$/.test(ctx.args[0]) && ctx.args.length > 1) {
        amount = parseInt(ctx.args[0], 10);
        text = ctx.rest(1);
      }
      if (!(amount >= 1 && amount <= 100) || !text) return ctx.usage();
      const needle = text.toLowerCase();
      await purge(ctx, { amount, filter: (m) => (m.content || '').toLowerCase().includes(needle), scan: 500, label: `messages containing "${text.slice(0, 50)}"` });
    },
  },
  {
    name: 'purgestartswith',
    aliases: ['purgeprefix'],
    description: 'Delete recent messages that start with some text',
    usage: '[amount=50] <text>',
    examples: ['?', '20 !'],
    guildOnly: true,
    cooldown: 5,
    minArgs: 1,
    async execute(ctx) {
      let amount = 50;
      let text = ctx.rest(0);
      if (/^\d+$/.test(ctx.args[0]) && ctx.args.length > 1) {
        amount = parseInt(ctx.args[0], 10);
        text = ctx.rest(1);
      }
      if (!(amount >= 1 && amount <= 100) || !text) return ctx.usage();
      const needle = text.toLowerCase();
      await purge(ctx, { amount, filter: (m) => (m.content || '').toLowerCase().startsWith(needle), scan: 500, label: `messages starting with "${text.slice(0, 30)}"` });
    },
  },
  {
    name: 'purgeafter',
    aliases: ['purgeuntil', 'clearafter'],
    description: 'Delete every message sent after a given message ID (max 100)',
    usage: '<message ID>',
    examples: ['123456789012345678'],
    guildOnly: true,
    cooldown: 5,
    minArgs: 1,
    async execute(ctx) {
      const id = String(ctx.args[0]).split('/').pop();
      if (!/^\d{15,21}$/.test(id)) return ctx.usage('Give a message ID (right-click a message → Copy Message ID).');
      await purge(ctx, { amount: 100, filter: (m) => BigInt(m.id) > BigInt(id), scan: 100, label: 'messages' });
    },
  },
  {
    name: 'purgereactions',
    aliases: ['clearreactions', 'removereactions'],
    description: 'Remove all reactions from recent messages (or one message ID)',
    usage: '[amount=25 | message ID]',
    examples: ['', '10'],
    guildOnly: true,
    cooldown: 10,
    async execute(ctx) {
      if (!(await lib.requirePerm(ctx, 'ManageMessages'))) return;
      if (!(await lib.requireBotPerm(ctx, 'ManageMessages'))) return;
      const arg = ctx.args[0];
      if (arg && /^\d{15,21}$/.test(arg)) {
        const m = await ctx.channel.messages.fetch(arg).catch(() => null);
        if (!m) return ctx.fail('Message not found in this channel.');
        await m.reactions.removeAll();
        return ctx.ok('Removed all reactions from that message.');
      }
      const amount = amountArg(arg, 25);
      if (!(amount >= 1 && amount <= 100)) return ctx.usage('Amount must be between 1 and 100.');
      await ctx.defer();
      const msgs = await ctx.channel.messages.fetch({ limit: amount });
      let n = 0;
      for (const m of msgs.values()) {
        if (m.reactions?.cache?.size) {
          await m.reactions.removeAll().catch(() => {});
          n++;
        }
      }
      await ctx.ok(`Cleared reactions from **${n}** message(s).`);
    },
  },
];

module.exports = commands;
