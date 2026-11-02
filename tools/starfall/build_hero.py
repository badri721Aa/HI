"""
Turns the bare 'low poly boy' .blend into a game-ready, textured GLB:
  * removes scene clutter, IK helper bones and constraints
  * skins the eyes to the head bone and joins them into the body
  * applies one level of subdivision for a cleaner silhouette
  * builds a 3D hair shell with a fringe
  * paints clothing regions (tee + stripe, shorts, belt, socks, sneakers)
  * smart-UV unwraps, bakes procedural albedo + ambient occlusion into one texture
  * exports a single skinned mesh + armature GLB (Y-up, faces +Z)
Usage: python build_hero.py <in.blend> <out.glb> <preview_dir> [--no-subsurf]
"""
import bpy, bmesh, sys, math, os
from collections import defaultdict
from mathutils import Vector, Matrix

SRC, OUT, PREVIEW = sys.argv[1], sys.argv[2], sys.argv[3]
SUBSURF = '--no-subsurf' not in sys.argv
TEX = 1024

bpy.ops.wm.open_mainfile(filepath=SRC)
scene = bpy.context.scene

# ── 1. clean the scene ──────────────────────────────────────────────
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA') or o.name == 'Plane':
        bpy.data.objects.remove(o, do_unlink=True)

rig = bpy.data.objects['metarig']
body = bpy.data.objects['body']
eyes = [bpy.data.objects['Sphere'], bpy.data.objects['Sphere.001']]

for pb in rig.pose.bones:
    for c in list(pb.constraints):
        pb.constraints.remove(c)
    pb.location = (0, 0, 0)
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)

HELPERS = ['shin.L.001', 'thigh.L.001', 'shin.R.001', 'thigh.R.001']
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for n in HELPERS:
    eb = rig.data.edit_bones.get(n)
    if eb:
        rig.data.edit_bones.remove(eb)
bpy.ops.object.mode_set(mode='OBJECT')
for n in HELPERS:
    vg = body.vertex_groups.get(n)
    if vg:
        body.vertex_groups.remove(vg)
rig.data.pose_position = 'POSE'

# ── 2. materials (procedural, baked later) ─────────────────────────
def lin(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)

mw = body.matrix_world.copy()
mw_inv = mw.inverted()

def local_z(world_z):
    return (mw_inv @ Vector((0, -0.3, world_z))).z

def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.8
    return m, nt, bsdf

