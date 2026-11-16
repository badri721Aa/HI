/**
 * Hand grips for held props. Measured once in the rest pose from the knuckle bones, so it works
 * whatever the bones' roll: a grip's +Y runs from the little-finger knuckle to the index knuckle
 * (out of the fist on the thumb side), +Z points along the hand toward the fingers (where the
 * knuckles face in a fist), and its origin sits where a closed fist holds a handle. Units are
 * metres whatever the model's scale.
 */
import * as THREE from 'three'

const _inv = new THREE.Matrix4()
const _hand = new THREE.Matrix4()
const _g = new THREE.Matrix4()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _c = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()

/**
 * Adds a grip Object3D under the hand bone of `side` and returns it (null if the rig lacks the
 * bones). `root` is the model in its rest pose; `scale` converts its units to metres.
 */
export function createGrip(root: THREE.Object3D, side: 'L' | 'R', scale: number): THREE.Object3D | null {
  const hand = root.getObjectByName(`hand${side}`)
  const index = root.getObjectByName(`f_index01${side}`)
  const pinky = root.getObjectByName(`f_pinky01${side}`)
  const middle = root.getObjectByName(`f_middle01${side}`)
  if (!hand || !index || !pinky || !middle) return null
  root.updateMatrixWorld(true)
  _inv.copy(root.matrixWorld).invert()
  const local = (o: THREE.Object3D, out: THREE.Vector3) => out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(_inv)

  local(index, _a)
  local(pinky, _b)
  _y.subVectors(_a, _b).normalize()
  _c.addVectors(_a, _b).multiplyScalar(0.5)
  local(middle, _a)
  local(hand, _b)
  _z.subVectors(_a, _b)
  _z.addScaledVector(_y, -_z.dot(_y)).normalize()
  _x.crossVectors(_y, _z)
  // The palm faces +X on the right hand and -X on the left (a right-handed frame either way).
  const palm = side === 'R' ? 1 : -1
  const m = 1 / scale
  _c.addScaledVector(_z, 0.022 * m).addScaledVector(_x, palm * 0.02 * m)

  _g.makeBasis(_x, _y, _z).scale(_a.set(m, m, m)).setPosition(_c)
  _hand.copy(_inv).multiply(hand.matrixWorld).invert()
  const grip = new THREE.Object3D()
  grip.name = `grip${side}`
  _hand.multiply(_g).decompose(grip.position, grip.quaternion, grip.scale)
  hand.add(grip)
  return grip
}
