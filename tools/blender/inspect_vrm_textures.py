import sys
from pathlib import Path

import bpy


source = sys.argv[sys.argv.index("--") + 1]
args = sys.argv[sys.argv.index("--") + 1 :]
output_dir = Path(args[1]).resolve() if len(args) > 1 else None
if output_dir:
    output_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.vrm(filepath=source)

for material in bpy.data.materials:
    extension = getattr(material, "vrm_addon_extension", None)
    mtoon = getattr(extension, "mtoon1", None)
    image = None
    if mtoon and mtoon.enabled:
        image = mtoon.pbr_metallic_roughness.base_color_texture.index.source
    print(
        "VRM_TEXTURE",
        f"material={material.name!r}",
        f"image={image.name!r}" if image else "image=None",
        f"size={tuple(image.size)!r}" if image else "size=None",
    )
    if image and output_dir:
        image.save_render(str(output_dir / f"{image.name}.png"))

for image in bpy.data.images:
    print("VRM_IMAGE", f"name={image.name!r}", f"size={tuple(image.size)!r}", f"colorspace={image.colorspace_settings.name!r}")
