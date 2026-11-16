// Builds the Enemy Factory's models in public/games/starfall/models/ from their CC0 sources
// (see tools/starfall/MODELS.md for where each comes from).
//
//   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer@0.22.0 sharp
//   node tools/starfall/build_enemy_models.mjs <rawDir> <netforgeLowpolyDir> public/games/starfall/models
//
// <rawDir> holds the KayKit Skeletons files (Characters/gltf/*.glb, Assets/gltf/*.gltf + .bin + png)
// and RobotExpressive.glb; <netforgeLowpolyDir> is library/lowpoly of @netforge/asset-library-files.
// Output uses KHR_mesh_quantization only, so the game needs no decoder.
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO, Document } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample, quantize, weld, mergeDocuments, unpartition, joinPrimitives } from '@gltf-transform/functions'
import sharp from 'sharp'
import { MeshoptDecoder } from 'meshoptimizer'

const [raw, lowpoly, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

const LEGION_CLIPS = [
  'Idle', 'Idle_Combat', 'Walking_D_Skeletons', 'Walking_B', 'Running_A', 'Running_B', 'Running_C',
  'Hit_A', 'Hit_B', 'Death_C_Skeletons', 'Death_A', 'Spawn_Ground_Skeletons',
  'Blocking', 'Block_Hit', 'Block_Attack',
  'Dualwield_Melee_Attack_Slice', '1H_Melee_Attack_Chop',
  '2H_Ranged_Aiming', '2H_Ranged_Shoot', '2H_Ranged_Reload',
  'Spellcasting', 'Spellcast_Shoot', 'Spellcast_Summon', 'Spellcast_Raise',
  'Throw', 'Taunt', 'Dodge_Backward',
]

/** Keep only the named clips (matched on the part after an optional "Armature|" prefix), renamed to that part. */
function disposeAnimation(a) {
  for (const c of a.listChannels()) c.dispose()
  for (const s of a.listSamplers()) s.dispose()
  a.dispose()
}

function keepClips(doc, names, dropNodes = []) {
  for (const a of doc.getRoot().listAnimations()) {
    const short = a.getName().split('|').pop()
    if (!names.includes(short)) {
      disposeAnimation(a)
      continue
    }
    a.setName(short)
    // Channels on IK helpers and other non-deforming controls are dead weight at runtime.
    for (const c of a.listChannels()) {
      const n = c.getTargetNode()
      if (n && dropNodes.some(re => re.test(n.getName()))) {
        const s = c.getSampler()
        c.dispose()
        if (s && !a.listChannels().some(o => o.getSampler() === s)) s.dispose()
      }
    }
  }
}

function dropAnimations(doc) {
  for (const a of doc.getRoot().listAnimations()) disposeAnimation(a)
}

/** Skinned parts that share the skin and material become one primitive (one draw call). */
function joinSkinned(doc) {
  const groups = new Map()
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    const skin = node.getSkin()
    if (!mesh || !skin || mesh.listPrimitives().length !== 1) continue
    const prim = mesh.listPrimitives()[0]
    const key = [doc.getRoot().listSkins().indexOf(skin), doc.getRoot().listMaterials().indexOf(prim.getMaterial()), prim.listSemantics().sort().join(',')].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(node)
  }
  for (const nodes of groups.values()) {
    if (nodes.length < 2) continue
    const prims = nodes.map(n => n.getMesh().listPrimitives()[0])
    const joined = joinPrimitives(prims)
    const mesh = doc.createMesh(nodes[0].getMesh().getName()).addPrimitive(joined)
    for (const n of nodes) {
      const old = n.getMesh()
      n.setMesh(null)
      old.dispose()
    }
    nodes[0].setMesh(mesh).setName(nodes[0].getName() + '_joined')
    for (const n of nodes.slice(1)) n.dispose()
  }
}

/** Re-encode every image as a small PNG (gradient atlases need little resolution). */
async function shrinkImages(doc, size) {
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage()
    if (!img) continue
    const png = await sharp(Buffer.from(img)).resize(size, size, { fit: 'fill' }).png({ compressionLevel: 9, palette: false }).toBuffer()
    t.setImage(new Uint8Array(png)).setMimeType('image/png')
  }
}

function dropMorphs(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    mesh.setWeights([])
    for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) { prim.removeTarget(t); t.dispose() }
  }
}