def noise_mix(nt, color_a, color_b, scale, detail=4.0, rough=0.6, coords='Object'):
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = detail
    nz.inputs['Roughness'].default_value = rough
    nt.links.new(tc.outputs[coords], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = color_a
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = color_b
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    return ramp.outputs['Color'], tc

def band(nt, tc, socket_in, color, z0, z1, axis='Z'):
    """Mix `color` (tuple or socket) over socket_in where object-space axis is within [z0, z1]."""
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = min(z0, z1)
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'
    lt.inputs[1].default_value = max(z0, z1)
    nt.links.new(sep.outputs[axis], gt.inputs[0])
    nt.links.new(sep.outputs[axis], lt.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(gt.outputs[0], mul.inputs[0])
    nt.links.new(lt.outputs[0], mul.inputs[1])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(mul.outputs[0], mix.inputs['Factor'])
    nt.links.new(socket_in, mix.inputs[6])
    if isinstance(color, tuple):
        mix.inputs[7].default_value = color
    else:
        nt.links.new(color, mix.inputs[7])
    return mix.outputs[2]

def tex(nt, a, b, scale, detail=3.0):
    """Extra procedural colour socket sharing nothing with the base chain."""
    out, _ = noise_mix(nt, lin(a), lin(b), scale, detail)
    return out

LZ = local_z
BIG = 1e4

def local_x(world_x):
    return (mw_inv @ Vector((world_x, -0.3, 4.0))).x

def mask(nt, tc, axis, lo, hi):
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = min(lo, hi)
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = max(lo, hi)
    nt.links.new(sep.outputs[axis], gt.inputs[0]); nt.links.new(sep.outputs[axis], lt.inputs[0])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(gt.outputs[0], mul.inputs[0]); nt.links.new(lt.outputs[0], mul.inputs[1])
    return mul.outputs[0]

def mask_and(nt, a, b2):
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(a, mul.inputs[0]); nt.links.new(b2, mul.inputs[1])
    return mul.outputs[0]

def over(nt, socket_in, color, fac):
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(fac, mix.inputs['Factor'])
    nt.links.new(socket_in, mix.inputs[6])
    if isinstance(color, tuple):
        mix.inputs[7].default_value = color
    else:
        nt.links.new(color, mix.inputs[7])
    return mix.outputs[2]

RED = ('#c9432f', '#da5741')
CREAM = ('#ece6d8', '#f6f2e8')
SKIN = ('#e0a580', '#e9b793')
NAVY = ('#27344f', '#33446a')
MATS = {}

def tee(nt, tc, c):
    """Red tee with two cream stripes, applied wherever object Z is above `from_z`."""
    c = band(nt, tc, c, tex(nt, *CREAM, 200.0, 2.0), LZ(4.36), LZ(4.52))
    c = band(nt, tc, c, tex(nt, *CREAM, 200.0, 2.0), LZ(4.60), LZ(4.66))
    return c

# Head: skin
m, nt, b = new_mat('head')
c, tc = noise_mix(nt, lin(SKIN[0]), lin(SKIN[1]), 6.0)
nt.links.new(c, b.inputs['Base Color']); MATS['head'] = m

# Body = torso + legs + feet, painted purely by height so seams between bone regions vanish
m, nt, b = new_mat('body')
c, tc = noise_mix(nt, lin(RED[0]), lin(RED[1]), 260.0, 2.0)
c = tee(nt, tc, c)
collar = mask_and(nt, mask(nt, tc, 'Z', LZ(5.02), BIG), mask(nt, tc, 'X', local_x(-0.40), local_x(0.40)))
c = over(nt, c, tex(nt, *CREAM, 200.0, 2.0), collar)
c = band(nt, tc, c, tex(nt, '#4a2f1c', '#5d3c25', 60.0), LZ(2.97), LZ(3.08))
c = band(nt, tc, c, tex(nt, *NAVY, 180.0), LZ(2.13), LZ(2.97))
c = band(nt, tc, c, tex(nt, *CREAM, 200.0, 2.0), LZ(2.06), LZ(2.13))
c = band(nt, tc, c, tex(nt, *SKIN, 6.0), LZ(0.62), LZ(2.06))
c = band(nt, tc, c, tex(nt, '#ebe7de', '#f7f4ec', 220.0, 2.0), LZ(0.29), LZ(0.62))
c = band(nt, tc, c, lin('#c9432f'), LZ(0.50), LZ(0.56))
c = band(nt, tc, c, tex(nt, '#2a2d35', '#363a44', 90.0), -BIG, LZ(0.29))
c = band(nt, tc, c, lin('#c9432f'), LZ(0.075), LZ(0.105))
c = band(nt, tc, c, lin('#f0ede6'), -BIG, LZ(0.075))
nt.links.new(c, b.inputs['Base Color']); MATS['body'] = m

# Arms: striped short sleeve with cuff, skin below
m, nt, b = new_mat('arm')
c, tc = noise_mix(nt, lin(SKIN[0]), lin(SKIN[1]), 6.0)
c = band(nt, tc, c, tex(nt, *RED, 260.0, 2.0), LZ(4.36), BIG)
c = tee(nt, tc, c)
nt.links.new(c, b.inputs['Base Color']); MATS['arm'] = m

m, nt, b = new_mat('hair')
tc = nt.nodes.new('ShaderNodeTexCoord')
wave = nt.nodes.new('ShaderNodeTexWave')
wave.wave_type = 'BANDS'; wave.bands_direction = 'Z'
wave.inputs['Scale'].default_value = 26.0
wave.inputs['Distortion'].default_value = 6.0
wave.inputs['Detail'].default_value = 3.0
nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = lin('#22140c')
ramp.color_ramp.elements[1].color = lin('#4a2e1c')
nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], b.inputs['Base Color']); MATS['hair'] = m

m, nt, b = new_mat('eye')
b.inputs['Base Color'].default_value = lin('#15100c')
MATS['eye'] = m

