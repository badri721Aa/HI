'use client'
/**
 * Settings, shared by the title and pause menus. Toggles and presets apply at
 * once; sliders preview locally and commit when released (or shortly after the
 * last arrow-key step), because each commit re-applies renderer settings.
 */
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type QualityLevel, type Settings } from '../engine/settings'
import { useGameUi, useUi } from './context'
import { Button, PanelHeader, Segmented, SettingRow, Slider, Tabs, Toggle } from './controls'
import { DevicePicker } from './DevicePicker'
import { focusFirst } from './nav'
import { BackHint } from './Panel'

type Tab = 'graphics' | 'audio' | 'controls' | 'gameplay'
type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings]

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'graphics', label: 'Graphics' },
  { value: 'audio', label: 'Audio' },
  { value: 'controls', label: 'Controls' },
  { value: 'gameplay', label: 'Gameplay' },
]

const QUALITY: Array<{ value: QualityLevel; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Med' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
]

const QUALITY_HINT: Record<QualityLevel, string> = {
  low: 'No shadows, light foliage. For older laptops and phones.',
  medium: 'Soft shadows and bloom with lighter grass.',
  high: 'Full foliage, crisp shadows and anti-aliasing.',
  ultra: 'Dense grass, sharpest shadows, longest view distance.',
}

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Batches slider commits so a drag or a run of arrow-key steps re-applies settings once. */
class CommitQueue {
  private patch: Partial<Settings> = {}
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private apply: (patch: Partial<Settings>) => void) {}

  push(patch: Partial<Settings>, delayMs = 180): void {
    this.patch = { ...this.patch, ...patch }
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), delayMs)
  }

  flush(): void {
    const patch = this.patch
    this.clear()
    if (Object.keys(patch).length) this.apply(patch)
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.patch = {}
  }
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const { store } = useGameUi()
  const settings = useUi(s => s.settings)
  const [tab, setTab] = useState<Tab>('graphics')
  // 'closed' again after a visit: the button that opened the picker takes the focus back.
  const [devicePicker, setDevicePicker] = useState<'no' | 'open' | 'closed'>('no')
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (devicePicker === 'closed') focusFirst(rootRef.current, '[data-autofocus]')
  }, [devicePicker])
  const [draft, setDraft] = useState<Partial<Settings>>({})
  const [queue] = useState(
    () =>
      new CommitQueue(patch => {
        store.updateSettings(patch)
        setDraft(d => {
          const next = { ...d }
          for (const k of Object.keys(patch) as Array<keyof Settings>) if (next[k] === patch[k]) delete next[k]
          return next
        })
      }),
  )
  // Leaving the panel mid-adjustment still saves the last value.
  useEffect(() => () => queue.flush(), [queue])

  const slider = (key: NumKey) => ({
    value: (draft[key] as number | undefined) ?? settings[key],
    onChange: (v: number) => setDraft(d => ({ ...d, [key]: v })),
    onCommit: (v: number) => queue.push({ [key]: v }),
  })
  const apply = (patch: Partial<Settings>) => store.updateSettings(patch)

  if (devicePicker === 'open') return <DevicePicker onDone={() => setDevicePicker('closed')} onCancel={() => setDevicePicker('closed')} />

  return (
    <div ref={rootRef}>
      <PanelHeader eyebrow="Options" title="Settings" aside={<BackHint onBack={onBack} />} />
      <Tabs label="Settings section" value={tab} options={TABS} onChange={setTab} />

      <div className="min-h-[280px]" role="tabpanel">
        {tab === 'graphics' && (
          <>
            <SettingRow label="Quality" hint={QUALITY_HINT[settings.quality]}>
              <Segmented label="Quality" value={settings.quality} options={QUALITY} onChange={quality => apply({ quality })} />
            </SettingRow>
            <SettingRow label="Auto resolution" hint="Lowers resolution briefly when the frame rate dips.">
              <Toggle label="Auto resolution" checked={settings.autoQuality} onChange={autoQuality => apply({ autoQuality })} />
            </SettingRow>
            <SettingRow label="Render scale">
              <Slider label="Render scale" min={0.5} max={1} step={0.05} format={pct} {...slider('renderScale')} />
            </SettingRow>
            <SettingRow label="Field of view">
              <Slider label="Field of view" min={50} max={90} step={1} format={v => `${Math.round(v)}°`} {...slider('fov')} />
            </SettingRow>
            <SettingRow label="Show FPS">
              <Toggle label="Show FPS" checked={settings.showFps} onChange={showFps => apply({ showFps })} />
            </SettingRow>
            <SettingRow label="Device" hint="Pick your kind of computer again to reset the graphics preset.">
              <Button size="sm" autofocus={devicePicker === 'closed'} onClick={() => setDevicePicker('open')}>
                Run device setup again
              </Button>
            </SettingRow>
          </>
        )}
        {tab === 'audio' && (
          <>
            <SettingRow label="Master volume">
              <Slider label="Master volume" min={0} max={1} step={0.05} format={pct} {...slider('masterVolume')} />
            </SettingRow>
            <SettingRow label="Music">
              <Slider label="Music volume" min={0} max={1} step={0.05} format={pct} {...slider('musicVolume')} />
            </SettingRow>
            <SettingRow label="Sound effects">
              <Slider label="Sound effects volume" min={0} max={1} step={0.05} format={pct} {...slider('sfxVolume')} />
            </SettingRow>
            <SettingRow label="Ambience" hint="Waves, wind, birds and insects.">
              <Slider label="Ambience volume" min={0} max={1} step={0.05} format={pct} {...slider('ambienceVolume')} />
            </SettingRow>
          </>
        )}
        {tab === 'controls' && (
          <>
            <SettingRow label="Look sensitivity" hint="Mouse, touch drag and right stick.">
              <Slider label="Look sensitivity" min={0.2} max={3} step={0.05} format={v => `${v.toFixed(2)}×`} {...slider('mouseSensitivity')} />
            </SettingRow>
            <SettingRow label="Invert vertical look">
              <Toggle label="Invert vertical look" checked={settings.invertY} onChange={invertY => apply({ invertY })} />
            </SettingRow>
          </>
        )}
        {tab === 'gameplay' && (
          <>
            <SettingRow label="Camera shake" hint="Landings, stomps and the Beacon igniting.">
              <Toggle label="Camera shake" checked={settings.cameraShake} onChange={cameraShake => apply({ cameraShake })} />
            </SettingRow>
            <SettingRow label="Subtitles" hint="Narration during cutscenes.">
              <Toggle label="Subtitles" checked={settings.subtitles} onChange={subtitles => apply({ subtitles })} />
            </SettingRow>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#F3EEE6]/10 pt-4">
        <span className="text-[12px] text-[#F3EEE6]/35">Changes are saved automatically.</span>
        <Button
          onClick={() => {
            queue.clear()
            setDraft({})
            apply({ ...DEFAULT_SETTINGS, quality: settings.quality })
          }}
          size="sm"
        >
          Restore defaults
        </Button>
      </div>
    </div>
  )
}
