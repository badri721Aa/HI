// STUB — replaced by the Environment builder. Minimal lights + flat-shaded terrain so the game runs.
import * as THREE from 'three'
import type { Ctx, IEnvironment, TimeOfDay } from '../types'
import type { V3 } from '../events'
import { heightAt, WORLD_HALF } from './heightfield'

export class Environment implements IEnvironment {
  readonly sun = new THREE.DirectionalLight(0xffe2b8, 2.4)
  readonly sunDirection = new THREE.Vector3(0.4, 0.5, -0.6).normalize()
  readonly fogColor = new THREE.Color(0xf0c9a0)
  constructor(private ctx: Ctx) {}
  init(): void {
    const { scene } = this.ctx
    scene.background = this.fogColor.clone()
    scene.fog = new THREE.Fog(this.fogColor, 60, this.ctx.quality.viewDistance)
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x6a5a40, 1.1))
    this.sun.position.copy(this.sunDirection).multiplyScalar(80)
    scene.add(this.sun, this.sun.target)
    const seg = 160
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)))
    geo.computeVertexNormals()
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6f9a4f, roughness: 1 }))
    terrain.receiveShadow = true
    scene.add(terrain)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c6f8f, roughness: 0.2, transparent: true, opacity: 0.85 }))
    scene.add(sea)
  }
  update(): void {}
  setTimeOfDay(_tod: TimeOfDay, _seconds: number): void {}
  setShadowFocus(p: V3): void {
    this.sun.target.position.set(p.x, p.y, p.z)
    this.sun.position.set(p.x, p.y, p.z).addScaledVector(this.sunDirection, 80)
  }
  dispose(): void {}
}
