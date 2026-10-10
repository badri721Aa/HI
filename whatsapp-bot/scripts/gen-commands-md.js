// Regenerates COMMANDS.md from the command registry: npm run docs
import fs from 'node:fs'
process.env.DATA_FILE = '/dev/null'
const { registry } = await import('../src/commands/index.js')

const who = (c) => (c.owner ? '👑 owner' : c.admin ? '🛡️ admins' : 'everyone')
let md = `# Commands (${registry.list.length})\n\nDefault prefix is \`!\`. Type \`!help <command>\` in WhatsApp for details.\n`
for (const cat of registry.categories) {
  md += `\n## ${cat.emoji} ${cat.title} (${cat.commands.length})\n\n| Command | Who | What it does |\n|---|---|---|\n`
  for (const c of cat.commands) {
    const aliases = c.aliases?.length ? `<br><sub>also: ${c.aliases.map((a) => '!' + a).join(', ')}</sub>` : ''
    md += `| \`!${c.name}${c.usage ? ' ' + c.usage.replace(/\|/g, '\\|') : ''}\`${aliases} | ${who(c)} | ${c.desc.replace(/\|/g, '\\|')}${c.botAdmin ? ' _(bot must be admin)_' : ''} |\n`
  }
}
md += `
## ⚙️ Automatic features

- **Welcome & goodbye messages** — customisable with \`!setwelcome\` / \`!setgoodbye\`
- **XP & levels** — members earn XP by chatting; level-up announcements
- **Message counting** — powers \`!topchatters\` and \`!inactive\`
- **AFK replies** — tells people when someone they mention is away
- **Anti-link** — deletes links from non-admins and warns them
- **Bad-word filter** — deletes filtered words and warns
- **Anti-spam** — warns people who flood the chat
- **Auto-remove** — members are removed when they hit the warn limit
- **Timed mute** — group unlocks itself when \`!mute\` ends
- **Reminders** — delivered on time, even after a restart
- **Chat games** — answer by just typing, no prefix needed
- **Per-group settings** and a **bot ban list**
- **Self / public mode** — run it on your own number
- **Auto-reconnect** and saved login
`
fs.writeFileSync(new URL('../COMMANDS.md', import.meta.url), md)
console.log(`COMMANDS.md written (${registry.list.length} commands)`)
