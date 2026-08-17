import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


SOURCE = Path(
    os.environ.get(
        "MIRA_VRM_SOURCE",
        "C:/local/geo-voice-cap/avatar-lab/VRM1_Constraint_Twist_Sample.vrm",
    )
)
OUTPUT_DIR = Path(os.environ.get("MIRA_AVATAR_OUTPUT", "C:/local/geo-voice-cap/avatar-lab"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def create_material(name, color, roughness=0.66):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    return material


def set_mtoon_tint(material_name, color):
    material = bpy.data.materials.get(material_name)
    if not material:
        return
    material.diffuse_color = (*color, 1.0)
    extension = getattr(material, "vrm_addon_extension", None)
    mtoon = getattr(extension, "mtoon1", None)
    if mtoon and mtoon.enabled:
        mtoon.pbr_metallic_roughness.base_color_factor = (*color, 1.0)


def replace_material_slot(obj, old_name, replacement):
    for index, slot in enumerate(obj.material_slots):
        if slot.material and slot.material.name == old_name:
            obj.data.materials[index] = replacement


def weight_to_bone(obj, armature, bone_name):
    group = obj.vertex_groups.new(name=bone_name)
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    modifier = obj.modifiers.new(name="Mira Armature", type="ARMATURE")
    modifier.object = armature
    obj.parent = armature


def create_bone_segment(name, armature, bone_name, radius_top, radius_bottom, material, overlap=0.035):
    bone = armature.data.bones.get(bone_name)
    if not bone:
        raise RuntimeError(f"Missing required bone: {bone_name}")
    start = Vector(bone.head_local)
    end = Vector(bone.tail_local)
    direction = end - start
    length = direction.length + overlap
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cone_add(
        vertices=32,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=length,
        end_fill_type="NGON",
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, bone_name)
    bevel = obj.modifiers.new(name="Soft tailoring", type="BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_panel(name, vertices, material, armature, bone_name="J_Bip_C_Hips"):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, bone_name)
    solidify = obj.modifiers.new(name="Tailored thickness", type="SOLIDIFY")
    solidify.thickness = 0.012
    solidify.offset = 0.0
    bevel = obj.modifiers.new(name="Soft edge", type="BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    return obj


def create_front_strip(name, start, end, width, material, armature, bone_name):
    """Create a flat tailored strip facing the character's front (-Y)."""
    start = Vector((start[0], start[2]))
    end = Vector((end[0], end[2]))
    perpendicular = Vector((-(end - start).y, (end - start).x)).normalized() * width / 2
    points = [start + perpendicular, start - perpendicular, end - perpendicular, end + perpendicular]
    vertices = [(point.x, -0.151, point.y) for point in points]
    return create_panel(name, vertices, material, armature, bone_name)


def create_wrap_skirt(name, material, armature):
    segments = 56
    start_angle = -math.pi / 2 + 0.24
    end_angle = 3 * math.pi / 2 - 0.24
    vertices = []
    for index in range(segments + 1):
        progress = index / segments
        angle = start_angle + (end_angle - start_angle) * progress
        vertices.append((0.185 * math.cos(angle), 0.102 * math.sin(angle), 0.90))
    for index in range(segments + 1):
        progress = index / segments
        angle = start_angle + (end_angle - start_angle) * progress
        lower_z = 0.49 + 0.13 * progress
        vertices.append((0.235 * math.cos(angle), 0.128 * math.sin(angle), lower_z))
    faces = []
    row = segments + 1
    for index in range(segments):
        faces.append((index, index + 1, row + index + 1, row + index))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, "J_Bip_C_Hips")
    solidify = obj.modifiers.new(name="Tailored thickness", type="SOLIDIFY")
    solidify.thickness = 0.009
    solidify.offset = 0.0
    bevel = obj.modifiers.new(name="Soft hem", type="BEVEL")
    bevel.width = 0.004
    bevel.segments = 2
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_waist_band(material, armature):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.205, depth=0.072, location=(0.0, 0.0, 0.90))
    obj = bpy.context.object
    obj.name = "Mira Waist Band"
    obj.scale.y = 0.55
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, "J_Bip_C_Hips")
    bevel = obj.modifiers.new(name="Soft waist edge", type="BEVEL")
    bevel.width = 0.008
    bevel.segments = 3
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_box(name, location, scale, material, armature, bone_name="J_Bip_C_Hips"):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, bone_name)
    bevel = obj.modifiers.new(name="Tailored edge", type="BEVEL")
    bevel.width = min(scale) * 0.3
    bevel.segments = 3
    return obj