ORDER = ['head', 'body', 'arm', 'hair', 'eye']
IDX = {n: i for i, n in enumerate(ORDER)}
body.data.materials.clear()
for n in ORDER:
    body.data.materials.append(MATS[n])

# ── 3. eyes → bigger, skinned to head, joined into body ─────────────
for e in eyes:
    pts = [e.matrix_world @ v.co for v in e.data.vertices]
    c = sum(pts, Vector()) / len(pts)
    e.matrix_world = (Matrix.Translation(c + Vector((0, -0.012, 0.0)))
                      @ Matrix.Scale(1.06, 4)
                      @ Matrix.Translation(-c) @ e.matrix_world)
    e.data.materials.clear()
    for n in ORDER:
        e.data.materials.append(MATS[n])
    for p in e.data.polygons:
        p.material_index = IDX['eye']
        p.use_smooth = True
    vg = e.vertex_groups.new(name='head')
    vg.add([v.index for v in e.data.vertices], 1.0, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for e in eyes:
    e.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()

# ── 4. subdivision (applied under the armature) ─────────────────────
for md in list(body.modifiers):
    if md.type == 'SUBSURF':
        body.modifiers.remove(md)
if SUBSURF:
    sd = body.modifiers.new('subd', 'SUBSURF')
    sd.levels = 1
    sd.render_levels = 1
    sd.quality = 3
    bpy.ops.object.modifier_move_to_index(modifier='subd', index=0)
    bpy.ops.object.modifier_apply(modifier='subd')

# ── 5. assign body-part materials per face ──────────────────────────
bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
dl = bm.verts.layers.deform.active
names = {g.index: g.name for g in body.vertex_groups}

def dominant(face):
    acc = defaultdict(float)
    for v in face.verts:
        for gi, w in v[dl].items():
            acc[gi] += w
    return names.get(max(acc, key=acc.get)) if acc else None

def is_hair(p):
    if abs(p.x) > 0.27 and p.z < 5.86 and p.y < -0.2:
        return False  # keep the ears clear
    if p.z > 5.9:
        return True
    if p.z > 5.8 and abs(p.x) > 0.25:
        return True
    if p.y > -0.34 and p.z > 5.50:
        return True
    return False

PART = {
    'head': 'head', 'neck': 'head',
    'chest': 'body', 'spine': 'body', 'shoulder': 'body', 'hips': 'body',
    'upper_arm': 'arm', 'forearm': 'arm', 'hand': 'arm', 'palm': 'arm',
    'f_index': 'arm', 'f_middle': 'arm', 'f_ring': 'arm', 'f_pinky': 'arm', 'thumb': 'arm',
    'thigh': 'body', 'shin': 'body',
    'foot': 'body', 'toe': 'body',
}

for f in bm.faces:
    if f.material_index == IDX['eye']:
        continue
    g = dominant(f) or 'hips'
    base = g.split('.')[0]
    part = PART.get(base, 'body')
    fp = mw @ f.calc_center_median()
    if part == 'arm' and abs(fp.x) < 0.62 and 3.1 < fp.z < 4.5:
        part = 'body'  # armpit faces read as torso
    if part == 'head' and base == 'head' and is_hair(fp):
        part = 'hair'
    f.material_index = IDX[part]
    if -0.66 < fp.x < -0.42 and 3.3 < fp.z < 4.35 and fp.y > -0.25:
        pass
    f.smooth = True

# ── 6. hair shell with a fringe ─────────────────────────────────────
bm.normal_update()
scale = body.scale.x
thick = 0.075 / scale
scalp = [f for f in bm.faces if f.material_index == IDX['hair']]
ret = bmesh.ops.duplicate(bm, geom=scalp)
shell_f = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMFace)]
shell_v = [g for g in ret['geom'] if isinstance(g, bmesh.types.BMVert)]
vn = {v: v.normal.copy() for v in shell_v}
for v in shell_v:
    v.co += vn[v] * thick
bm.normal_update()
shell_set = set(shell_f)
boundary = [e for f in shell_f for e in f.edges if sum(1 for lf in e.link_faces if lf in shell_set) == 1]
boundary = list(set(boundary))
# fringe: zig-zag the front hairline downward
front = sorted({v for e in boundary for v in e.verts if (mw @ v.co).y < -0.5}, key=lambda v: (mw @ v.co).x)
for i, v in enumerate(front):
    if i % 2 == 0:
        v.co += mw_inv.to_3x3() @ Vector((0, -0.02, -0.075))