async function finish(doc, file, { joinMeshes = false, texture = 0, tolerance = 5e-4 } = {}) {
  doc.getRoot().getAsset().generator = 'starfall build-models'
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }))
  if (joinMeshes) joinSkinned(doc)
  if (texture) await shrinkImages(doc, texture)
  const hasMeshes = doc.getRoot().listMeshes().length > 0
  await doc.transform(
    weld(), resample({ tolerance }),
    ...(hasMeshes ? [quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8, quantizationVolume: 'scene' })] : []),
    dedup(), prune({ keepLeaves: true }), unpartition(),
  )
  // Quantization is the only extension the runtime needs.
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName !== 'KHR_mesh_quantization') ext.dispose()
  }
  const p = path.join(out, file)
  await io.write(p, doc)
  console.log(file.padEnd(26), (fs.statSync(p).size / 1024).toFixed(1), 'KB')
}

// ── KayKit Skeletons: four bodies (no clips), one shared clip library, one gear file ──
const BODIES = { rogue: 'Skeleton_Rogue', warrior: 'Skeleton_Warrior', minion: 'Skeleton_Minion', mage: 'Skeleton_Mage' }
for (const [id, src] of Object.entries(BODIES)) {
  const doc = await io.read(path.join(raw, `${src}.glb`))
  dropAnimations(doc)
  await finish(doc, `legion-${id}.glb`, { joinMeshes: true, texture: 256 })
}
{
  const doc = await io.read(path.join(raw, 'Skeleton_Minion.glb'))
  keepClips(doc, LEGION_CLIPS, [/IK/, /^control-/])
  const root = doc.getRoot()
  // Rig only: the meshes, skins and textures go.
  for (const node of root.listNodes()) { node.setMesh(null); node.setSkin(null) }
  for (const m of root.listMeshes()) m.dispose()
  for (const s of root.listSkins()) s.dispose()
  for (const t of root.listTextures()) t.dispose()
  for (const m of root.listMaterials()) m.dispose()
  await finish(doc, 'legion-anims.glb')
}
{
  const GEAR = {
    shield: 'Skeleton_Shield_Large_A', buckler: 'Skeleton_Shield_Small_A', axe: 'Skeleton_Axe', blade: 'Skeleton_Blade',
    crossbow: 'Skeleton_Crossbow', quiver: 'Skeleton_Quiver', staff: 'Skeleton_Staff',
  }
  const doc = new Document()
  doc.createBuffer()
  const scene = doc.createScene('gear')
  for (const [id, src] of Object.entries(GEAR)) {
    const part = await io.read(path.join(raw, `${src}.gltf`))
    const map = mergeDocuments(doc, part)
    const partScene = part.getRoot().listScenes()[0]
    const holder = doc.createNode(id)
    for (const child of partScene.listChildren()) holder.addChild(map.get(child))
    scene.addChild(holder)
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose()
  const buffers = doc.getRoot().listBuffers()
  for (const acc of doc.getRoot().listAccessors()) acc.setBuffer(buffers[0])
  for (const b of buffers.slice(1)) b.dispose()
  doc.getRoot().setDefaultScene(scene)
  await finish(doc, 'legion-gear.glb', { texture: 256 })
}

// ── Bosses ──
async function boss(srcPath, file, clips) {
  const doc = await io.read(srcPath)
  keepClips(doc, clips)
  dropMorphs(doc)
  await finish(doc, file)
}
await boss(path.join(raw, 'RobotExpressive.glb'), 'iron-titan.glb', ['Idle', 'Walking', 'Running', 'Punch', 'Jump', 'Death', 'Dance'])
await boss(path.join(lowpoly, 'dragon.glb'), 'vortex-weaver.glb', ['Flying_Idle', 'Fast_Flying', 'Headbutt', 'Punch', 'HitReact', 'Death', 'Yes'])
await boss(path.join(lowpoly, 'alien_big.glb'), 'plasma-overlord.glb', ['Idle', 'Punch', 'Weapon', 'Wave', 'HitReact', 'Death', 'Duck', 'Yes'])
await boss(path.join(lowpoly, 'ghost_skull.glb'), 'void-stalker.glb', ['Flying_Idle', 'Fast_Flying', 'Headbutt', 'Punch', 'HitReact', 'Death', 'No'])
{
  const doc = await io.read(path.join(lowpoly, 'turret_double.glb'))
  // The kit places its pieces on a grid: bring the turret's root back to the origin.
  for (const n of doc.getRoot().listScenes()[0].listChildren()) n.setTranslation([0, 0, 0])
  await finish(doc, 'sentry-turret.glb')
}
