/**
 * What a round puts in the world: the race rings (the next one blazing), the King of
 * the Hill circle, and the marks on players — a red glow with a bobbing chevron over
 * whoever is It (Tag) or seeking (Hide and Seek), a sickly green aura with drifting
 * spores on the infected, a golden glow and a turning crown on the Juggernaut, and a
 * pale bubble round anyone under spawn protection. Built on first use; nothing here
 * allocates per frame.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { glowTexture } from '../../gameplay/parts/util'
import type { Ctx } from '../../types'
import { contestant, HILL_R, HILLS, JUGGERNAUT, PROTECT, RESPAWN, RING_R, RINGS, ROLE_IT, type Contestant, type RoundState } from './defs'
import type { Locate } from './rules'

const AMBER = 0xffb44d
const RED = 0xff4a36
const SICK = 0x86ff3c
const GOLD = 0xffc94a
const SHIELD = 0x9fe6ff
const MAX_MARKS = 12
/** Spores rise off each infected player this often (s), where the particle budget allows. */
const SPORE_GAP = 0.3
const SPORE_BUDGET = 1200
const SPORE_COLOR = '#9dff5a'

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

/** A small crown: a band with five points, about 0.5 m across. */
function crownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.25, 0.23, 0.12, 20, 1, true)]
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const spike = new THREE.ConeGeometry(0.075, 0.2, 4)
    spike.translate(Math.sin(a) * 0.235, 0.15, Math.cos(a) * 0.235)
    parts.push(spike)
  }
  const g = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return g
}

/** How a marked player looks: the glow about the body, the thing over the head and the ring at the feet. */
interface Style {
  halo: THREE.SpriteMaterial
  top: THREE.BufferGeometry
  topMat: THREE.Material
  ring: THREE.Material | null
  /** Halo size (m) and how far it pulses. */
  size: number
  pulse: number
}

interface Mark {
  halo: THREE.Sprite
  top: THREE.Mesh
  ring: THREE.Mesh
}

interface Bubble {
  shell: THREE.Mesh
  glow: THREE.Sprite
}

export class ModeMarkers {
  private root = new THREE.Group()
  private built = false
  private rings: THREE.Mesh[] = []
  private ringHalo!: THREE.Sprite
  private hill!: THREE.Group
  private marks: Mark[] = []
  private bubbles: Bubble[] = []
  private styles!: { it: Style; sick: Style; crown: Style }
  private disposables: Array<{ dispose(): void }> = []
  private nextMat!: THREE.MeshBasicMaterial
  private restMat!: THREE.MeshBasicMaterial
  private hillMats: THREE.MeshBasicMaterial[] = []
  private shellMat!: THREE.MeshBasicMaterial
  private t = 0
  private sporeT = 0
  private readonly spore = { x: 0, y: 0, z: 0 }
  private readonly up = { x: 0, y: 1, z: 0 }

  constructor(private ctx: Ctx) {
    this.root.name = 'modes'
  }

