'use strict';
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const { paginate } = require('../../core/ui');
const { chunk, truncate, discordTimestamp } = require('../../core/utils');
const { NAME_RE } = require('./_lib');

/**
 * Guild section "tags": { items: { [name]: { content, authorId, uses, createdAt, updatedAt } } }
 * Anyone can create tags; only the author or members with Manage Messages can edit/delete them.
 */
const DEFAULTS = { items: {} };
const MAX_TAGS = 500;
const MAX_LENGTH = 2000;
const section = (ctx) => db.section(ctx.guild.id, 'tags', DEFAULTS);
const canEdit = (ctx, tag) => tag.authorId === ctx.author.id || ctx.member?.permissions?.has(PermissionFlagsBits.ManageMessages);

// Each action is shared by the `tag <sub>` dispatcher and its standalone command.
const actions = {
  async show(ctx, name) {
    const tag = section(ctx).items[String(name || '').toLowerCase()];
    if (!tag) {
      const similar = Object.keys(section(ctx).items).filter((n) => n.includes(String(name).toLowerCase())).slice(0, 5);
      return ctx.fail(`No tag called \`${name}\`.${similar.length ? ` Did you mean: ${similar.map((s) => `\`${s}\``).join(', ')}?` : ''}`);
    }
    tag.uses += 1;
    db.save();
    await ctx.reply({ content: tag.content, allowedMentions: { parse: [] } });
  },
  async create(ctx, name, content) {
    name = String(name || '').toLowerCase();
    if (!NAME_RE.test(name)) return ctx.fail('Tag names can use a-z, 0-9, - and _ (max 32 characters).');
    if (['create', 'add', 'edit', 'delete', 'remove', 'list', 'info', 'raw', 'search'].includes(name)) return ctx.fail('That name is reserved.');
    if (!content) return ctx.usage('Give the tag some content.');
    if (content.length > MAX_LENGTH) return ctx.fail(`Tags can be at most ${MAX_LENGTH} characters.`);
    const cfg = section(ctx);
    if (cfg.items[name]) return ctx.fail(`Tag \`${name}\` already exists.`);
    if (Object.keys(cfg.items).length >= MAX_TAGS) return ctx.fail(`This server reached the limit of ${MAX_TAGS} tags.`);
    cfg.items[name] = { content, authorId: ctx.author.id, uses: 0, createdAt: Date.now(), updatedAt: Date.now() };
    db.save();
    await ctx.ok(`Tag \`${name}\` created. Show it with \`${ctx.prefix}tag ${name}\`.`);
  },
  async edit(ctx, name, content) {
    const tag = section(ctx).items[String(name || '').toLowerCase()];
    if (!tag) return ctx.fail('Tag not found.');
    if (!canEdit(ctx, tag)) return ctx.fail('Only the tag author or moderators can edit it.');
    if (!content) return ctx.usage('Give the new content.');
    if (content.length > MAX_LENGTH) return ctx.fail(`Tags can be at most ${MAX_LENGTH} characters.`);
    tag.content = content;
    tag.updatedAt = Date.now();
    db.save();
    await ctx.ok(`Tag \`${name.toLowerCase()}\` updated.`);
  },
  async delete(ctx, name) {
    const cfg = section(ctx);
    const key = String(name || '').toLowerCase();
    const tag = cfg.items[key];
    if (!tag) return ctx.fail('Tag not found.');
    if (!canEdit(ctx, tag)) return ctx.fail('Only the tag author or moderators can delete it.');
    delete cfg.items[key];
    db.save();
    await ctx.ok(`Tag \`${key}\` deleted.`);
  },
  async list(ctx, filterUser) {
    let entries = Object.entries(section(ctx).items);
    if (filterUser) entries = entries.filter(([, t]) => t.authorId === filterUser.id);
    entries.sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) return ctx.info(`No tags yet. Create one with \`${ctx.prefix}tag create <name> <content>\`.`);
    const pages = chunk(entries.map(([n, t]) => `\`${n}\` *(${t.uses})*`), 40).map((c, i, all) =>
      ctx.embed({ title: `🏷️ Tags (${entries.length})`, description: c.join(' • '), footer: `Page ${i + 1}/${all.length}` }),
    );
    await paginate(ctx, pages);
  },
  async info(ctx, name) {
    const key = String(name || '').toLowerCase();
    const tag = section(ctx).items[key];
    if (!tag) return ctx.fail('Tag not found.');
    await ctx.reply({
      embeds: [
        ctx.embed({
          title: `🏷️ ${key}`,
          fields: [
            { name: 'Author', value: `<@${tag.authorId}>`, inline: true },
            { name: 'Uses', value: String(tag.uses), inline: true },
            { name: 'Length', value: `${tag.content.length} chars`, inline: true },
            { name: 'Created', value: discordTimestamp(tag.createdAt), inline: true },
            { name: 'Updated', value: discordTimestamp(tag.updatedAt), inline: true },
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
  async raw(ctx, name) {
    const tag = section(ctx).items[String(name || '').toLowerCase()];
    if (!tag) return ctx.fail('Tag not found.');
    await ctx.reply({ content: `\`\`\`\n${truncate(tag.content.replace(/```/g, '`​``'), 1980)}\n\`\`\``, allowedMentions: { parse: [] } });
  },
  async search(ctx, query) {
    const q = String(query || '').toLowerCase();
    if (!q) return ctx.usage();
    const hits = Object.keys(section(ctx).items).filter((n) => n.includes(q)).slice(0, 50);
    await ctx.info(hits.length ? hits.map((n) => `\`${n}\``).join(' • ') : 'No tags match.', `🔎 Tags matching "${truncate(q, 50)}"`);
  },
};

const SUB = { create: 'create', add: 'create', edit: 'edit', delete: 'delete', remove: 'delete', del: 'delete', list: 'list', info: 'info', raw: 'raw', search: 'search' };

function standalone(name, aliases, description, usage, examples, minArgs, run) {
  return { name, aliases, description, usage, examples, minArgs, guildOnly: true, execute: run };
}

module.exports = [
  {
    name: 'tag',
    aliases: ['t'],
    description: 'Show a tag, or: tag create/edit/delete/list/info/raw/search',
    usage: '<name> | create <name> <content> | edit <name> <content> | delete <name> | list | info <name>',
    examples: ['create rules Be nice and have fun!', 'rules', 'info rules', 'list'],
    guildOnly: true,
    minArgs: 1,
    slash: true,
    args: [
      { name: 'name', type: 'string', description: 'Tag name — or create / edit / delete / list / info / raw / search', required: true },
      { name: 'text', type: 'string', description: 'For create/edit: "<name> <content>"; for others: the tag name', required: false, rest: true },
    ],
    async execute(ctx) {
      const first = ctx.args[0].toLowerCase();
      const sub = SUB[first];
      if (!sub) return actions.show(ctx, first);
      if (sub === 'list') return actions.list(ctx, ctx.args[1] ? await ctx.resolveUser(ctx.args[1]) : null);
      if (sub === 'create' || sub === 'edit') return actions[sub](ctx, ctx.args[1], ctx.rest(2));
      if (sub === 'search') return actions.search(ctx, ctx.rest(1));
      if (!ctx.args[1]) return ctx.usage();
      return actions[sub](ctx, ctx.args[1]);
    },
  },
  standalone('tagcreate', ['addtag', 'createtag'], 'Create a tag anyone can show with the tag command', '<name> <content>', ['faq Read #faq first!'], 2, (ctx) =>
    actions.create(ctx, ctx.args[0], ctx.rest(1)),
  ),
  standalone('tagedit', ['edittag'], 'Edit one of your tags', '<name> <new content>', ['faq Check #faq please'], 2, (ctx) => actions.edit(ctx, ctx.args[0], ctx.rest(1))),
  standalone('tagdelete', ['deltag', 'removetag'], 'Delete one of your tags', '<name>', ['faq'], 1, (ctx) => actions.delete(ctx, ctx.args[0])),
  standalone('tags', ['taglist'], 'List all tags (optionally only one member\'s)', '[@user]', ['', '@tester'], 0, async (ctx) =>
    actions.list(ctx, ctx.args[0] ? await ctx.resolveUser(ctx.args[0]) : null),
  ),
  standalone('taginfo', [], 'Who made a tag, how often it was used', '<name>', ['faq'], 1, (ctx) => actions.info(ctx, ctx.args[0])),
  standalone('tagraw', [], 'Show a tag\'s content as raw markdown', '<name>', ['faq'], 1, (ctx) => actions.raw(ctx, ctx.args[0])),
  standalone('tagsearch', ['searchtags'], 'Find tags whose name contains a word', '<word>', ['fa'], 1, (ctx) => actions.search(ctx, ctx.rest(0))),
];
