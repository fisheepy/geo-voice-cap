import sys
from pathlib import Path

import bpy
from mathutils import Vector


args = sys.argv[sys.argv.index("--") + 1 :]
if len(args) != 2:
    raise RuntimeError("Usage: blender --background --python render_vrm_preview.py -- input.vrm output.png")

source = Path(args[0]).resolve()
output = Path(args[1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.vrm(filepath=str(source))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError(f"No meshes imported from {source}")

minimum = Vector((float("inf"),) * 3)
maximum = Vector((float("-inf"),) * 3)
for mesh in meshes:
    for corner in mesh.bound_box:
        world = mesh.matrix_world @ Vector(corner)
        minimum.x = min(minimum.x, world.x)
        minimum.y = min(minimum.y, world.y)
        minimum.z = min(minimum.z, world.z)
        maximum.x = max(maximum.x, world.x)
        maximum.y = max(maximum.y, world.y)
        maximum.z = max(maximum.z, world.z)

height = maximum.z - minimum.z
center = (minimum + maximum) / 2

world = bpy.context.scene.world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.05, 0.048, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.34

for location, energy, size, color in [
    ((-3.0, -4.0, 5.0), 1000, 3.2, (1.0, 0.88, 0.76)),
    ((3.2, -2.0, 3.7), 720, 2.7, (0.58, 0.88, 1.0)),
    ((0.0, 2.6, 4.5), 780, 2.4, (1.0, 0.54, 0.4)),
]:
    data = bpy.data.lights.new(name="Preview Light", type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name="Preview Light", object_data=data)
    bpy.context.collection.objects.link(light)
    light.location = location
    point_at(light, center)

camera_data = bpy.data.cameras.new("Preview Camera")
camera = bpy.data.objects.new("Preview Camera", camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (center.x, minimum.y - height * 2.4, center.z)
camera.data.lens = 62
point_at(camera, center)
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 720
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(output)
scene.view_settings.look = "Medium High Contrast"
bpy.ops.render.render(write_still=True)

print(f"VRM_PREVIEW source={source} meshes={len(meshes)} height={height:.3f} output={output}")
