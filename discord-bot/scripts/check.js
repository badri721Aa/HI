'use strict';
/**
 * Static validation: loads every module, reports duplicates / bad definitions,
 * builds all slash command payloads, and prints per-category counts.
 *   npm run check            summary
 *   npm run check -- --list  also list every command name
 */
process.env.DATA_DIR = process.env.DATA_DIR || require('node:path').join(require('node:os').tmpdir(), 'megabot-check');
const path = require('node:path');
const { Registry } = require('../src/core/registry');
const { buildAll, buildCommand } = require('../src/core/slash');
const { meta } = require('../src/core/categories');

const registry = new Registry().loadDir(path.join(__dirname, '..', 'src', 'modules'));
const problems = [...registry.problems];

for (const cmd of registry.commands.values()) {
  if (cmd.slash) {
    try {
      buildCommand(cmd);
    } catch (err) {
      problems.push(`${cmd.source}: slash build failed for "${cmd.name}": ${err.message}`);
    }
  }
  if (typeof cmd.minArgs !== 'number') problems.push(`${cmd.source}: "${cmd.name}" minArgs must be a number`);
}

let slashCount = 0;
try {
  slashCount = buildAll(registry, { modules: 'all' }).length;
} catch (err) {
  problems.push(`Slash payload build failed: ${err.message}`);
}

const rows = [...registry.categories.entries()].sort((a, b) => b[1].length - a[1].length);
console.log('\nCategory                     Commands');
console.log('---------------------------- --------');
for (const [cat, cmds] of rows) console.log(`${(meta(cat).emoji + ' ' + cat).padEnd(28)} ${String(cmds.length).padStart(8)}`);
console.log('---------------------------- --------');
console.log(`${'TOTAL'.padEnd(28)} ${String(registry.size).padStart(8)}`);
console.log(`Aliases: ${registry.aliases.size} • Slash commands registered: ${slashCount} (incl. /cmd) • Component handlers: ${registry.components.size} • Tasks: ${registry.tasks.length}`);
console.log(`Event listeners: ${[...registry.events.entries()].map(([e, l]) => `${e}×${l.length}`).join(', ') || 'none'}`);

if (process.argv.includes('--list')) {
  for (const [cat, cmds] of rows) console.log(`\n[${cat}] ${cmds.map((c) => c.name).join(', ')}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log('\nAll checks passed.');
process.exit(0);
