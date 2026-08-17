import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


SOURCE = Path(
    os.environ.get(
        "KAI_VRM_SOURCE",
        "C:/local/geo-voice-cap/avatar-lab/AvatarSample_C.vrm",
    )
)
OUTPUT_DIR = Path(os.environ.get("KAI_AVATAR_OUTPUT", "C:/local/geo-voice-cap/avatar-lab"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DEEP_TEAL = np.array((0.025, 0.19, 0.22), dtype=np.float32)
OFF_WHITE = np.array((0.86, 0.82, 0.74), dtype=np.float32)
CHARCOAL = np.array((0.028, 0.032, 0.036), dtype=np.float32)
CORAL = np.array((0.68, 0.15, 0.09), dtype=np.float32)
DARK_BROWN = np.array((0.09, 0.052, 0.036), dtype=np.float32)
WARM_BROWN = np.array((0.24, 0.095, 0.04), dtype=np.float32)


def find_material(suffix):
    return next((material for material in bpy.data.materials if material.name.endswith(suffix)), None)


def find_object_with_material(suffix):
    return next(
        (
            obj
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
            and any(slot.material and slot.material.name.endswith(suffix) for slot in obj.material_slots)
        ),
        None,
    )


def base_color_image(suffix):
    material = find_material(suffix)
    if not material:
        raise RuntimeError(f"Missing material ending in {suffix}")
    extension = getattr(material, "vrm_addon_extension", None)
    mtoon = getattr(extension, "mtoon1", None)
    if not mtoon or not mtoon.enabled:
        raise RuntimeError(f"Material {material.name} is not MToon")
    image = mtoon.pbr_metallic_roughness.base_color_texture.index.source
    if not image:
        raise RuntimeError(f"Material {material.name} has no base color image")
    return image


def read_pixels(image):
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape((height, width, 4))


def write_pixels(image, pixels):
    image.pixels.foreach_set(pixels.reshape(-1))
    image.update()
    image.pack()


def shade_from_luminance(luminance, minimum=0.62, maximum=1.2):
    low = float(np.percentile(luminance, 8))
    high = float(np.percentile(luminance, 94))
    normalized = np.clip((luminance - low) / max(high - low, 0.001), 0.0, 1.0)
    return minimum + normalized * (maximum - minimum)


def recolor_top():
    image = base_color_image("Tops_01_CLOTH")
    pixels = read_pixels(image)
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]
    active = alpha > 0.02
    luminance = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    red = active & (rgb[:, :, 0] > rgb[:, :, 1] * 1.35) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.25)
    y, x = np.indices(luminance.shape)
    visual_y = image.size[1] - 1 - y
    shirt_uv = (x > 610) & (x < 1420) & (visual_y > 430) & (visual_y < 1300)
    light_panel = active & ~red & shirt_uv & (luminance > 0.08)
    dark_panel = active & ~red & ~light_panel

    teal_shade = shade_from_luminance(luminance, 0.58, 1.32)
    white_shade = shade_from_luminance(luminance, 0.72, 1.1)
    coral_shade = shade_from_luminance(luminance, 0.7, 1.15)
    rgb[dark_panel] = np.clip(DEEP_TEAL * teal_shade[dark_panel, None], 0.0, 1.0)
    rgb[light_panel] = np.clip(OFF_WHITE * white_shade[light_panel, None], 0.0, 1.0)
    rgb[red] = np.clip(CORAL * coral_shade[red, None], 0.0, 1.0)
    write_pixels(image, pixels)


def recolor_uniform(material_suffix, target, minimum=0.62, maximum=1.16):
    image = base_color_image(material_suffix)
    pixels = read_pixels(image)
    rgb = pixels[:, :, :3]
    active = pixels[:, :, 3] > 0.02
    luminance = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    shade = shade_from_luminance(luminance, minimum, maximum)
    rgb[active] = np.clip(target * shade[active, None], 0.0, 1.0)
    write_pixels(image, pixels)


def set_mtoon_tint(material_suffix, color):
    material = find_material(material_suffix)
    if not material:
        return
    material.diffuse_color = (*color, 1.0)
    extension = getattr(material, "vrm_addon_extension", None)
    mtoon = getattr(extension, "mtoon1", None)
    if mtoon and mtoon.enabled:
        mtoon.pbr_metallic_roughness.base_color_factor = (*color, 1.0)


