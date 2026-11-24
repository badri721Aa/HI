/** The icon for every weapon (hotbar slots, the Gun Game ladder). */
import type { ComponentType, SVGProps } from 'react'
import type { WeaponId } from '../engine/events'
import { BowIcon, CometLauncherIcon, FistIcon, FrostHammerIcon, HammerIcon, StarBlasterIcon, StarbladeIcon, SwordIcon } from './icons'

export const WEAPON_ICON: Record<WeaponId, ComponentType<SVGProps<SVGSVGElement>>> = {
  fists: FistIcon, sword: SwordIcon, hammer: HammerIcon, bow: BowIcon, starblade: StarbladeIcon, frostHammer: FrostHammerIcon,
  starBlaster: StarBlasterIcon, cometLauncher: CometLauncherIcon,
}