def create_buckle(material, armature):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.022,
        minor_radius=0.0045,
        major_segments=24,
        minor_segments=8,
        location=(0.095, -0.17, 0.895),
        rotation=(math.pi / 2, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = "Mira Belt Buckle"
    obj.scale.x = 0.82
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    weight_to_bone(obj, armature, "J_Bip_C_Hips")
    return obj


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def refine_face_eye_scale(face, scale=0.82):
    eye_materials = {"EyeIris_00_EYE", "EyeWhite_00_EYE", "EyeHighlight_00_EYE", "FaceEyeline_00_FACE"}
    eye_material_indexes = {
        index
        for index, slot in enumerate(face.material_slots)
        if slot.material and slot.material.name in eye_materials
    }
    eye_vertices = {
        vertex_index
        for polygon in face.data.polygons
        if polygon.material_index in eye_material_indexes
        for vertex_index in polygon.vertices
    }
    if not eye_vertices or not face.data.shape_keys:
        raise RuntimeError("Could not find the VRoid eye geometry and its shape keys")

    basis = face.data.shape_keys.key_blocks["Basis"]
    centers = {}
    for side in (-1, 1):
        side_vertices = [index for index in eye_vertices if (basis.data[index].co.x < 0) == (side < 0)]
        centers[side] = sum((basis.data[index].co for index in side_vertices), Vector()) / len(side_vertices)

    for key_block in face.data.shape_keys.key_blocks:
        for vertex_index in eye_vertices:
            coordinate = key_block.data[vertex_index].co
            center = centers[-1 if basis.data[vertex_index].co.x < 0 else 1]
            coordinate.x = center.x + (coordinate.x - center.x) * scale
            coordinate.z = center.z + (coordinate.z - center.z) * scale
            coordinate.y = center.y + (coordinate.y - center.y) * 0.94


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

result = bpy.ops.import_scene.vrm(filepath=str(SOURCE))
if "FINISHED" not in result:
    raise RuntimeError(f"VRM import failed: {result}")

armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
body = bpy.data.objects.get("Body")
face = bpy.data.objects.get("Face")
if not armature or not body or not face:
    raise RuntimeError("Expected VRoid armature and Body mesh were not imported")

# Retain the authored face and hair textures while moving their palette closer
# to the approved semi-realistic concept.
set_mtoon_tint("Hair_00_HAIR", (0.29, 0.16, 0.10))
set_mtoon_tint("HairBack_00_HAIR", (0.29, 0.16, 0.10))
set_mtoon_tint("EyeIris_00_EYE", (0.48, 0.25, 0.10))
set_mtoon_tint("Body_00_SKIN", (0.94, 0.80, 0.68))
set_mtoon_tint("Face_00_SKIN", (0.94, 0.80, 0.68))
refine_face_eye_scale(face)

off_white = create_material("Mira Off White", (0.70, 0.67, 0.61), 0.74)
charcoal = create_material("Mira Charcoal", (0.007, 0.010, 0.011), 0.7)
deep_teal = create_material("Mira Deep Teal", (0.008, 0.055, 0.05), 0.72)
coral = create_material("Mira Coral", (0.92, 0.24, 0.16), 0.58)
soft_gold = create_material("Mira Soft Gold", (0.56, 0.39, 0.16), 0.5)
skin_overlay = bpy.data.materials.get("Face_00_SKIN")
if not skin_overlay:
    raise RuntimeError("Expected face skin material was not imported")

replace_material_slot(body, "Tops_01_CLOTH", off_white)
replace_material_slot(body, "Shoes_01_CLOTH", off_white)
replace_material_slot(body, "Bottoms_01_CLOTH", charcoal)

hair = bpy.data.objects.get("Hair")
if hair:
    # Compress only the hanging section so the crown and face-framing strands
    # stay intact while the silhouette moves from waist-length to shoulder-length.
    for vertex in hair.data.vertices:
        if vertex.co.z < 1.45:
            vertex.co.z = 1.45 - (1.45 - vertex.co.z) * 0.54

# Tapered trouser segments follow the existing VRM leg bones. The slight
# overlap prevents gaps at the knees during the limited MVP motion set.
for side, prefix in (("L", "Left"), ("R", "Right")):
    create_bone_segment(
        f"Mira {prefix} Trouser Upper",
        armature,
        f"J_Bip_{side}_UpperLeg",
        0.105,
        0.09,
        charcoal,
        overlap=0.06,
    )
    create_bone_segment(
        f"Mira {prefix} Trouser Lower",
        armature,
        f"J_Bip_{side}_LowerLeg",
        0.088,
        0.068,
        charcoal,
        overlap=0.055,
    )

# Waist structure and an oval, open-front asymmetric wrap mirror the approved
# silhouette without creating a rigid rectangular shell around the hips.
create_waist_band(charcoal, armature)
create_wrap_skirt("Mira Asymmetric Wrap", deep_teal, armature)

# The base sample has a round T-shirt neck. A shallow skin inset and layered
# trim establish the approved wrap-blouse silhouette without altering any face
# shape keys or the humanoid rig.
create_panel(
    "Mira V Neck",
    [(-0.092, -0.148, 1.325), (0.092, -0.148, 1.325), (0.0, -0.162, 1.185)],
    skin_overlay,
    armature,
    "J_Bip_C_UpperChest",
)
create_front_strip(
    "Mira Left Neck Trim",
    (-0.102, 0.0, 1.327),
    (0.0, 0.0, 1.175),
    0.022,
    deep_teal,
    armature,
    "J_Bip_C_UpperChest",
)
create_front_strip(
    "Mira Right Neck Trim",
    (0.102, 0.0, 1.327),
    (0.0, 0.0, 1.175),
    0.022,
    deep_teal,
    armature,
    "J_Bip_C_UpperChest",
)
create_front_strip(
    "Mira Collar Accent",
    (0.114, 0.0, 1.319),
    (0.038, 0.0, 1.205),
    0.013,
    coral,
    armature,
    "J_Bip_C_UpperChest",
)

# Front-facing details remain readable even when the original top overlaps the
# oval band at the waist.
create_box("Mira Belt Front", (0.0, -0.145, 0.895), (0.19, 0.014, 0.038), charcoal, armature)
create_buckle(soft_gold, armature)
create_box("Mira Coral Accent", (0.095, -0.17, 0.805), (0.009, 0.006, 0.067), coral, armature)

# Preserve pixiv's base copyright metadata and identify this local derivative.
vrm1 = armature.data.vrm_addon_extension.vrm1
vrm1.meta.vrm_name = "Mira"
vrm1.meta.version = "0.1"

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "mira-semi-realistic-v01.blend"))

