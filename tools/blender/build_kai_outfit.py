import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


ARGS = sys.argv[sys.argv.index("--") + 1 :]
STYLE = ARGS[0] if ARGS else "smart"
OUTPUT_DIR = Path(ARGS[1] if len(ARGS) > 1 else "C:/local/geo-voice-cap/public/avatar").resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

PALETTES = {
    "smart": {
        "outer": (0.035, 0.09, 0.16),
        "inner": (0.68, 0.78, 0.82),
        "pants": (0.035, 0.045, 0.055),
        "shoes": (0.16, 0.18, 0.2),
        "accent": (0.3, 0.58, 0.66),
        "title": "Kai - City",
    },
    "weekend": {
        "outer": (0.25, 0.38, 0.33),
        "inner": (0.78, 0.71, 0.6),
        "pants": (0.11, 0.12, 0.11),
        "shoes": (0.8, 0.76, 0.67),
        "accent": (0.55, 0.2, 0.11),
        "bag": (0.12, 0.065, 0.03),
        "title": "Kai - Weekend",
    },
}

if STYLE not in PALETTES:
    raise RuntimeError(f"Unknown outfit style: {STYLE}")


def find_material(suffix):
    return next((material for material in bpy.data.materials if material.name.endswith(suffix)), None)


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


def recolor_top(palette):
    image = base_color_image("Tops_01_CLOTH")
    pixels = read_pixels(image)
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]
    active = alpha > 0.02
    luminance = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    accent = active & (rgb[:, :, 0] > rgb[:, :, 1] * 1.35) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.25)
    y, x = np.indices(luminance.shape)
    visual_y = image.size[1] - 1 - y
    shirt_uv = (x > 610) & (x < 1420) & (visual_y > 430) & (visual_y < 1300)
    inner = active & ~accent & shirt_uv & (luminance > 0.08)
    outer = active & ~accent & ~inner

    outer_shade = shade_from_luminance(luminance, 0.58, 1.3)
    inner_shade = shade_from_luminance(luminance, 0.72, 1.1)
    accent_shade = shade_from_luminance(luminance, 0.7, 1.15)
    rgb[outer] = np.clip(np.array(palette["outer"]) * outer_shade[outer, None], 0.0, 1.0)
    rgb[inner] = np.clip(np.array(palette["inner"]) * inner_shade[inner, None], 0.0, 1.0)
    rgb[accent] = np.clip(np.array(palette["accent"]) * accent_shade[accent, None], 0.0, 1.0)
    write_pixels(image, pixels)


def recolor_uniform(material_suffix, target, minimum=0.65, maximum=1.18):
    image = base_color_image(material_suffix)
    pixels = read_pixels(image)
    rgb = pixels[:, :, :3]
    active = pixels[:, :, 3] > 0.02
    luminance = rgb @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    shade = shade_from_luminance(luminance, minimum, maximum)
    rgb[active] = np.clip(np.array(target) * shade[active, None], 0.0, 1.0)
    write_pixels(image, pixels)


