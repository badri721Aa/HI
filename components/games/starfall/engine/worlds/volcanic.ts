/**
 * Ancient Volcanic Ruins (placeholder scenery, replaced by the full map): a basalt arena split
 * by glowing lava cracks, ringed by the broken columns of an old temple, floating over a lava
 * sea with volcanoes smouldering in the haze. The Iron Titan waits in the middle.
 */
import * as THREE from 'three'
import type { Ctx } from '../types'
import type { ZoneKit } from '../world/zones/kit'
import type { MapDef } from './defs'
import { jaggedCone, place, rockGeometry, scaleUv, seeded, slab } from './geo'
import type { MapBuild } from './registry'
import { abyss, buildStage, floorMaterial, type Owned } from './stage'

/** The Iron Titan's circle (m); the floor reaches 4 m further. */
export const VOLCANIC_RADIUS = 20
const FLOOR = VOLCANIC_RADIUS + 4

export function buildVolcanic(ctx: Ctx, kit: ZoneKit, def: MapDef): MapBuild {
  const { x: cx, y: cy, z: cz } = def.center
  const owned: Owned = []
  const uTime = { value: 0 }
  const rnd = seeded(53)

  const floor = floorMaterial(ctx, { map: 'rock_albedo', normal: 'rock_normal', color: '#8a7468', roughness: 0.82, pattern: 'cracks', glow: '#ff5a14', strength: 2.4, scale: 0.016 }, uTime, def.center)
  owned.push(floor)
  const basalt = kit.mat('rock', { color: '#4b3f3b', key: 'basalt' })
  const ruin = kit.mat('stone', { color: '#c9a587', key: 'volcanic-ruin' })
  const ember = kit.mat('glow', { color: '#3a1206', emissive: '#ff5a14', emissiveIntensity: 2.2, key: 'ember' })
  buildStage(ctx, kit, def, { floor: FLOOR, top: floor, under: basalt })

  // The temple's broken colonnade around the rim; the way in from the south stays open.
  for (let i = 0; i < 14; i++) {
    const a = ((i + 0.5) / 14) * Math.PI * 2
    if (Math.cos(a) > 0.8) continue
    const x = cx + Math.sin(a) * (FLOOR - 1.6)
    const z = cz + Math.cos(a) * (FLOOR - 1.6)
    const h = i % 3 === 0 ? 1 + rnd() : 3.4 + rnd() * 3
    kit.cylinder({ x, y: cy, z, r: 1.1, h: 0.45, segments: 8, mat: ruin })
    kit.cylinder({ x, y: cy + 0.45, z, r: 0.72, rTop: 0.64, h, segments: 10, mat: ruin, collide: { surface: 'stone' } })
    if (h > 3) kit.box({ x, y: cy + 0.45 + h, z, w: 1.8, h: 0.45, d: 1.8, yaw: a + rnd() * 0.3, mat: ruin })
    // Rubble at the foot, some of it still glowing.
    kit.add(rockGeometry(0.35 + rnd() * 0.3, 70 + i), i % 2 ? ruin : basalt, place(x + (rnd() - 0.5) * 2.4, cy + 0.12, z + (rnd() - 0.5) * 2.4, rnd(), rnd() * 6, 0))
  }

  // Basalt prisms pushing up through the floor's edge, glowing where they crack.
  for (let i = 0; i < 9; i++) {
    const a = ((i + 0.1) / 9) * Math.PI * 2
    if (Math.cos(a) > 0.75) continue
    const r = FLOOR - 0.6
    for (let k = 0; k < 3; k++) {
      const h = 0.8 + rnd() * 1.6
      const x = cx + Math.sin(a) * r + (rnd() - 0.5) * 1.6
      const z = cz + Math.cos(a) * r + (rnd() - 0.5) * 1.6
      kit.add(new THREE.CylinderGeometry(0.42, 0.48, h, 6).translate(0, h / 2, 0), basalt, place(x, cy - 0.3, z, (rnd() - 0.5) * 0.3, rnd(), (rnd() - 0.5) * 0.3))
    }
    kit.add(rockGeometry(0.5, 90 + i), ember, place(cx + Math.sin(a) * (r - 1.4), cy - 0.25, cz + Math.cos(a) * (r - 1.4), 0, rnd() * 6, 0, 1.4, 0.5, 1.2), { castShadow: false })
  }

  // Volcanoes smouldering in the haze, their craters aglow.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.5
    const d = 120 + rnd() * 70
    const h = 60 + rnd() * 50
    const r = 38 + rnd() * 22
    const x = cx + Math.sin(a) * d
    const z = cz + Math.cos(a) * d
    const top = cy - 50 + h
    kit.add(scaleUv(jaggedCone(r * 0.2, r, h, 300 + i), 10, 6), basalt, place(x, top, z, 0, rnd() * 6, 0), { castShadow: false })
    kit.add(slab(r * 0.19, r * 0.19, 0.8, 16, 4), ember, place(x, top - 0.6, z), { castShadow: false })
  }

  abyss(ctx, kit, owned, def, 'lava', ['#1f0904', '#ff6a1c'], uTime)

  return {
    update(_dt: number, t: number) {
      uTime.value = t
    },
    dispose() {
      for (const o of owned) o.dispose()
    },
  }
}