def refine_face_eye_scale(face, scale=0.78):
    eye_suffixes = ("EyeIris_00_EYE", "EyeWhite_00_EYE", "EyeHighlight_00_EYE", "FaceEyeline_00_FACE")
    eye_material_indexes = {
        index
        for index, slot in enumerate(face.material_slots)
        if slot.material and any(slot.material.name.endswith(suffix) for suffix in eye_suffixes)
    }
    eye_vertices = {
        vertex_index
        for polygon in face.data.polygons
        if polygon.material_index in eye_material_indexes
        for vertex_index in polygon.vertices
    }
    if not eye_vertices or not face.data.shape_keys:
        raise RuntimeError("Could not find the male VRoid eye geometry and shape keys")

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
            coordinate.z = center.z + (coordinate.z - center.z) * 0.84
            coordinate.y = center.y + (coordinate.y - center.y) * 0.95


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

result = bpy.ops.import_scene.vrm(filepath=str(SOURCE))
if "FINISHED" not in result:
    raise RuntimeError(f"VRM import failed: {result}")

armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
face = find_object_with_material("Face_00_SKIN")
if not armature or not face:
    raise RuntimeError("Expected the AvatarSample_C armature and face mesh")

recolor_top()
recolor_uniform("Bottoms_01_CLOTH", CHARCOAL, 0.7, 1.2)
recolor_uniform("Shoes_01_CLOTH", OFF_WHITE, 0.72, 1.08)
recolor_uniform("Hair_00_HAIR", DARK_BROWN, 0.62, 1.28)
recolor_uniform("EyeIris_00_EYE", WARM_BROWN, 0.5, 1.35)
recolor_uniform("EyeExtra_01_EYE", WARM_BROWN, 0.45, 1.1)
set_mtoon_tint("Face_00_SKIN", (0.94, 0.84, 0.74))
set_mtoon_tint("Body_00_SKIN", (0.94, 0.84, 0.74))
refine_face_eye_scale(face)

# Preserve the official author and permissions while identifying the local
# derivative and linking its current conditions of use.
extension = armature.data.vrm_addon_extension
meta = extension.vrm0.meta
meta.title = "Kai"
meta.version = "0.1"
meta.author = "VRoid Project / local derivative"
meta.reference = "Male companion concept in docs/male-avatar-design.md"
meta.allowed_user_name = "Everyone"
meta.commercial_ussage_name = "Allow"
meta.license_name = "Other"
meta.other_license_url = "https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z"

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_DIR / "kai-clean-prototype.blend"))
bpy.ops.export_scene.vrm(filepath=str(OUTPUT_DIR / "kai-clean-prototype.vrm"))

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.05, 0.048, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.34

for location, energy, size, color in [
    ((-3.0, -4.0, 5.0), 1000, 3.2, (1.0, 0.88, 0.76)),
    ((3.2, -2.0, 3.7), 720, 2.7, (0.58, 0.88, 1.0)),
    ((0.0, 2.6, 4.5), 780, 2.4, (1.0, 0.54, 0.4)),
]:
    data = bpy.data.lights.new(name="Kai Studio Light", type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name="Kai Studio Light", object_data=data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, (0.0, 0.0, 0.95))

camera_data = bpy.data.cameras.new("Kai Look Test Camera")
camera = bpy.data.objects.new("Kai Look Test Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (0.0, -4.2, 1.12)
camera.data.lens = 62
point_at(camera, (0.0, 0.0, 0.88))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(OUTPUT_DIR / "kai-clean-prototype.png")
scene.view_settings.look = "Medium High Contrast"
bpy.ops.render.render(write_still=True)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
vertices = sum(len(obj.data.vertices) for obj in meshes)
shape_keys = sum(len(obj.data.shape_keys.key_blocks) if obj.data.shape_keys else 0 for obj in meshes)
print(
    f"KAI_VRM_CANDIDATE meshes={len(meshes)} vertices={vertices} "
    f"bones={len(armature.data.bones)} shape_keys={shape_keys}"
)
