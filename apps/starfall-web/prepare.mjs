// Copies only the game's own static assets into the standalone app's public folder.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../..')
const pub = path.join(here, 'public')

const copies = [
  ['public/games/starfall', 'games/starfall'],
  ['public/fonts', 'fonts'],
]
for (const [from, to] of copies) {
  const dst = path.join(pub, to)
  fs.rmSync(dst, { recursive: true, force: true })
  fs.cpSync(path.join(repo, from), dst, { recursive: true })
}
fs.copyFileSync(path.join(here, 'favicon.svg'), path.join(pub, 'favicon.svg'))
console.log('starfall-web: assets prepared')
