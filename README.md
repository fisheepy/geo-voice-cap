# Avatar Companion

Mobile-first 3D avatar foundation built with React, Capacitor, Three.js, React Three Fiber, and VRM.

## Current milestone

The original geo voice memo/map prototype has been retired. The app now focuses on an extensible avatar runtime with a clean behavior boundary.

Implemented foundation:

- full-screen mobile 3D stage
- procedural fallback humanoid so the project can render before a production model is selected
- optional VRM loading path via `@pixiv/three-vrm`
- normalized avatar commands: `idle`, `wave`, `nod`, `shakeHead`, `talk`
- procedural idle motion and blinking foundation
- mobile orbit/zoom controls
- behavior types separated from rendering so voice and AI can be added without coupling them to bones

## Run

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npx cap sync ios
```

## VRM model

`AvatarScene` accepts an optional `modelUrl`. When omitted, the procedural fallback avatar is rendered. A production `.vrm` asset can be placed under `public/avatar/` and passed to the scene, for example `/avatar/companion.vrm`.

Do not commit a third-party VRM unless its license permits redistribution.

## Roadmap

1. Select and integrate a production VRM model.
2. Add retargetable animation clips and an animation state machine.
3. Add facial expression, gaze, and improved procedural motion.
4. Add realtime voice input/output and viseme-based lip sync.
5. Add an AI behavior planner that emits semantic actions and emotions rather than bone rotations.