head_c = mw_inv @ Vector((0, -0.42, 5.72))
ext = bmesh.ops.extrude_edge_only(bm, edges=boundary)
for g in ext['geom']:
    if isinstance(g, bmesh.types.BMVert):
        d = (head_c - g.co)
        d.normalize()
        g.co += d * thick * 0.95
    elif isinstance(g, bmesh.types.BMFace):
        g.material_index = IDX['hair']
        g.smooth = True
for f in shell_f:
    f.material_index = IDX['hair']
bmesh.ops.recalc_face_normals(bm, faces=list(shell_set) + [g for g in ext['geom'] if isinstance(g, bmesh.types.BMFace)])
bm.to_mesh(body.data)
bm.free()
body.data.update()
for p in body.data.polygons:
    p.use_smooth = True

# ── 7. UV unwrap ────────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
while body.data.uv_layers:
    body.data.uv_layers.remove(body.data.uv_layers[0])
body.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(45), island_margin=0.012, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')

if '--prebake' in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, 'prebake.blend'))
# ── 8. bake albedo + AO ─────────────────────────────────────────────
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.bake.margin = 8
scene.render.bake.margin_type = 'EXTEND'
scene.render.bake.use_clear = True

alb = bpy.data.images.new('hero_albedo', TEX, TEX, alpha=False)
ao = bpy.data.images.new('hero_ao', TEX, TEX, alpha=False)
ao.colorspace_settings.name = 'Non-Color'

def set_target(img):
    for mname in ORDER:
        nt = MATS[mname].node_tree
        node = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage')
        node.name = 'BAKE'
        node.image = img
        nt.nodes.active = node

set_target(alb)
scene.cycles.samples = 4
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})

world = bpy.data.worlds.new('bakeworld')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (1, 1, 1, 1)
set_target(ao)
scene.cycles.samples = 48
scene.world.light_settings.distance = 0.35 / scale
bpy.ops.object.bake(type='AO')

import numpy as np
a = np.array(alb.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
o = np.array(ao.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
occl = o[..., :1]
final = a.copy()
final[..., :3] = a[..., :3] * (0.42 + 0.58 * occl)
final[..., 3] = 1.0
out_img = bpy.data.images.new('hero_tex', TEX, TEX, alpha=False)
out_img.pixels[:] = final.ravel()
out_img.filepath_raw = os.path.join(PREVIEW, 'hero_tex.png')
out_img.file_format = 'PNG'
out_img.save()

# ── 9. single textured material ─────────────────────────────────────
fm = bpy.data.materials.new('Hero')
fm.use_nodes = True
nt = fm.node_tree
b = nt.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.72
tn = nt.nodes.new('ShaderNodeTexImage')
tn.image = out_img
nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
em = bpy.data.materials.new('HeroEye')
em.use_nodes = True
eb = em.node_tree.nodes['Principled BSDF']
eb.inputs['Base Color'].default_value = lin('#120d0a')
eb.inputs['Roughness'].default_value = 0.12
eye_flags = [p.material_index == IDX['eye'] for p in body.data.polygons]
body.data.materials.clear()
body.data.materials.append(fm)
body.data.materials.append(em)
for p, is_eye in zip(body.data.polygons, eye_flags):
    p.material_index = 1 if is_eye else 0
body.data.validate()
# Drop legacy vertex colours (three.js would multiply them into the texture) and render single-sided.
for attr in [a.name for a in body.data.color_attributes]:
    body.data.color_attributes.remove(body.data.color_attributes[attr])
fm.use_backface_culling = True
em.use_backface_culling = True

# ── 10. export ──────────────────────────────────────────────────────
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = rig
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_image_format='JPEG',
    export_image_quality=88,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_vertex_color='NONE',
    export_extras=False,
    export_cameras=False,
    export_lights=False,
)
print('EXPORTED', OUT, os.path.getsize(OUT), 'bytes', 'verts', len(body.data.vertices), 'faces', len(body.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, 'hero_built.blend'))
