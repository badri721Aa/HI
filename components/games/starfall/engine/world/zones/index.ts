/**
 * All hand-built landmarks. Each zone module exports a `build*` function that
 * receives the shared Ctx and returns a ZonePart (optional update/dispose).
 * A zone that throws is logged and skipped so one bug can't take the island down.
 */
import * as THREE from 'three'
import type { Ctx, IZones } from '../../types'
import type { ZonePart } from './kit'
import { buildBeach } from './beach'
import { buildVillage } from './village'
import { buildCove } from './cove'
import { buildBeacon, type BeaconPart } from './beacon'
import { buildForest } from './forest'
import { buildRuins } from './ruins'
import { buildFalls } from './falls'
import { buildLake } from './lake'

export class Zones implements IZones {
  readonly beaconLantern = new THREE.Vector3()
  readonly beaconAltar = new THREE.Vector3()
  private parts: ZonePart[] = []
  private beacon: BeaconPart | null = null
  private sockets = -1

  constructor(private ctx: Ctx) {}

  async init(): Promise<void> {
    const builders: Array<[string, (ctx: Ctx) => ZonePart]> = [
      ['beach', buildBeach],
      ['village', buildVillage],
      ['cove', buildCove],
      ['forest', buildForest],
      ['ruins', buildRuins],
      ['falls', buildFalls],
      ['lake', buildLake],
    ]
    let i = 0
    for (const [name, build] of builders) {
      try {
        this.parts.push(build(this.ctx))
      } catch (err) {
        console.error(`[starfall] zone ${name} failed to build`, err)
      }
      this.ctx.progress(++i / (builders.length + 1))
      await new Promise(r => setTimeout(r, 0))
    }
    try {
      this.beacon = buildBeacon(this.ctx)
      this.parts.push(this.beacon)
      this.beaconLantern.copy(this.beacon.lantern)
      this.beaconAltar.copy(this.beacon.altar)
    } catch (err) {
      console.error('[starfall] zone beacon failed to build', err)
    }
    this.ctx.progress(1)
  }

  update(dt: number): void {
    const t = this.ctx.clock.t
    for (const p of this.parts) p.update?.(dt, t)
    const n = this.ctx.game.shardCount()
    if (n !== this.sockets && this.beacon) {
      this.sockets = n
      this.beacon.setSockets(n)
    }
  }

  igniteBeacon(): void {
    this.beacon?.ignite()
  }

  dispose(): void {
    for (const p of this.parts) p.dispose?.()
    this.parts = []
  }
}
