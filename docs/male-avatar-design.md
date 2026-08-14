# Male avatar design baseline

## Direction

The male companion is a fully fictional East Asian adult, visually designed for a clean, capable, and concise presence. He shares Mira's semi-realistic rendering language and restrained product palette without reading as a gender-swapped version of her.

Reference assets:

- [`images/male-avatar-turnaround.png`](images/male-avatar-turnaround.png)
- [`images/male-avatar-expressions.png`](images/male-avatar-expressions.png)

## Identity

- Apparent age: 27-32
- Build: lean and lightly athletic, with realistic adult proportions
- Face: defined but approachable jaw, straight brows, warm brown eyes, neutral warm skin
- Hair: short dark brown side part with modest volume; no loose long strands or undercut
- Default presence: attentive, calm, direct, and warm without a permanent smile

## Wardrobe

- Off-white band-collar shirt with a short placket
- Deep teal structured overshirt, worn open, sleeves rolled to the forearms
- Charcoal tapered ankle trousers
- Off-white low-profile sneakers
- One small coral accent inside the placket or on the watch strap
- No logos, tie, decorative straps, jewelry, or military details

Core colors:

| Role | Color |
| --- | --- |
| Overshirt | `#174c53` |
| Base shirt | `#eee9df` |
| Trousers | `#272a2d` |
| Accent | `#d8664f` |
| Hair | `#251d19` |
| Eyes | `#5a3324` |

## VRM requirements

- Preserve a clearly adult head-to-body ratio and shoulder width.
- Keep the hair as a compact silhouette suitable for simple spring-bone groups.
- Build the open overshirt as a skinned garment, not rigid panels attached only to the chest.
- Include `blink`, `blinkLeft`, `blinkRight`, `happy`, `relaxed`, `sad`, `surprised`, `aa`, `ih`, and `ou` expressions.
- Tune smiles to remain restrained below 50 percent expression weight.
- Validate idle, wave, explain, nod, listen, think, talk, and celebrate actions.
- Target 15 MB or less for the delivery VRM and 2K maximum face/hair textures.

## Production decision

The turnaround is the geometry and wardrobe authority. The expression sheet is the face and gesture authority. Later generations may refine rendering quality, but must not silently change the identity, haircut, garment structure, or palette.

## Online prototype

The MVP currently includes `public/avatar/kai.vrm`, a Blender-modified VRoid sample derivative named Kai. It validates the short-hair silhouette, teal/off-white palette, adult male voice treatment, VRM 0.x expressions, gestures, and desktop/mobile framing at low cost. Its anime facial proportions and zip-jacket construction are a temporary implementation; the turnaround above remains the authority for a later higher-detail production mesh.
