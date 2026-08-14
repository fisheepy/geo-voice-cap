# Low-cost avatar pipeline

This pipeline keeps recurring software cost at zero while preserving a path to a higher-detail source model later.

The selected female identity is documented in [`images/mira-turnaround.png`](images/mira-turnaround.png) and [`images/mira-expressions.png`](images/mira-expressions.png). The clean male direction is documented in [`male-avatar-design.md`](male-avatar-design.md), [`images/male-avatar-turnaround.png`](images/male-avatar-turnaround.png), and [`images/male-avatar-expressions.png`](images/male-avatar-expressions.png).

## Authoring stack

1. Create and customize the character in VRoid Studio.
2. Export both the editable `.vroid` source and a VRM 1.0 delivery file.
3. Import the VRM into Blender with the `VRM format` extension only when mesh, material, accessory, or animation edits are needed.
4. Export VRM 1.0 from Blender without applying transforms to the humanoid armature.
5. Use **Customize avatar** in the demo to validate and store the VRM locally.

Installed on the MVP workstation:

- VRoid Studio 2.3.0
- Blender 4.5 LTS
- VRM format extension
- MPFB, retained for rig and topology experiments rather than final visual quality

## Acceptance gates

| Area | MVP target |
| --- | --- |
| Format | VRM 1.0 preferred; VRM 0.x accepted |
| File size | 40 MB target; 64 MB hard application limit |
| Textures | 2K maximum for face/hair; 1K for clothes where practical |
| Humanoid | Head, hands, feet, upper/lower arms available |
| Expressions | Blink, happy, `aa`, `ih`, and `ou` |
| Motion | Idle, nod, wave, talk, listen, think, celebrate |
| Framing | Face readable on a 390 x 844 viewport; feet remain above controls |
| Runtime | No console errors; model persists after reload |

## License record

Keep a small record next to every production source asset with its author, source URL, license, modification permission, redistribution permission, and date acquired. Do not treat a downloadable VRM as redistributable by default.

VRoid Studio presets without special clauses can generally be used commercially under the VRoid Studio guidelines. Third-party clothing, hair, textures, and sample models can carry separate terms and must be reviewed individually.

## Source files

Editable sources and local experiments belong under the ignored `avatar-lab/` directory. Approved delivery assets are copied to `public/avatar/`; their provenance and permissions are recorded in `public/avatar/LICENSE.md`.

Kai's additional outfit variants are generated from the editable local derivative rather than re-imported from the protected delivery VRM:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background avatar-lab\kai-clean-prototype.blend --python tools\blender\build_kai_outfit.py -- smart C:/local/geo-voice-cap/public/avatar
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background avatar-lab\kai-clean-prototype.blend --python tools\blender\build_kai_outfit.py -- weekend C:/local/geo-voice-cap/public/avatar
```
