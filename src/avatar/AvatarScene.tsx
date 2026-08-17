import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, OrbitControls } from "@react-three/drei";
import { AvatarModel } from "./AvatarModel";
import type { AvatarCommand } from "./types";

export function AvatarScene({ command, modelUrl, onReady }: { command: AvatarCommand; modelUrl?: string; onReady?: () => void }) {
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  const cameraTargetY = compact ? 0.25 : 0.65;
  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.32, compact ? 6.25 : 5.4], fov: compact ? 31 : 30 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={1.4} />
      <spotLight castShadow position={[3.5, 6, 4]} angle={0.45} penumbra={0.7} intensity={65} color="#fff6e8" />
      <pointLight position={[-3, 2.5, 2]} intensity={15} color="#69d8c4" />
      <pointLight position={[2.5, 1, -2]} intensity={10} color="#ff9f80" />
      <Suspense fallback={null}>
        <AvatarModel command={command} modelUrl={modelUrl} onReady={onReady} />
      </Suspense>
      <Suspense fallback={null}>
        <ContactShadows position={[0, -1.46, 0]} opacity={0.38} scale={4.5} blur={2.8} far={4} />
        <Environment preset="apartment" environmentIntensity={0.55} />
      </Suspense>
      <OrbitControls
        target={[0, cameraTargetY, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        minDistance={4.2}
        maxDistance={6.6}
        minPolarAngle={Math.PI * 0.37}
        maxPolarAngle={Math.PI * 0.58}
        minAzimuthAngle={-0.62}
        maxAzimuthAngle={0.62}
      />
    </Canvas>
  );
}