  /** `selfShield`: our own spawn protection is up (known exactly here; the others' is read off the round state). */
  update(dt: number, s: RoundState, selfId: string, locate: Locate, selfShield = false): void {
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

    // It, seekers, the infected, the Juggernaut.
    const style = !on ? null : s.mode === 'tag' || s.mode === 'hide' ? this.styles.it : s.mode === 'infection' ? this.styles.sick : s.mode === 'juggernaut' ? this.styles.crown : null
    const spores = style === this.styles.sick && s.phase === 'live' && this.ctx.quality.particles >= SPORE_BUDGET && (this.sporeT -= dt) <= 0
    if (spores) this.sporeT = SPORE_GAP
    let n = 0
    if (style) {
      // The Juggernaut stands taller: everything sits higher and wider on them.
      const k = style === this.styles.crown ? JUGGERNAUT.scale : 1
      for (const p of s.players) {
        if (p.role !== ROLE_IT || n >= MAX_MARKS) continue
        const pos = locate(p.id)
        if (!pos) continue
        const m = this.marks[n++]
        m.halo.visible = m.top.visible = true
        m.halo.material = style.halo
        m.halo.position.set(pos.x, pos.y + 0.95 * k, pos.z)
        m.halo.scale.setScalar((style.size + Math.sin(t * 6 + n) * style.pulse) * k)
        m.top.geometry = style.top
        m.top.material = style.topMat
        m.top.position.set(pos.x, pos.y + 2.55 * k + Math.sin(t * 3 + n) * 0.12, pos.z)
        m.top.rotation.y = t * 2
        m.ring.visible = !!style.ring
        if (style.ring) {
          m.ring.material = style.ring
          m.ring.position.set(pos.x, pos.y + 0.06, pos.z)
          m.ring.scale.setScalar((1 + 0.12 * Math.sin(t * 2.4 + n)) * k)
        }
        if (spores) {
          const sp = this.spore
          sp.x = pos.x + Math.sin(t * 7 + n * 2.1) * 0.35
          sp.y = pos.y + 0.5 + ((t * 0.9 + n * 0.37) % 1) * 1.1
          sp.z = pos.z + Math.cos(t * 5 + n * 1.3) * 0.35
          this.ctx.fx.burst('spark', sp, { color: SPORE_COLOR, count: 2, scale: 0.7, dir: this.up })
        }
      }
    }
    for (let i = n; i < this.marks.length; i++) this.marks[i].halo.visible = this.marks[i].top.visible = this.marks[i].ring.visible = false

    // Spawn protection: a slow-breathing bubble.
    let b = 0
    if (s.phase === 'live' && (s.mode === 'juggernaut' || s.mode === 'gungame')) {
      this.shellMat.opacity = 0.2 + 0.07 * Math.sin(t * 9)
      for (const p of s.players) {
        if (b >= MAX_MARKS || !(p.id === selfId ? selfShield : shielded(s, p))) continue
        const pos = locate(p.id)
        if (!pos) continue
        const k = s.mode === 'juggernaut' && p.role === ROLE_IT ? JUGGERNAUT.scale : 1
        const bub = this.bubbles[b++]
        bub.shell.visible = bub.glow.visible = true
        bub.shell.position.set(pos.x, pos.y + 0.9 * k, pos.z)
        bub.shell.scale.setScalar(k)
        bub.shell.rotation.y = t * 0.8
        bub.glow.position.copy(bub.shell.position)
        bub.glow.scale.setScalar(3.1 * k)
      }
    }
    for (let i = b; i < this.bubbles.length; i++) this.bubbles[i].shell.visible = this.bubbles[i].glow.visible = false
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
    const sprite = (color: number, opacity: number) =>
      own(new THREE.SpriteMaterial({ map: glow.texture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))

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
    this.ringHalo = new THREE.Sprite(sprite(AMBER, 0.55))
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

    // Marks on players.
    const cone = own(new THREE.ConeGeometry(0.22, 0.42, 4))
    cone.rotateX(Math.PI)
    const solid = (color: number) => own(glowMat(color, 0.95, { blending: THREE.NormalBlending, side: THREE.DoubleSide }))
    const floor = own(new THREE.RingGeometry(0.62, 0.86, 40))
    floor.rotateX(-Math.PI / 2)
    this.styles = {
      it: { halo: sprite(RED, 0.6), top: cone, topMat: solid(RED), ring: null, size: 2.4, pulse: 0.25 },
      sick: { halo: sprite(SICK, 0.72), top: cone, topMat: solid(SICK), ring: own(glowMat(SICK, 0.55, { side: THREE.DoubleSide })), size: 2.9, pulse: 0.4 },
      crown: { halo: sprite(GOLD, 0.5), top: own(crownGeometry()), topMat: solid(GOLD), ring: own(glowMat(GOLD, 0.5, { side: THREE.DoubleSide })), size: 3, pulse: 0.2 },
    }
    for (let i = 0; i < MAX_MARKS; i++) {
      const halo = new THREE.Sprite(this.styles.it.halo)
      const top = new THREE.Mesh(cone, this.styles.it.topMat)
      const ring = new THREE.Mesh(floor, this.styles.sick.ring!)
      halo.visible = top.visible = ring.visible = false
      top.frustumCulled = ring.frustumCulled = false
      this.marks.push({ halo, top, ring })
      this.root.add(halo, top, ring)
    }

    // Spawn-protection bubbles.
    const shell = own(new THREE.IcosahedronGeometry(1.08, 2))
    this.shellMat = own(glowMat(SHIELD, 0.22, { wireframe: true }))
    const shellGlow = sprite(SHIELD, 0.4)
    for (let i = 0; i < MAX_MARKS; i++) {
      const mesh = new THREE.Mesh(shell, this.shellMat)
      const halo = new THREE.Sprite(shellGlow)
      mesh.visible = halo.visible = false
      mesh.frustumCulled = false
      this.bubbles.push({ shell: mesh, glow: halo })
      this.root.add(mesh, halo)
    }
    this.ctx.scene.add(this.root)
  }
}

/** Is another player under spawn protection, going by the round state: just back from a knockout, or just crowned? */
function shielded(s: RoundState, p: Contestant): boolean {
  if (s.immune === p.id && s.immuneLeft > 0) return true
  const since = p.down >= 0 ? s.elapsed - p.down : -1
  return since >= RESPAWN && since < RESPAWN + PROTECT
}
