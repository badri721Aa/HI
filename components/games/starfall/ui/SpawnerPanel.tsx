'use client'
/**
 * Creative: the enemy spawner. Pick any mob or boss and it appears in front of you when the game
 * resumes (a boss on its own summoning circle). Everything spawned here can be cleared at once.
 */
import type { EnemyKind } from '../engine/events'
import { BOSS_KINDS, BOSSES, MOB_KINDS, MOBS } from '../engine/gameplay/enemies/defs'
import { BOSS_NAMES } from '../engine/worlds/defs'
import { playUi, useGameUi } from './context'
import { Button, PanelHeader } from './controls'
import { hoverFocus, isQuietFocus } from './nav'
import { BackHint } from './Panel'
import { cx, LABEL } from './theme'
import styles from './ui.module.css'

interface Entry {
  kind: EnemyKind
  name: string
  role: string
  color: string
}

const MOB_ENTRIES: Entry[] = MOB_KINDS.map(k => ({ kind: k, name: MOBS[k].name, role: MOBS[k].role, color: MOBS[k].color }))
const BOSS_ENTRIES: Entry[] = BOSS_KINDS.map(k => ({ kind: k, name: BOSS_NAMES[k], role: BOSSES[k].role, color: BOSSES[k].color }))

export function SpawnerPanel({ onBack }: { onBack: () => void }) {
  const { game } = useGameUi()

  const spawn = (kind: EnemyKind) => {
    // Back into the game first (this click is the gesture pointer lock needs), then call it up.
    game.resume()
    if (!game.spawnEnemy(kind)) playUi(game, 'ui-error')
  }

  return (
    <div>
      <PanelHeader eyebrow="Creative" title="Enemy spawner" aside={<BackHint onBack={onBack} />} />
      <p className="max-w-[520px] text-[14px] leading-relaxed text-[#F3EEE6]/65">
        Choose an enemy and it appears in front of you. A boss rises on its own summoning circle — one boss at a time. You can’t be hurt in Creative, so watch the patterns freely.
      </p>

      <Section title="Mobs" entries={MOB_ENTRIES} onPick={spawn} first />
      <Section title="Bosses" entries={BOSS_ENTRIES} onPick={spawn} />

      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[#F3EEE6]/10 pt-5">
        <Button variant="danger" size="sm" onClick={() => game.clearSpawnedEnemies()}>
          Clear spawned enemies
        </Button>
        <span className="text-[12px] text-[#F3EEE6]/45">Removes everything called up here.</span>
      </div>
    </div>
  )
}

function Section({ title, entries, onPick, first }: { title: string; entries: Entry[]; onPick: (k: EnemyKind) => void; first?: boolean }) {
  const { game } = useGameUi()
  return (
    <section className={first ? 'mt-6' : 'mt-7'}>
      <h3 className={cx(LABEL, 'mb-3 text-[10px] text-[#F3EEE6]/45')}>{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map((e, i) => (
          <button
            key={e.kind}
            type="button"
            data-nav
            data-autofocus={(first && i === 0) || undefined}
            onClick={() => onPick(e.kind)}
            {...hoverFocus}
            onFocus={() => isQuietFocus() || playUi(game, 'ui-hover')}
            className={cx(styles.card, 'group flex min-h-[68px] items-start gap-3 px-4 py-3 text-left')}
          >
            <span
              aria-hidden
              className="mt-[3px] h-3 w-3 shrink-0 rotate-45 rounded-[2px] ring-1 ring-[#0B0F14]/40"
              style={{ background: e.color, boxShadow: `0 0 12px ${e.color}88` }}
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium leading-tight text-[#F3EEE6]">{e.name}</span>
              <span className="mt-1 block text-[12px] leading-snug text-[#F3EEE6]/50">{e.role}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
