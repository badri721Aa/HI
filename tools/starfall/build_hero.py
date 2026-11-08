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
                      @ Matrix.Scale(1.05, 4)
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
    if p.z > 5.95:
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
        v.co += mw_inv.to_3x3() @ Vector((0, -0.02, -0.045))
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

# ── 6b. friendlier proportions + face paint ─────────────────────────
# A slightly bigger head reads younger and friendlier. Scale every vertex by its
# 'head' weight around the top of the neck so the neck blends smoothly.
HEAD_SCALE = 1.16
pivot_w = Vector((0, -0.317, 5.404))
pivot = mw_inv @ pivot_w
gi_head = body.vertex_groups['head'].index
for v in body.data.vertices:
    w = 0.0
    for g in v.groups:
        if g.group == gi_head:
            w = g.weight
    if w > 0:
        k = 1 + (HEAD_SCALE - 1) * w
        v.co = pivot + (v.co - pivot) * k
body.data.update()

# Eye centres and radius, measured after scaling (object-local coordinates).
eye_pts = {1: [], -1: []}
for poly in body.data.polygons:
    if poly.material_index != IDX['eye']:
        continue
    for vi in poly.vertices:
        co = body.data.vertices[vi].co
        eye_pts[1 if co.x > 0 else -1].append(co.copy())
eye_c = {k: sum(v, Vector()) / len(v) for k, v in eye_pts.items()}
eye_r = max((co - eye_c[1]).length for co in eye_pts[1])
ecx, ecy, ecz = abs(eye_c[1].x), (eye_c[1].y + eye_c[-1].y) / 2, (eye_c[1].z + eye_c[-1].z) / 2
print('eye centres (local)', tuple(round(x, 3) for x in eye_c[1]), tuple(round(x, 3) for x in eye_c[-1]), 'radius', round(eye_r, 3))

def vmath(nt, op, a, b=None):
    n = nt.nodes.new('ShaderNodeVectorMath')
    n.operation = op
    nt.links.new(a, n.inputs[0])
    if b is not None:
        if isinstance(b, tuple):
            n.inputs[1].default_value = b
        else:
            nt.links.new(b, n.inputs[1])
    return n.outputs['Value'] if op in ('DOT_PRODUCT', 'DISTANCE', 'LENGTH') else n.outputs['Vector']

