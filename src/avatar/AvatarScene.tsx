import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { AvatarModel } from "./AvatarModel";
import type { AvatarCommand } from "./types";

export function AvatarScene({ command, modelUrl }: { command: AvatarCommand; modelUrl?: string }) {
  return (
    <Canvas camera={{ position: [0, 1.25, 4.8], fov: 34 }} dpr={[1, 1.75]} gl={{ antialias: true }}>
      <ambientLight intensity={1.25} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <directionalLight position={[-3, 2, 2]} intensity={0.8} />
      <Suspense fallback={null}>
        <AvatarModel command={command} modelUrl={modelUrl} />
        <Environment preset="studio" />
      </Suspense>
      <OrbitControls target={[0, 0.8, 0]} enablePan={false} minDistance={3.2} maxDistance={7} />
    </Canvas>
  );
}
