// Collects every command module into one registry.
import * as admin from './admin.js'
import * as convert from './convert.js'
import * as economy from './economy.js'
import * as fun from './fun.js'
import * as games from './games.js'
import * as general from './general.js'
import * as group from './group.js'
import * as mathCmds from './math.js'
import * as owner from './owner.js'
import * as text from './text.js'
import * as utility from './utility.js'
import * as web from './web.js'

const modules = [
  ['general', '📌', 'General', general],
  ['group', '👥', 'Group & members', group],
  ['admin', '🛡️', 'Admin tools', admin],
  ['fun', '🎉', 'Fun', fun],
  ['games', '🎮', 'Games', games],
  ['economy', '💰', 'Economy', economy],
  ['utility', '🧰', 'Utilities & media', utility],
  ['text', '🔤', 'Text tools', text],
  ['math', '🧮', 'Math', mathCmds],
  ['convert', '📏', 'Converters', convert],
  ['web', '🌐', 'Web lookups', web],
  ['owner', '👑', 'Owner', owner],
]

export const registry = { categories: [], list: [], byName: {}, hooks: [] }

for (const [name, emoji, title, mod] of modules) {
  registry.categories.push({ name, emoji, title, commands: mod.commands })
  if (mod.onMessage) registry.hooks.push(mod.onMessage)
  for (const cmd of mod.commands) {
    cmd.category = name
    registry.list.push(cmd)
    for (const key of [cmd.name, ...(cmd.aliases || [])]) {
      if (registry.byName[key]) throw new Error(`Duplicate command name/alias "${key}" (${cmd.name} vs ${registry.byName[key].name})`)
      registry.byName[key] = cmd
    }
  }
}