def smath(nt, op, a, b=None, c=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    for i, x in enumerate((a, b, c)):
        if x is None:
            continue
        if isinstance(x, (int, float)):
            n.inputs[i].default_value = x
        else:
            nt.links.new(x, n.inputs[i])
    return n.outputs[0]

def mirrored_obj(nt):
    """Object coords with |x| so one formula paints both sides of the face."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(smath(nt, 'ABSOLUTE', sep.outputs['X']), comb.inputs['X'])
    nt.links.new(sep.outputs['Y'], comb.inputs['Y'])
    nt.links.new(sep.outputs['Z'], comb.inputs['Z'])
    return comb.outputs['Vector'], sep

def soft_mask(nt, dist, inner, outer):
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(dist, mr.inputs['Value'])
    mr.inputs['From Min'].default_value = inner
    mr.inputs['From Max'].default_value = outer
    mr.inputs['To Min'].default_value = 1.0
    mr.inputs['To Max'].default_value = 0.0
    return mr.outputs['Result']

# Eyes: warm white sclera, brown iris with a lighter inner ring, pupil and a catchlight.
nt = MATS['eye'].node_tree
b = nt.nodes['Principled BSDF']
tc_e = nt.nodes.new('ShaderNodeTexCoord')
sep_e = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc_e.outputs['Object'], sep_e.inputs['Vector'])
sx = smath(nt, 'SIGN', sep_e.outputs['X'])
def comb(xs, y, z):
    n = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(xs, n.inputs['X'])
    n.inputs['Y'].default_value = y
    n.inputs['Z'].default_value = z
    return n.outputs['Vector']
# The two eye meshes aren't exact mirror images, so each eye uses its own measured centre.
mixc = nt.nodes.new('ShaderNodeMix')
mixc.data_type = 'VECTOR'
nt.links.new(smath(nt, 'GREATER_THAN', sep_e.outputs['X'], 0.0), mixc.inputs['Factor'])
mixc.inputs[4].default_value = tuple(eye_c[-1])
mixc.inputs[5].default_value = tuple(eye_c[1])
centre = mixc.outputs[1]
d = vmath(nt, 'NORMALIZE', vmath(nt, 'SUBTRACT', tc_e.outputs['Object'], centre))
# The source model's eye sockets sit slightly to one side of the eyeballs, so a uniform
# sideways correction centres both irises in their openings; a touch downward reads relaxed.
gaze = vmath(nt, 'NORMALIZE', comb(smath(nt, 'MULTIPLY', sx, 0.0), -1.0, -0.07))
gx = nt.nodes.new('ShaderNodeVectorMath')
gx.operation = 'ADD'
nt.links.new(gaze, gx.inputs[0])
gx.inputs[1].default_value = (-0.26, 0.0, 0.0)
gaze = vmath(nt, 'NORMALIZE', gx.outputs['Vector'])
t = vmath(nt, 'DOT_PRODUCT', d, gaze)
hl_dir = Vector((-0.34, -1.0, 0.3)).normalized()
th = vmath(nt, 'DOT_PRODUCT', d, tuple(hl_dir))
def step_at(x, edge, soft=0.004):
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(x, mr.inputs['Value'])
    mr.inputs['From Min'].default_value = edge - soft
    mr.inputs['From Max'].default_value = edge + soft
    return mr.outputs['Result']
col = lin('#f3eee6')
mix_iris = nt.nodes.new('ShaderNodeMix'); mix_iris.data_type = 'RGBA'
nt.links.new(step_at(t, math.cos(math.radians(42))), mix_iris.inputs['Factor'])
mix_iris.inputs[6].default_value = col
mix_iris.inputs[7].default_value = lin('#3a2416')
mix_inner = nt.nodes.new('ShaderNodeMix'); mix_inner.data_type = 'RGBA'
nt.links.new(step_at(t, math.cos(math.radians(34)), 0.012), mix_inner.inputs['Factor'])
nt.links.new(mix_iris.outputs[2], mix_inner.inputs[6])
mix_inner.inputs[7].default_value = lin('#7a4c2a')
mix_pupil = nt.nodes.new('ShaderNodeMix'); mix_pupil.data_type = 'RGBA'
nt.links.new(step_at(t, math.cos(math.radians(18))), mix_pupil.inputs['Factor'])
nt.links.new(mix_inner.outputs[2], mix_pupil.inputs[6])
mix_pupil.inputs[7].default_value = lin('#0d0907')
mix_hl = nt.nodes.new('ShaderNodeMix'); mix_hl.data_type = 'RGBA'
nt.links.new(step_at(th, math.cos(math.radians(6)), 0.002), mix_hl.inputs['Factor'])
nt.links.new(mix_pupil.outputs[2], mix_hl.inputs[6])
mix_hl.inputs[7].default_value = (1, 1, 1, 1)
nt.links.new(mix_hl.outputs[2], b.inputs['Base Color'])

# Face: eyebrows (hair colour, gentle arch) and a hint of warmth on the cheeks.
nt = MATS['head'].node_tree
b = nt.nodes['Principled BSDF']
base = b.inputs['Base Color'].links[0].from_socket
pm, sep = mirrored_obj(nt)
# brow arch just above the eye socket, gently curved: z = ecz + 1.12 r - 0.3 (dx^2 / r)
dx = smath(nt, 'SUBTRACT', smath(nt, 'ABSOLUTE', sep.outputs['X']), ecx)
arch = smath(nt, 'SUBTRACT', ecz + 1.12 * eye_r, smath(nt, 'MULTIPLY', smath(nt, 'POWER', dx, 2.0), 0.3 / eye_r))
brow_d = smath(nt, 'ABSOLUTE', smath(nt, 'SUBTRACT', sep.outputs['Z'], arch))
brow_band = soft_mask(nt, brow_d, 0.09 * eye_r, 0.16 * eye_r)
brow_len = soft_mask(nt, smath(nt, 'ABSOLUTE', smath(nt, 'SUBTRACT', dx, 0.1 * eye_r)), 0.85 * eye_r, 1.05 * eye_r)
brow_front = soft_mask(nt, sep.outputs['Y'], ecy + 0.6 * eye_r, ecy + 1.2 * eye_r)
brow = smath(nt, 'MULTIPLY', smath(nt, 'MULTIPLY', brow_band, brow_len), brow_front)
mix_b = nt.nodes.new('ShaderNodeMix'); mix_b.data_type = 'RGBA'
nt.links.new(brow, mix_b.inputs['Factor'])
nt.links.new(base, mix_b.inputs[6])
mix_b.inputs[7].default_value = lin('#3a2214')
cheek = vmath(nt, 'DISTANCE', pm, (ecx + 0.25 * eye_r, ecy - 0.15 * eye_r, ecz - 1.55 * eye_r))
blush = smath(nt, 'MULTIPLY', soft_mask(nt, cheek, 0.25 * eye_r, 1.15 * eye_r), 0.32)
mix_c = nt.nodes.new('ShaderNodeMix'); mix_c.data_type = 'RGBA'
nt.links.new(blush, mix_c.inputs['Factor'])
nt.links.new(mix_b.outputs[2], mix_c.inputs[6])
mix_c.inputs[7].default_value = lin('#e2847a')
nt.links.new(mix_c.outputs[2], b.inputs['Base Color'])

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
# Mask of eye texels (rasterise the eye faces' UVs) so AO only lightly shades them.
eye_mask = np.zeros((TEX, TEX), dtype=bool)
uvl = body.data.uv_layers.active.data
for poly in body.data.polygons:
    if poly.material_index != IDX['eye']:
        continue
    pts = [(uvl[l].uv.x * TEX, uvl[l].uv.y * TEX) for l in poly.loop_indices]
    xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
    x0, x1 = max(0, int(min(xs)) - 2), min(TEX - 1, int(max(xs)) + 2)
    y0, y1 = max(0, int(min(ys)) - 2), min(TEX - 1, int(max(ys)) + 2)
    eye_mask[y0:y1 + 1, x0:x1 + 1] = True
ao_w = np.where(eye_mask[..., None], 0.2, 0.58).astype(np.float32)
final = a.copy()
final[..., :3] = a[..., :3] * ((1 - ao_w) + ao_w * occl)
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
eb.inputs['Roughness'].default_value = 0.12

# Eyes get their own crisp painted texture, projected straight onto each eyeball from the
# front, so the iris is sharp and sits exactly where we want it in the eye opening.
ET = 256
yy, xx = np.mgrid[0:ET, 0:ET].astype(np.float32)
eu = (xx + 0.5) / ET - 0.5
ev = (yy + 0.5) / ET - 0.5
rr = np.hypot(eu, ev)
ang = np.arctan2(ev, eu)
srgb = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
img = np.empty((ET, ET, 3), dtype=np.float32)
img[:] = srgb('#f4efe8')
IR, PR = 0.25, 0.105
t = np.clip((rr - PR) / (IR - PR), 0, 1)[..., None]
streak = (0.5 + 0.5 * np.sin(ang * 23.0) * np.sin(ang * 7.0 + 1.3))[..., None]
iris = srgb('#9a6a3c') * (1 - t) + srgb('#4a2c18') * t
iris = iris * (0.86 + 0.14 * streak)
ring = np.clip((rr - (IR - 0.03)) / 0.03, 0, 1)[..., None]
iris = iris * (1 - 0.55 * ring)
edge = np.clip((IR + 0.006 - rr) / 0.012, 0, 1)[..., None]
img = img * (1 - edge) + iris * edge
pup = np.clip((PR + 0.006 - rr) / 0.012, 0, 1)[..., None]
img = img * (1 - pup) + srgb('#0c0806') * pup
for hx, hy, hr in ((-0.075, 0.085, 0.05), (0.07, -0.06, 0.022)):
    hd = np.hypot(eu - hx, ev - hy)
    hm = np.clip((hr - hd) / 0.01, 0, 1)[..., None]
    img = img * (1 - hm) + np.float32(1.0) * hm
eye_img = bpy.data.images.new('hero_eye', ET, ET, alpha=False)
eye_px = np.ones((ET, ET, 4), dtype=np.float32)
eye_px[..., :3] = img
eye_img.pixels[:] = eye_px.ravel()
eye_img.pack()
etn = em.node_tree.nodes.new('ShaderNodeTexImage')
etn.image = eye_img
em.node_tree.links.new(etn.outputs['Color'], eb.inputs['Base Color'])

# Front projection per eye. The source sockets sit slightly off-centre on the eyeballs, so
# the iris is nudged to sit in the middle of each opening (and a touch low: relaxed look).
IRIS_SHIFT_U, IRIS_SHIFT_V = 0.025, 0.03
uvl = body.data.uv_layers.active.data
for poly in body.data.polygons:
    if poly.material_index != IDX['eye']:
        continue
    side = 1 if poly.center.x > 0 else -1
    c = eye_c[side]
    for li in poly.loop_indices:
        co = body.data.vertices[body.data.loops[li].vertex_index].co
        uvl[li].uv = (0.5 + (co.x - c.x) / (2 * eye_r) + IRIS_SHIFT_U, 0.5 + (co.z - c.z) / (2 * eye_r) + IRIS_SHIFT_V)
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
