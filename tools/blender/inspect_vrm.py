import os

import bpy


source = os.environ.get(
    "MIRA_VRM_SOURCE",
    "C:/local/geo-voice-cap/avatar-lab/VRM1_Constraint_Twist_Sample.vrm",
)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

result = bpy.ops.import_scene.vrm(filepath=source)
if "FINISHED" not in result:
    raise RuntimeError(f"VRM import failed: {result}")

print("MIRA_VRM_OBJECTS")
for obj in bpy.context.scene.objects:
    materials = [slot.material.name if slot.material else "<none>" for slot in obj.material_slots]
    shape_keys = list(obj.data.shape_keys.key_blocks.keys()) if obj.type == "MESH" and obj.data.shape_keys else []
    print(
        f"object={obj.name!r} type={obj.type} parent={obj.parent.name if obj.parent else None!r} "
        f"materials={materials!r} shape_keys={shape_keys!r}"
    )

print("MIRA_VRM_MATERIALS")
for material in bpy.data.materials:
    print(f"material={material.name!r} diffuse={tuple(round(value, 4) for value in material.diffuse_color)!r}")
    if material.name in {"Tops_01_CLOTH", "Bottoms_01_CLOTH", "Shoes_01_CLOTH", "Hair_00_HAIR"} and material.node_tree:
        for node in material.node_tree.nodes:
            inputs = {
                socket.name: tuple(round(value, 4) for value in socket.default_value)
                if hasattr(socket.default_value, "__len__") and not isinstance(socket.default_value, str)
                else socket.default_value
                for socket in node.inputs
                if hasattr(socket, "default_value") and socket.name in {"Base Color", "Color", "Alpha"}
            }
            print(f"  node={node.name!r} type={node.bl_idname!r} inputs={inputs!r}")