def create_rigid_accessory(name, vertices, faces, color, armature, bone_name):
    mesh = bpy.data.meshes.new(f"{name} Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    accessory = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(accessory)

    material = bpy.data.materials.new(f"{name} Material")
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = 0.78
    accessory.data.materials.append(material)

    accessory.parent = armature
    modifier = accessory.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    group = accessory.vertex_groups.new(name=bone_name)
    group.add(list(range(len(vertices))), 1.0, "REPLACE")
    return accessory


def add_weekend_bag(armature, color):
    front_y = -0.182
    strap_vertices = [
        (-0.2, front_y, 1.42),
        (-0.17, front_y - 0.004, 1.435),
        (0.23, front_y - 0.006, 1.09),
        (0.2, front_y, 1.07),
    ]
    create_rigid_accessory("Weekend Bag Strap", strap_vertices, [(0, 1, 2, 3)], color, armature, "J_Bip_C_UpperChest")

    bpy.ops.mesh.primitive_cube_add(location=(0.18, -0.18, 1.06), scale=(0.085, 0.022, 0.065))
    bag = bpy.context.object
    bag.name = "Weekend Crossbody Bag"
    material = bpy.data.materials.new("Weekend Bag Material")
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1.0)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.82
    bag.data.materials.append(material)
    bevel = bag.modifiers.new("Soft Corners", "BEVEL")
    bevel.width = 0.012
    bevel.segments = 3
    bpy.context.view_layer.objects.active = bag
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bag.parent = armature
    modifier = bag.modifiers.new("Armature", "ARMATURE")
    modifier.object = armature
    group = bag.vertex_groups.new(name="J_Bip_C_Chest")
    group.add(list(range(len(bag.data.vertices))), 1.0, "REPLACE")

    flap_color = tuple(component * 0.72 for component in color)
    bpy.ops.mesh.primitive_cube_add(location=(0.18, -0.207, 1.08), scale=(0.078, 0.008, 0.024))
    flap = bpy.context.object
    flap.name = "Weekend Bag Flap"
    flap_material = bpy.data.materials.new("Weekend Bag Flap Material")
    flap_material.diffuse_color = (*flap_color, 1.0)
    flap_material.use_nodes = True
    flap_material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*flap_color, 1.0)
    flap_material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.86
    flap.data.materials.append(flap_material)
    flap_bevel = flap.modifiers.new("Soft Corners", "BEVEL")
    flap_bevel.width = 0.008
    flap_bevel.segments = 3
    bpy.context.view_layer.objects.active = flap
    bpy.ops.object.modifier_apply(modifier=flap_bevel.name)
    flap.parent = armature
    flap_modifier = flap.modifiers.new("Armature", "ARMATURE")
    flap_modifier.object = armature
    flap_group = flap.vertex_groups.new(name="J_Bip_C_Chest")
    flap_group.add(list(range(len(flap.data.vertices))), 1.0, "REPLACE")


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def set_up_preview(output_path):
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.05, 0.048, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.34

    for location, energy, size, color in [
        ((-3.0, -4.0, 5.0), 1000, 3.2, (1.0, 0.88, 0.76)),
        ((3.2, -2.0, 3.7), 720, 2.7, (0.58, 0.88, 1.0)),
        ((0.0, 2.6, 4.5), 780, 2.4, (1.0, 0.54, 0.4)),
    ]:
        data = bpy.data.lights.new(name="Kai Outfit Light", type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(name="Kai Outfit Light", object_data=data)
        bpy.context.collection.objects.link(light)
        light.location = location
        point_at(light, (0.0, 0.0, 0.95))

    camera_data = bpy.data.cameras.new("Kai Outfit Camera")
    camera = bpy.data.objects.new("Kai Outfit Camera", camera_data)
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
    scene.render.filepath = str(output_path)
    scene.view_settings.look = "Medium High Contrast"
    bpy.ops.render.render(write_still=True)


palette = PALETTES[STYLE]
armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
if not armature:
    raise RuntimeError("Kai armature was not found in the source blend")

recolor_top(palette)
recolor_uniform("Bottoms_01_CLOTH", palette["pants"], 0.7, 1.2)
recolor_uniform("Shoes_01_CLOTH", palette["shoes"], 0.72, 1.08)
if STYLE == "weekend":
    add_weekend_bag(armature, palette["bag"])

meta = armature.data.vrm_addon_extension.vrm0.meta
meta.title = palette["title"]
meta.version = "0.2"
meta.reference = f"Kai {STYLE} outfit; docs/male-avatar-design.md"

blend_path = Path(f"C:/local/geo-voice-cap/avatar-lab/kai-{STYLE}.blend")
vrm_path = OUTPUT_DIR / f"kai-{STYLE}.vrm"
preview_path = OUTPUT_DIR / f"kai-{STYLE}-preview.png"
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.vrm(filepath=str(vrm_path))
set_up_preview(preview_path)

print(
    f"KAI_OUTFIT style={STYLE} vrm={vrm_path.stat().st_size} "
    f"preview={preview_path.stat().st_size}"
)
