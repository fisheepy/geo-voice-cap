import { useEffect, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import type { Group } from "three";
import type { AvatarCommand } from "./types";

type Props = {
  command: AvatarCommand;
  modelUrl?: string;
};

function ProceduralAvatar({ command }: { command: AvatarCommand }) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const actionStart = useRef(0);

  useEffect(() => {
    actionStart.current = performance.now() / 1000;
  }, [command.nonce]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const elapsed = t - actionStart.current;
    if (root.current) root.current.position.y = Math.sin(t * 1.5) * 0.015;
    if (!head.current || !arm.current) return;

    head.current.rotation.set(0, 0, 0);
    arm.current.rotation.set(0, 0, -0.15);

    if (command.action === "nod" && elapsed < 1.2) head.current.rotation.x = Math.sin(elapsed * Math.PI * 3) * 0.18;
    if (command.action === "shakeHead" && elapsed < 1.2) head.current.rotation.y = Math.sin(elapsed * Math.PI * 3) * 0.28;
    if (command.action === "wave" && elapsed < 1.8) arm.current.rotation.z = -1.4 + Math.sin(elapsed * 10) * 0.28;
    if (command.action === "talk") head.current.rotation.y = Math.sin(t * 2.1) * 0.04;
  });

  return (
    <group ref={root} position={[0, -1.45, 0]}>
      <mesh position={[0, 1.1, 0]}><capsuleGeometry args={[0.42, 0.9, 8, 16]} /><meshStandardMaterial roughness={0.72} /></mesh>
      <group ref={head} position={[0, 2.05, 0]}>
        <mesh><sphereGeometry args={[0.43, 32, 32]} /><meshStandardMaterial roughness={0.65} /></mesh>
        <mesh position={[-0.14, 0.06, 0.39]}><sphereGeometry args={[0.035, 12, 12]} /><meshStandardMaterial /></mesh>
        <mesh position={[0.14, 0.06, 0.39]}><sphereGeometry args={[0.035, 12, 12]} /><meshStandardMaterial /></mesh>
      </group>
      <group ref={arm} position={[0.48, 1.55, 0]} rotation={[0, 0, -0.15]}>
        <mesh position={[0.38, -0.32, 0]} rotation={[0, 0, -0.55]}><capsuleGeometry args={[0.1, 0.65, 6, 12]} /><meshStandardMaterial roughness={0.72} /></mesh>
      </group>
      <mesh position={[-0.62, 1.25, 0]} rotation={[0, 0, 0.55]}><capsuleGeometry args={[0.1, 0.65, 6, 12]} /><meshStandardMaterial roughness={0.72} /></mesh>
      <mesh position={[-0.2, 0.15, 0]}><capsuleGeometry args={[0.13, 1.05, 6, 12]} /><meshStandardMaterial roughness={0.75} /></mesh>
      <mesh position={[0.2, 0.15, 0]}><capsuleGeometry args={[0.13, 1.05, 6, 12]} /><meshStandardMaterial roughness={0.75} /></mesh>
    </group>
  );
}

function VrmAvatar({ command, modelUrl }: { command: AvatarCommand; modelUrl: string }) {
  const gltf = useLoader(GLTFLoader, modelUrl, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  });
  const vrm = gltf.userData.vrm as VRM | undefined;
  const actionStart = useRef(0);

  useEffect(() => {
    actionStart.current = performance.now() / 1000;
  }, [command.nonce]);

  useEffect(() => {
    if (!vrm) return;
    VRMUtils.rotateVRM0(vrm);
  }, [vrm]);

  useFrame(({ clock }, delta) => {
    if (!vrm) return;
    const t = clock.elapsedTime;
    const elapsed = t - actionStart.current;
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    const upperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
    if (head) {
      head.rotation.x = command.action === "nod" && elapsed < 1.2 ? Math.sin(elapsed * Math.PI * 3) * 0.18 : 0;
      head.rotation.y = command.action === "shakeHead" && elapsed < 1.2 ? Math.sin(elapsed * Math.PI * 3) * 0.28 : Math.sin(t * 0.7) * 0.015;
    }
    if (upperArm) upperArm.rotation.z = command.action === "wave" && elapsed < 1.8 ? -1.4 + Math.sin(elapsed * 10) * 0.25 : 0;
    vrm.expressionManager?.setValue("blink", Math.max(0, Math.sin(t * 0.9) > 0.985 ? 1 : 0));
    vrm.update(delta);
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} position={[0, -1.45, 0]} />;
}

export function AvatarModel({ command, modelUrl }: Props) {
  return modelUrl ? <VrmAvatar command={command} modelUrl={modelUrl} /> : <ProceduralAvatar command={command} />;
}
