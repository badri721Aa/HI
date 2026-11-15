/**
 * Glitch Grid (placeholder scenery, replaced by the full map): a black disc of tiles traced
 * with cyan light, some flickering on, hanging over an endless grid in the void. Data cubes float
 * round its rim and now and then skip a step sideways. The Void Stalker hunts here.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { place, seeded, slab } from './geo'
import type { MapBuild } from './registry'
import { abyss, buildStage, floorMaterial, type Owned } from './stage'

/** The Void Stalker's circle (m); the floor reaches 4 m further. */
export const GLITCH_RADIUS = 18
const FLOOR = GLITCH_RADIUS + 4
/** Dark data cubes and smaller lit ones. */
const DARK = 16
const LIT = 12

export function buildGlitch(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Owned = []
  const uTime = { value: 0 }
  const rnd = seeded(91)

  const floor = floorMaterial(ctx, { map: 'stone_albedo', normal: 'stone_normal', color: '#2a313b', roughness: 0.5, metalness: 0.25, pattern: 'grid', glow: '#19f0d8', strength: 1.8, scale: 0.5, cells: true }, uTime, def.center)
  owned.push(floor)
  const shell = kit.mat('metal', { color: '#151a22', key: 'glitch-shell' })
  const light = kit.mat('glow', { color: '#c8fff6', emissive: '#19f0d8', emissiveIntensity: 2, key: 'glitch-light' })
  const { ledgeZ } = buildStage(ctx, kit, def, { floor: FLOOR, top: floor })

  // Underneath: stepped octagonal tiers, each edged with light, narrowing into the void.
  for (let k = 0; k < 4; k++) {
    const r = FLOOR * (0.9 - k * 0.2)
    const y = cy - 1.4 - k * 2.6
    kit.add(slab(r, r, 2.6, 8, 3), shell, place(cx, y - 1.3, cz, 0, Math.PI / 8, 0), { castShadow: false })
    kit.add(slab(r + 0.08, r + 0.08, 0.14, 8, 3), light, place(cx, y - 0.2, cz, 0, Math.PI / 8, 0), { castShadow: false })
  }
  kit.add(slab(5.4, 3, 6, 8, 3), shell, place(cx, cy - 4.4, ledgeZ, 0, Math.PI / 8, 0), { castShadow: false })

  // Data pylons round the rim; the way in from the south stays open.
  for (let i = 0; i < 10; i++) {
    const a = ((i + 0.5) / 10) * Math.PI * 2
    if (Math.cos(a) > 0.8) continue
    const x = cx + Math.sin(a) * (FLOOR - 1.2)
    const z = cz + Math.cos(a) * (FLOOR - 1.2)
    const h = 2.5 + rnd() * 3.5
    kit.box({ x, y: cy, z, w: 0.9, h, d: 0.9, yaw: a, mat: shell, collide: { surface: 'metal' } })
    kit.box({ x, y: cy + 0.3, z, w: 0.95, h: h - 0.6, d: 0.12, yaw: a, mat: light, castShadow: false })
  }

  // Data cubes hovering beyond the rim; every so often one skips sideways (a glitch, not a flash).
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1)
  owned.push(cubeGeo)
  const cubes = kit.addObject(new THREE.InstancedMesh(cubeGeo, shell, DARK))
  const glows = kit.addObject(new THREE.InstancedMesh(cubeGeo, light, LIT))
  cubes.frustumCulled = glows.frustumCulled = false
  const bits = Array.from({ length: DARK + LIT }, (_, i) => {
    const a = ((i + rnd()) / (DARK + LIT)) * Math.PI * 2
    const d = FLOOR + 3 + rnd() * 18
    const s = i < DARK ? 0.8 + rnd() * 1.6 : 0.3 + rnd() * 0.4
    return { x: cx + Math.sin(a) * d, y: cy - 4 + rnd() * 14, z: cz + Math.cos(a) * d, s, ph: rnd() * 40, spin: (rnd() - 0.5) * 0.6 }
  })

  abyss(ctx, kit, owned, def, 'void', ['#010307', '#19f0d8'], uTime)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  return {
    update(_dt: number, t: number) {
      uTime.value = t
      for (let i = 0; i < DARK + LIT; i++) {
        const b = bits[i]
        // A skip lasts a third of a second, about once every eight seconds per cube.
        const skip = (t + b.ph) % 8 < 0.33 ? 0.9 : 0
        p.set(b.x + skip, b.y + Math.sin(t * 0.5 + b.ph) * 0.6, b.z)
        m.compose(p, q.setFromEuler(e.set(b.ph, t * b.spin + b.ph, 0.4)), s.setScalar(b.s))
        if (i < DARK) cubes.setMatrixAt(i, m)
        else glows.setMatrixAt(i - DARK, m)
      }
      cubes.instanceMatrix.needsUpdate = glows.instanceMatrix.needsUpdate = true
    },
    dispose() {
      for (const o of owned) o.dispose()
      cubes.dispose()
      glows.dispose()
    },
  }
}
