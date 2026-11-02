// STUB — replaced by a zone builder.
import * as THREE from 'three'
import type { Ctx } from '../../types'
import { ZoneKit, type ZonePart } from './kit'
import { BEACON } from '../level'
import { heightAt } from '../heightfield'

export interface BeaconPart extends ZonePart {
  /** World position of the lantern (shards fly here). */
  lantern: THREE.Vector3
  /** Where the player stands to activate it. */
  altar: THREE.Vector3
  /** Light it up (final cutscene). */
  ignite(): void
  /** Show how many of the 7 sockets are filled. */
  setSockets(n: number): void
}

export function buildBeacon(ctx: Ctx): BeaconPart {
  const kit = new ZoneKit(ctx, 'beacon')
  const g = heightAt(BEACON.x, BEACON.z)
  kit.cylinder({ x: BEACON.x, y: g, z: BEACON.z, r: 1.6, rTop: 1.2, h: BEACON.towerHeight, mat: 'stone', collide: true })
  kit.finalize()
  return {
    lantern: new THREE.Vector3(BEACON.x, g + BEACON.towerHeight + 1, BEACON.z),
    altar: new THREE.Vector3(BEACON.x, g, BEACON.z + 4),
    ignite() {},
    setSockets() {},
    dispose: () => kit.dispose(),
  }
}
