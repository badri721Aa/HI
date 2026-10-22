'use strict';
/** Refreshes the command counts in README.md from the live registry: npm run readme */
process.env.DATA_DIR = process.env.DATA_DIR || require('node:path').join(require('node:os').tmpdir(), 'megabot-readme');
const fs = require('node:fs');
const path = require('node:path');
const { Registry } = require('../src/core/registry');
const { CATEGORIES, meta } = require('../src/core/categories');

const registry = new Registry().loadDir(path.join(__dirname, '..', 'src', 'modules'));
const order = Object.keys(CATEGORIES);
const rows = [...registry.categories.entries()].sort((a, b) => (order.indexOf(a[0]) + 1 || 999) - (order.indexOf(b[0]) + 1 || 999));
const total = registry.size.toLocaleString('en-US');

const table = [
  '| Category | Commands | Examples |',
  '|---|---:|---|',
  ...rows.map(([cat, cmds]) => {
    const m = meta(cat);
    const examples = cmds.slice(0, 6).map((c) => `\`${c.name}\``).join(', ');
    return `| ${m.emoji} ${m.label} | ${cmds.length} | ${examples}${cmds.length > 6 ? ', …' : ''} |`;
  }),
  `| **Total** | **${total}** | plus ${registry.aliases.size} aliases and unlimited custom commands |`,
].join('\n');

const file = path.join(__dirname, '..', 'README.md');
const before = fs.readFileSync(file, 'utf8');
const after = before
  .replace(/<!--total-->[^<]*<!--\/total-->/g, `<!--total-->${total}<!--/total-->`)
  .replace(/<!--table-->[\s\S]*?<!--\/table-->/, `<!--table-->\n${table}\n<!--/table-->`);
fs.writeFileSync(file, after);
console.log(`README updated: ${total} commands in ${rows.length} categories.`);
