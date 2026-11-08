'use client'
/** Controls reference for keyboard & mouse, gamepad and touch. */
import { Fragment, useState, type ReactNode } from 'react'
import { useGameUi } from './context'
import { KeyCap, PanelHeader, Tabs } from './controls'
import { BackHint } from './Panel'

type Scheme = 'kbm' | 'pad' | 'touch'

const SCHEMES: Array<{ value: Scheme; label: string }> = [
  { value: 'kbm', label: 'Keyboard & mouse' },
  { value: 'pad', label: 'Gamepad' },
  { value: 'touch', label: 'Touch' },
]

const Or = () => <span className="px-1 text-[11px] text-[#F3EEE6]/30">or</span>
const Note = ({ children }: { children: ReactNode }) => <span className="text-[12px] text-[#F3EEE6]/45">{children}</span>
/** Round face-button cap for gamepads. */
const Pad = ({ children, wide }: { children: ReactNode; wide?: boolean }) => (
  <KeyCap shape={wide ? 'h-[22px] rounded-full px-2.5' : 'h-6 w-6 rounded-full'}>{children}</KeyCap>
)

const ROWS: Record<Scheme, Array<{ action: string; keys: ReactNode }>> = {
  kbm: [
    { action: 'Move', keys: <><KeyCap>W</KeyCap><KeyCap>A</KeyCap><KeyCap>S</KeyCap><KeyCap>D</KeyCap></> },
    { action: 'Look around', keys: <Note>Mouse</Note> },
    { action: 'Jump · double jump', keys: <><KeyCap>Space</KeyCap><Note>×2</Note></> },
    { action: 'Sprint', keys: <><KeyCap>Shift</KeyCap><Note>hold</Note></> },
    { action: 'Dash', keys: <><KeyCap>Q</KeyCap><Or /><Note>Right click</Note></> },
    { action: 'Spin attack', keys: <><KeyCap>F</KeyCap><Or /><Note>Left click</Note></> },
    { action: 'Interact · talk', keys: <KeyCap>E</KeyCap> },
    { action: 'Camera zoom', keys: <Note>Mouse wheel</Note> },
    { action: 'Map', keys: <KeyCap>M</KeyCap> },
    { action: 'Pause', keys: <><KeyCap>Esc</KeyCap><Or /><KeyCap>P</KeyCap></> },
    { action: 'Skip cutscene', keys: <><KeyCap>Space</KeyCap><Note>hold</Note></> },
  ],
  pad: [
    { action: 'Move', keys: <Pad wide>L stick</Pad> },
    { action: 'Look around', keys: <Pad wide>R stick</Pad> },
    { action: 'Jump · double jump', keys: <><Pad>A</Pad><Note>×2</Note></> },
    { action: 'Sprint', keys: <><Pad wide>RB</Pad><Or /><Pad wide>RT</Pad></> },
    { action: 'Dash', keys: <Pad>B</Pad> },
    { action: 'Spin attack', keys: <Pad>X</Pad> },
    { action: 'Interact · talk', keys: <Pad>Y</Pad> },
    { action: 'Camera zoom', keys: <Pad wide>D-pad ↑ ↓</Pad> },
    { action: 'Map', keys: <Pad wide>View</Pad> },
    { action: 'Pause', keys: <Pad wide>Menu</Pad> },
    { action: 'Skip cutscene', keys: <><Pad>A</Pad><Note>hold</Note></> },
  ],
  touch: [
    { action: 'Move', keys: <Note>Drag on the left side</Note> },
    { action: 'Sprint', keys: <Note>Push the stick to its edge</Note> },
    { action: 'Look around', keys: <Note>Drag on the right side</Note> },
    { action: 'Jump · double jump', keys: <Note>Jump button, tap twice</Note> },
    { action: 'Dash · spin · interact', keys: <Note>Buttons beside Jump</Note> },
    { action: 'Pause', keys: <Note>Pause button, top left</Note> },
    { action: 'Skip cutscene', keys: <Note>Skip button</Note> },
  ],
}

export function ControlsPanel({ onBack }: { onBack: () => void }) {
  const { game, touch } = useGameUi()
  const [scheme, setScheme] = useState<Scheme>(() => (touch ? 'touch' : game.ctx.input?.device === 'pad' ? 'pad' : 'kbm'))
  return (
    <div>
      <PanelHeader eyebrow="Reference" title="Controls" aside={<BackHint onBack={onBack} />} />
      <Tabs label="Control scheme" value={scheme} options={SCHEMES} onChange={setScheme} />
      <dl className="grid min-h-[300px] grid-cols-[1fr_auto] content-start">
        {ROWS[scheme].map(({ action, keys }) => (
          <Fragment key={action}>
            <dt className="flex min-h-[40px] items-center border-b border-[#F3EEE6]/[0.07] text-[14px] text-[#F3EEE6]/80">{action}</dt>
            <dd className="flex min-h-[40px] items-center justify-end gap-1.5 border-b border-[#F3EEE6]/[0.07] pl-6">{keys}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
