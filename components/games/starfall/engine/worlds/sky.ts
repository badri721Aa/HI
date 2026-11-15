/**
 * Floating Sky Isles (placeholder scenery, replaced by the full map): a pale stone plaza on a
 * floating island, ringed by the rune-lit columns of a sky temple, with grassy islets drifting
 * around it above a sea of clouds. The Vortex Weaver circles overhead.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { jaggedCone, place, rockGeometry, seeded, slab } from './geo'
import type { MapBuild } from './registry'
import { abyss, buildStage, type Owned } from './stage'

/** The Vortex Weaver's circle (m); the floor reaches 4 m further. */
export const SKY_RADIUS = 19
const FLOOR = SKY_RADIUS + 4
const ISLETS = 9

export function buildSky(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Owned = []
  const uTime = { value: 0 }
  const rnd = seeded(29)

  const floor = kit.mat('stone', { color: '#e6dfd0', key: 'sky-plaza' })
  const earth = kit.mat('rock', { color: '#9b8a74', key: 'sky-earth' })
  const marble = kit.mat('stone', { color: '#f3eee4', key: 'sky-marble' })
  const grass = kit.mat('mossStone', { color: '#9fc77e', key: 'sky-grass' })
  const runes = kit.mat('glow', { color: '#e8fbff', emissive: '#7fe8ff', emissiveIntensity: 1.6, key: 'sky-rune' })
  buildStage(ctx, kit, def, { floor: FLOOR, top: floor, under: earth })
  // A grassy lip round the plaza, so it reads as an island top rather than a coin.
  kit.add(slab(FLOOR + 0.9, FLOOR + 0.4, 0.9, 72, 3), grass, place(cx, cy - 0.9, cz))
  kit.own(ctx.collision.addCylinder({ x: cx, y: cy - 4, z: cz, r: FLOOR + 0.9, h: 3.55, surface: 'grass' }))

  // The sky temple's columns; the way in from the south stays open.
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2
    if (Math.cos(a) > 0.8) continue
    const x = cx + Math.sin(a) * (FLOOR - 1.4)
    const z = cz + Math.cos(a) * (FLOOR - 1.4)
    const h = i % 4 === 1 ? 1.6 + rnd() : 4.6 + rnd() * 1.6
    kit.cylinder({ x, y: cy, z, r: 0.9, h: 0.4, segments: 12, mat: marble })
    kit.cylinder({ x, y: cy + 0.4, z, r: 0.55, rTop: 0.5, h, segments: 14, mat: marble, collide: { surface: 'stone' } })
    kit.box({ x, y: cy + 1.6, z, w: 0.08, h: Math.min(h, 3) - 1.4, d: 1.12, yaw: a, mat: runes, castShadow: false })
    if (h > 4) kit.cylinder({ x, y: cy + 0.4 + h, z, r: 0.8, h: 0.35, segments: 12, mat: marble })
  }

  // Islets drifting round the plaza (out of reach): grass on top, rock trailing below.
  const isletGeo = jaggedCone(1, 0.3, 1.5, 61)
  const isletTop = slab(1.05, 0.95, 0.35, 24, 1)
  const isletRock = kit.addObject(new THREE.InstancedMesh(isletGeo, earth, ISLETS))
  const isletGrass = kit.addObject(new THREE.InstancedMesh(isletTop, grass, ISLETS))
  owned.push(isletGeo, isletTop)
  isletRock.castShadow = isletGrass.castShadow = true
  isletRock.frustumCulled = isletGrass.frustumCulled = false
  const drift = Array.from({ length: ISLETS }, (_, i) => {
    const a = ((i + 0.5) / ISLETS) * Math.PI * 2 + rnd() * 0.3
    const d = 36 + rnd() * 34
    return { x: cx + Math.sin(a) * d, y: cy - 8 + rnd() * 18, z: cz + Math.cos(a) * d, s: 2.2 + rnd() * 3.4, ph: rnd() * 6 }
  })
  // A few loose rocks hang under the main island.
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2
    const r = 6 + rnd() * (FLOOR - 9)
    kit.add(rockGeometry(0.9 + rnd() * 1.2, 120 + i), earth, place(cx + Math.sin(a) * r, cy - FLOOR * 0.8 - 3 - rnd() * 6, cz + Math.cos(a) * r, rnd(), rnd() * 6, 0), { castShadow: false })
  }

  abyss(ctx, kit, owned, def, 'clouds', ['#8ea4c9', '#fff8ee'], uTime)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const top = new THREE.Vector3()
  return {
    update(_dt: number, t: number) {
      uTime.value = t
      for (let i = 0; i < ISLETS; i++) {
        const f = drift[i]
        q.setFromAxisAngle(up, f.ph + t * 0.02)
        p.set(f.x, f.y + Math.sin(t * 0.35 + f.ph) * 0.7, f.z)
        m.compose(p, q, s.set(f.s, f.s * 1.1, f.s))
        isletRock.setMatrixAt(i, m)
        m.compose(top.copy(p).setY(p.y + 0.1), q, s.set(f.s, f.s, f.s))
        isletGrass.setMatrixAt(i, m)
      }
      isletRock.instanceMatrix.needsUpdate = isletGrass.instanceMatrix.needsUpdate = true
    },
    dispose() {
      for (const o of owned) o.dispose()
      isletRock.dispose()
      isletGrass.dispose()
    },
  }
}
