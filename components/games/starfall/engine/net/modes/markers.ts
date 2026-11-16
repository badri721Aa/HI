/**
 * What a round puts in the world: the race rings (the next one blazing), the King of
 * the Hill circle, and a red glow with a bobbing chevron over whoever is It (Tag) or
 * seeking (Hide and Seek). Built on first use; nothing here allocates per frame.
 */
import * as THREE from 'three'
import { glowTexture } from '../../gameplay/parts/util'
import type { Ctx } from '../../types'
import { contestant, HILL_R, HILLS, RING_R, RINGS, ROLE_IT, type RoundState } from './defs'
import type { Locate } from './rules'

const AMBER = 0xffb44d
const RED = 0xff4a36
const MAX_MARKS = 12

/** Soft additive material that ignores fog and tone mapping (it is light). */
function glowMat(color: number, opacity: number, extra: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, ...extra,
  })
}

/** Vertical fade (opaque at the bottom) for the hill's wall of light. */
function fadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 64, 0, 0)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 64)
  return new THREE.CanvasTexture(c)
}

interface Mark {
  halo: THREE.Sprite
  chevron: THREE.Mesh
}

export class ModeMarkers {
  private root = new THREE.Group()
  private built = false
  private rings: THREE.Mesh[] = []
  private ringHalo!: THREE.Sprite
  private hill!: THREE.Group
  private marks: Mark[] = []
  private disposables: Array<{ dispose(): void }> = []
  private nextMat!: THREE.MeshBasicMaterial
  private restMat!: THREE.MeshBasicMaterial
  private hillMats: THREE.MeshBasicMaterial[] = []
  private t = 0

  constructor(private ctx: Ctx) {
    this.root.name = 'modes'
  }

  update(dt: number, s: RoundState, selfId: string, locate: Locate): void {
    const on = s.phase === 'countdown' || s.phase === 'live'
    if (!on && !this.built) return
    this.build()
    this.t += dt
    const t = this.t
    this.root.visible = on

    // Race rings: the next one (for us) bright, the rest faint, the passed ones gone.
    const race = on && s.mode === 'race'
    const me = contestant(s, selfId)
    const next = me ? me.score : -1
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i]
      ring.visible = race && (next < 0 || i >= next)
      ring.material = i === next ? this.nextMat : this.restMat
      if (i === next) ring.scale.setScalar(1 + Math.sin(t * 4) * 0.04)
      else ring.scale.setScalar(1)
    }
    this.ringHalo.visible = race && next >= 0 && next < RINGS.length
    if (this.ringHalo.visible) this.ringHalo.position.copy(this.rings[next].position)

    // The hill.
    const hill = on && s.mode === 'koth'
    this.hill.visible = hill
    if (hill) {
      const h = HILLS[s.hill]
      this.hill.position.set(h.x, h.y - 0.2, h.z)
      // Pulses faster in its last ten seconds.
      const pulse = 0.75 + 0.25 * Math.sin(t * (s.hillLeft < 10 ? 9 : 2.5))
      this.hillMats[0].opacity = 0.26 * pulse
      this.hillMats[1].opacity = 0.6 * pulse
    }

    // It / seekers.
    let n = 0
    if (on && (s.mode === 'tag' || s.mode === 'hide')) {
      for (const p of s.players) {
        if (p.role !== ROLE_IT || n >= MAX_MARKS) continue
        const pos = locate(p.id)
        if (!pos) continue
        const m = this.marks[n++]
        m.halo.visible = m.chevron.visible = true
        m.halo.position.set(pos.x, pos.y + 0.95, pos.z)
        m.halo.scale.setScalar(2.4 + Math.sin(t * 6 + n) * 0.25)
        m.chevron.position.set(pos.x, pos.y + 2.55 + Math.sin(t * 3 + n) * 0.12, pos.z)
        m.chevron.rotation.y = t * 2
      }
    }
    for (let i = n; i < this.marks.length; i++) this.marks[i].halo.visible = this.marks[i].chevron.visible = false
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }

  private build(): void {
    if (this.built) return
    this.built = true
    const own = <T extends { dispose(): void }>(o: T): T => {
      this.disposables.push(o)
      return o
    }
    const glow = glowTexture(this.ctx)
    if (glow.owned) own(glow.texture)

    const torus = own(new THREE.TorusGeometry(RING_R, 0.17, 8, 48))
    this.nextMat = own(glowMat(AMBER, 1))
    this.restMat = own(glowMat(AMBER, 0.28))
    for (const r of RINGS) {
      const m = new THREE.Mesh(torus, this.restMat)
      m.position.set(r.x, r.y, r.z)
      m.rotation.y = r.yaw
      m.frustumCulled = false
      this.rings.push(m)
      this.root.add(m)
    }
    const haloMat = own(new THREE.SpriteMaterial({ map: glow.texture, color: AMBER, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    this.ringHalo = new THREE.Sprite(haloMat)
    this.ringHalo.scale.setScalar(RING_R * 3.4)
    this.root.add(this.ringHalo)

    // Hill: a wall of light fading upward and a bright rim on the ground.
    const fade = own(fadeTexture())
    const wall = own(new THREE.CylinderGeometry(HILL_R, HILL_R, 2.6, 48, 1, true))
    wall.translate(0, 1.3, 0)
    const rim = own(new THREE.RingGeometry(HILL_R - 0.22, HILL_R, 48))
    rim.rotateX(-Math.PI / 2)
    rim.translate(0, 0.25, 0)
    this.hillMats = [own(glowMat(AMBER, 0.26, { alphaMap: fade, side: THREE.DoubleSide })), own(glowMat(AMBER, 0.6, { side: THREE.DoubleSide }))]
    this.hill = new THREE.Group()
    this.hill.add(new THREE.Mesh(wall, this.hillMats[0]), new THREE.Mesh(rim, this.hillMats[1]))
    this.root.add(this.hill)

    // Markers over It.
    const markHalo = own(new THREE.SpriteMaterial({ map: glow.texture, color: RED, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    const cone = own(new THREE.ConeGeometry(0.22, 0.42, 4))
    cone.rotateX(Math.PI)
    const coneMat = own(glowMat(RED, 0.95, { blending: THREE.NormalBlending }))
    for (let i = 0; i < MAX_MARKS; i++) {
      const halo = new THREE.Sprite(markHalo)
      const chevron = new THREE.Mesh(cone, coneMat)
      halo.visible = chevron.visible = false
      this.marks.push({ halo, chevron })
      this.root.add(halo, chevron)
    }
    this.ctx.scene.add(this.root)
  }
}
