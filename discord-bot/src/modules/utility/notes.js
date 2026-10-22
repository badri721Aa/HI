'use strict';
/** Personal notes and to-do lists. Private per user (global across servers). */
const db = require('../../core/db');
const { discordTimestamp, truncate } = require('../../core/utils');

const MAX_ITEMS = 50;

const list = (col, userId) => db.get(col, userId, []);
const save = (col, userId, items) => (items.length ? db.set(col, userId, items) : db.delete(col, userId));

/** "3" or "1,3,5" or "2-4" -> sorted unique zero-based indexes within bounds */
function indexes(arg, length) {
  const out = new Set();
  for (const part of String(arg || '').split(',')) {
    const r = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!r) continue;
    const a = +r[1];
    const b = r[2] ? +r[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - Math.min(a, b) < 100; i++) if (i >= 1 && i <= length) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

function renderTodos(ctx, items) {
  const done = items.filter((t) => t.done).length;
  return ctx.embed({
    title: `📝 ${ctx.author.username}'s to-do list (${done}/${items.length} done)`,
    description: items.map((t, i) => `\`${String(i + 1).padStart(2)}\` ${t.done ? '✅ ~~' : '⬜ '}${truncate(t.text, 150)}${t.done ? '~~' : ''}`).join('\n'),
    footer: `${ctx.prefix}todo add <task> • done <n> • undo <n> • remove <n> • clear [done]`,
  });
}

module.exports = [
  {
    name: 'note',
    aliases: ['addnote', 'jot'],
    description: 'Save a private note',
    usage: '<text>',
    examples: ['buy milk and eggs'],
    minArgs: 1,
    async execute(ctx) {
      const items = list('notes', ctx.author.id);
      if (items.length >= MAX_ITEMS) return ctx.fail(`You have ${MAX_ITEMS} notes already — delete some first.`);
      items.push({ text: truncate(ctx.rest(0), 1000), at: Date.now() });
      save('notes', ctx.author.id, items);
      await ctx.reply({ embeds: [ctx.embed({ description: `🗒️ Saved note **#${items.length}**.` })], ephemeral: true });
    },
  },
  {
    name: 'notes',
    aliases: ['mynotes', 'listnotes'],
    description: 'List your private notes',
    async execute(ctx) {
      const items = list('notes', ctx.author.id);
      if (!items.length) return ctx.reply({ embeds: [ctx.embed({ description: `You have no notes. Add one with \`${ctx.prefix}note <text>\`.` })], ephemeral: true });
      const body = items.map((n, i) => `\`${i + 1}.\` ${truncate(n.text, 200)} — ${discordTimestamp(n.at, 'R')}`).join('\n');
      await ctx.reply({ embeds: [ctx.embed({ title: `🗒️ Your notes (${items.length})`, description: truncate(body, 4000) })], ephemeral: true });
    },
  },
  {
    name: 'delnote',
    aliases: ['deletenote', 'rmnote'],
    description: 'Delete notes by number (e.g. 2 or 1,3 or 2-5)',
    usage: '<number(s)>',
    examples: ['1', '1,3'],
    minArgs: 1,
    async execute(ctx) {
      const items = list('notes', ctx.author.id);
      const idx = indexes(ctx.args[0], items.length);
      if (!idx.length) return ctx.fail(`No such note. See \`${ctx.prefix}notes\`.`);
      save('notes', ctx.author.id, items.filter((_, i) => !idx.includes(i)));
      await ctx.ok(`Deleted ${idx.length} note(s).`);
    },
  },
  {
    name: 'clearnotes',
    aliases: ['deletenotes'],
    description: 'Delete all your notes',
    async execute(ctx) {
      const n = list('notes', ctx.author.id).length;
      save('notes', ctx.author.id, []);
      await ctx.ok(n ? `Deleted all ${n} notes.` : 'You had no notes.');
    },
  },
  {
    name: 'todo',
    aliases: ['task'],
    description: 'Your to-do list: todo add/done/undo/remove/clear',
    usage: '[add <task> | done <n> | undo <n> | remove <n> | clear [done]]',
    examples: ['', 'add finish homework', 'done 1', 'undo 1', 'remove 1', 'clear done'],
    async execute(ctx) {
      let items = list('todos', ctx.author.id);
      const sub = (ctx.args[0] || '').toLowerCase();
      const known = ['add', 'done', 'check', 'undo', 'uncheck', 'remove', 'rm', 'delete', 'clear', 'list'];
      if (!sub || sub === 'list') {
        if (!items.length) return ctx.info(`Your to-do list is empty. Add with \`${ctx.prefix}todo add <task>\`.`);
        return ctx.reply({ embeds: [renderTodos(ctx, items)] });
      }
      const text = known.includes(sub) ? ctx.rest(1) : ctx.rest(0);
      if (sub === 'add' || !known.includes(sub)) {
        if (!text) return ctx.usage();
        if (items.length >= MAX_ITEMS) return ctx.fail(`Your list is full (${MAX_ITEMS}). Clear finished tasks with \`${ctx.prefix}todo clear done\`.`);
        items.push({ text: truncate(text, 300), done: false, at: Date.now() });
        save('todos', ctx.author.id, items);
        return ctx.ok(`Added task **#${items.length}**: ${truncate(text, 100)}`);
      }
      if (sub === 'clear') {
        const onlyDone = (ctx.args[1] || '').toLowerCase() === 'done';
        const before = items.length;
        items = onlyDone ? items.filter((t) => !t.done) : [];
        save('todos', ctx.author.id, items);
        return ctx.ok(`Removed ${before - items.length} task(s).`);
      }
      const idx = indexes(ctx.args[1], items.length);
      if (!idx.length) return ctx.fail('Give task number(s), e.g. `1` or `1,3`.');
      if (['done', 'check'].includes(sub)) idx.forEach((i) => (items[i].done = true));
      else if (['undo', 'uncheck'].includes(sub)) idx.forEach((i) => (items[i].done = false));
      else items = items.filter((_, i) => !idx.includes(i));
      save('todos', ctx.author.id, items);
      if (!items.length) return ctx.ok('Your to-do list is now empty. 🎉');
      await ctx.reply({ embeds: [renderTodos(ctx, items)] });
    },
  },
  {
    name: 'todos',
    aliases: ['todolist', 'tasks'],
    description: 'Show your to-do list',
    async execute(ctx) {
      const items = list('todos', ctx.author.id);
      if (!items.length) return ctx.info(`Your to-do list is empty. Add with \`${ctx.prefix}todo add <task>\`.`);
      await ctx.reply({ embeds: [renderTodos(ctx, items)] });
    },
  },
];