# Export before adding the studio camera and lights so they cannot leak into the
# delivery file.
bpy.ops.export_scene.vrm(filepath=str(OUTPUT_DIR / "mira-semi-realistic-v01.vrm"))

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.05, 0.048, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

for location, energy, size, color in [
    ((-3.0, -4.0, 5.0), 950, 3.2, (1.0, 0.86, 0.74)),
    ((3.0, -2.0, 3.6), 750, 2.8, (0.58, 0.88, 1.0)),
    ((0.0, 2.5, 4.4), 850, 2.4, (1.0, 0.52, 0.38)),
]:
    data = bpy.data.lights.new(name="Mira Studio Light", type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name="Mira Studio Light", object_data=data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_camera(light, (0.0, 0.0, 1.05))

camera_data = bpy.data.cameras.new("Mira Look Test Camera")
camera = bpy.data.objects.new("Mira Look Test Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.0, -4.2, 1.18)
camera.data.lens = 62
point_camera(camera, (0.0, 0.0, 0.88))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUTPUT_DIR / "mira-semi-realistic-v01.png")
scene.view_settings.look = "Medium High Contrast"
bpy.ops.render.render(write_still=True)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
vertices = sum(len(obj.data.vertices) for obj in meshes)
shape_keys = sum(len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0 for obj in meshes)
print(
    f"MIRA_VRM_CANDIDATE meshes={len(meshes)} vertices={vertices} "
    f"bones={len(armature.data.bones)} shape_keys={shape_keys}"
)
