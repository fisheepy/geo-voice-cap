import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

from bl_ext.blender_org.mpfb.services import FaceService, ObjectService
from bl_ext.blender_org.mpfb.ui.new_human.randomize.randomizeproperties import RANDOMIZE_PROPERTIES


OUTPUT_DIR = Path(os.environ.get("MIRA_AVATAR_OUTPUT", "C:/local/geo-voice-cap/avatar-lab"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def set_prop(name, value):
    RANDOMIZE_PROPERTIES.set_value(name, value, entity_reference=bpy.context.scene)


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

# Deterministic young-adult prototype. Shape variation is intentionally restrained
# so this first pass evaluates the free asset quality instead of random extremes.
set_prop("seed", 240819)
set_prop("new_random_seed", False)
set_prop("discrete_gender", True)
set_prop("gender_allow_female", True)
set_prop("gender_allow_male", False)
set_prop("discrete_age", True)
for age in ("baby", "child", "middleage", "old"):
    set_prop(f"age_allow_{age}", False)
set_prop("age_allow_young", True)
set_prop("discrete_race", True)
set_prop("race_allow_asian", True)
set_prop("race_allow_caucasian", False)
set_prop("race_allow_african", False)
set_prop("muscle_neutral", 0.42)
set_prop("muscle_deviation", 0.08)
set_prop("weight_neutral", 0.46)
set_prop("weight_deviation", 0.08)
set_prop("height_neutral", 0.52)
set_prop("height_deviation", 0.08)
set_prop("proportions_neutral", 0.52)
set_prop("proportions_deviation", 0.08)
set_prop("randomize_details", True)
set_prop("details_symmetry", True)
set_prop("add_rig", "game_engine")
set_prop("add_subdiv_modifier", True)
set_prop("subdiv_render_levels", 1)
set_prop("randomize_skin", True)
set_prop("match_gender", True)
set_prop("match_age", True)
set_prop("match_race", True)
set_prop("skin_type", "MAKESKIN")
set_prop("eyes_mode", "HIGHPOLY")
set_prop("hair_randomize", True)
set_prop("hair_match_gender", True)
set_prop("hair_include", "long,bob,ponytail")
set_prop("eyebrows_enable", True)
set_prop("eyelashes_enable", True)
set_prop("teeth_enable", True)
set_prop("tongue_enable", True)

# Prefer a single system outfit for the first render and avoid random accessories.
for slot in ("head", "upper_body", "lower_body", "hands", "feet", "underwear", "accessories"):
    set_prop(f"clothes_{slot}_enable", False)
set_prop("clothes_full_body_enable", True)
set_prop("clothes_full_body_chance", 100)
set_prop("clothes_full_body_include_any", "")
set_prop("clothes_full_body_include_female", "female_casualsuit,female_elegantsuit,female_sportsuit")
set_prop("clothes_full_body_include_male", "")

result = bpy.ops.mpfb.create_random_human()
if "FINISHED" not in result:
    raise RuntimeError(f"MPFB character creation failed: {result}")

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if not mesh_objects:
    raise RuntimeError("MPFB returned no mesh objects")

basemesh = next((obj for obj in mesh_objects if ObjectService.object_is_basemesh(obj)), None)
if basemesh is None:
    raise RuntimeError("Could not identify the MPFB base mesh")

# Load the standard 52 ARKit face units. These are the contract the web avatar
# will later use for expressions and audio-driven lip sync.
FaceService.load_targets(
    basemesh,
    load_microsoft_visemes=False,
    load_meta_visemes=False,
    load_arkit_faceunits=True,
)
FaceService.interpolate_targets(basemesh)

# Neutral studio for a fair look test.
world = bpy.context.scene.world
world.color = (0.025, 0.035, 0.04)
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.026, 0.03, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22

for location, energy, size, color in [
    ((-3.2, -4.5, 5.7), 1100, 4.0, (1.0, 0.82, 0.72)),
    ((3.5, -2.2, 4.0), 900, 3.0, (0.55, 0.82, 1.0)),
    ((0.0, 3.5, 5.0), 1200, 3.2, (1.0, 0.42, 0.26)),
]:
    data = bpy.data.lights.new(name="Studio Area", type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name="Studio Area", object_data=data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (math.radians(20), 0, 0)

camera_data = bpy.data.cameras.new("Look Test Camera")
camera = bpy.data.objects.new("Look Test Camera", camera_data)
bpy.context.collection.objects.link(camera)
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "mpfb-mira-prototype.blend"))

# Full-body framing checks silhouette, clothes, hair, and rigged geometry.
camera.location = (0.0, -4.25, 1.12)
camera.data.lens = 58
point_camera(camera, (0.0, 0.0, 0.94))
scene.render.filepath = str(OUTPUT_DIR / "mpfb-mira-full.png")
bpy.ops.render.render(write_still=True)

# A close portrait is the meaningful quality gate for this product.
camera.location = (0.0, -1.62, 1.63)
camera.data.lens = 72
point_camera(camera, (0.0, 0.0, 1.58))
scene.render.filepath = str(OUTPUT_DIR / "mpfb-mira-portrait.png")
bpy.ops.render.render(write_still=True)

# Validate that the face units deform the character, rather than only existing
# as inert export metadata.
smile_values = {
    "mouthSmileLeft": 0.72,
    "mouthSmileRight": 0.72,
    "cheekSquintLeft": 0.36,
    "cheekSquintRight": 0.36,
    "eyeSquintLeft": 0.12,
    "eyeSquintRight": 0.12,
}
for name, value in smile_values.items():
    key = basemesh.data.shape_keys.key_blocks.get(name)
    if key is None:
        raise RuntimeError(f"Missing ARKit face unit: {name}")
    key.value = value
scene.render.filepath = str(OUTPUT_DIR / "mpfb-mira-smile.png")
bpy.ops.render.render(write_still=True)
for name in smile_values:
    basemesh.data.shape_keys.key_blocks[name].value = 0.0

# Export all deforming character objects, excluding the studio setup.
bpy.ops.object.select_all(action="DESELECT")
for obj in mesh_objects + armatures:
    obj.select_set(True)
bpy.context.view_layer.objects.active = armatures[0] if armatures else mesh_objects[0]
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_DIR / "mpfb-mira-prototype.glb"),
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_morph=True,
    export_animations=True,
    export_apply=True,
)

vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
polygons = sum(len(obj.data.polygons) for obj in mesh_objects)
shape_keys = sum(len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0 for obj in mesh_objects)
face_units = sum(1 for name in basemesh.data.shape_keys.key_blocks if name.name in smile_values or name.name.startswith(("eye", "mouth", "jaw", "brow", "cheek", "nose", "tongue")))
print(f"MIRA_PROTOTYPE meshes={len(mesh_objects)} armatures={len(armatures)} vertices={vertices} polygons={polygons} shape_keys={shape_keys} face_units={face_units}")
