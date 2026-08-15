import { Component, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Box3, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { AvatarCommand } from "./types";

type Props = { command: AvatarCommand; modelUrl?: string; onReady?: () => void };

const palette = {
  skin: "#d7a07e",
  skinLight: "#edbea0",
  hair: "#27242b",
  suit: "#e7ddd1",
  suitDark: "#263b3a",
  accent: "#ef7059",
  eye: "#25262b",
};

function ProceduralAvatar({ command, onReady }: { command: AvatarCommand; onReady?: () => void }) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftForearm = useRef<Group>(null);
  const rightForearm = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);
  const actionStart = useRef(0);
  const lastNonce = useRef(-1);

  useEffect(() => onReady?.(), [onReady]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (lastNonce.current !== command.nonce) {
      lastNonce.current = command.nonce;
      actionStart.current = t;
    }
    const elapsed = t - actionStart.current;
    const damp = (current: number, target: number, speed = 8) => MathUtils.damp(current, target, speed, delta);
    if (!root.current || !torso.current || !head.current || !leftArm.current || !rightArm.current || !leftForearm.current || !rightForearm.current) return;

    root.current.position.y = -1.42 + Math.sin(t * 1.45) * 0.012;
    torso.current.rotation.z = damp(torso.current.rotation.z, Math.sin(t * 0.8) * 0.012, 4);

    let headX = Math.sin(t * 0.72) * 0.012;
    let headY = Math.sin(t * 0.48) * 0.025;
    let headZ = 0;
    let rightArmZ = -0.12;
    let rightArmX = 0;
    let rightForearmZ = -0.18;
    let leftArmZ = 0.12;
    const leftArmX = 0;
    let leftForearmZ = 0.18;

    if (command.action === "nod" && elapsed < 1.5) headX += Math.sin(elapsed * Math.PI * 3.2) * 0.18;
    if (command.action === "shakeHead" && elapsed < 1.5) headY += Math.sin(elapsed * Math.PI * 3.2) * 0.3;
    if (command.action === "thinking") {
      headZ = -0.08;
      headY = -0.13;
      rightArmZ = -0.78;
      rightArmX = -0.34;
      rightForearmZ = -1.56;
    }
    if (command.action === "listening") {
      headZ = 0.07;
      headY = 0.07;
      leftArmZ = 0.18;
      rightArmZ = -0.18;
    }
    if (command.action === "wave" && elapsed < 2.4) {
      rightArmZ = -1.24;
      rightArmX = -0.1;
      rightForearmZ = -0.85 + Math.sin(elapsed * 9) * 0.24;
    }
    if (command.action === "talk") {
      rightArmZ = -0.44 + Math.sin(t * 1.7) * 0.1;
      rightForearmZ = -0.72 + Math.sin(t * 2.1) * 0.12;
      leftArmZ = 0.32 + Math.sin(t * 1.5) * 0.08;
      leftForearmZ = 0.42;
      headY += Math.sin(t * 1.7) * 0.025;
    }
    if (command.action === "explain") {
      rightArmZ = -0.68 + Math.sin(t * 1.7) * 0.06;
      rightForearmZ = -1.02 + Math.sin(t * 2.2) * 0.08;
      leftArmZ = 0.2;
      leftForearmZ = 0.28;
      headY += 0.04;
    }
    if (command.action === "comfort") {
      headZ = 0.07;
      headY = 0.08;
      rightArmZ = -0.3;
      rightForearmZ = -0.54;
      leftArmZ = 0.3;
      leftForearmZ = 0.54;
    }
    if (command.action === "celebrate" && elapsed < 2.7) {
      rightArmZ = -1.72;
      leftArmZ = 1.72;
      rightForearmZ = -0.16;
      leftForearmZ = 0.16;
      headZ = Math.sin(elapsed * 5) * 0.035;
      root.current.position.y += Math.abs(Math.sin(elapsed * 4.5)) * 0.055;
    }

    head.current.rotation.x = damp(head.current.rotation.x, headX);
    head.current.rotation.y = damp(head.current.rotation.y, headY);
    head.current.rotation.z = damp(head.current.rotation.z, headZ);
    rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rightArmX);
    rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rightArmZ);
    leftArm.current.rotation.x = damp(leftArm.current.rotation.x, leftArmX);
    leftArm.current.rotation.z = damp(leftArm.current.rotation.z, leftArmZ);
    rightForearm.current.rotation.z = damp(rightForearm.current.rotation.z, rightForearmZ);
    leftForearm.current.rotation.z = damp(leftForearm.current.rotation.z, leftForearmZ);

    const blinkCycle = t % 4.6;
    const blink = blinkCycle > 4.45 ? Math.max(0.08, Math.abs(blinkCycle - 4.525) * 12) : 1;
    if (leftEye.current && rightEye.current) {
      leftEye.current.scale.y = blink;
      rightEye.current.scale.y = blink;
    }
    if (mouth.current) {
      const talking = command.speaking ? 0.8 + Math.sin(t * 13) * 0.45 : command.emotion === "happy" || command.emotion === "excited" ? 0.32 : command.emotion === "surprised" ? 0.48 : 0.16;
      mouth.current.scale.y = damp(mouth.current.scale.y, talking, 14);
      const material = mouth.current.material as MeshStandardMaterial;
      material.color.set(command.emotion === "happy" || command.emotion === "excited" ? "#8e443f" : "#6e4541");
    }
  });

  return (
    <group ref={root} position={[0, -1.42, 0]} rotation={[0, -0.04, 0]}>
      <group ref={torso}>
        <mesh castShadow position={[0, 1.33, 0]} scale={[0.86, 1, 0.62]}>
          <capsuleGeometry args={[0.42, 0.72, 12, 32]} />
          <meshStandardMaterial color={palette.suit} roughness={0.72} metalness={0.03} />
        </mesh>
        <mesh castShadow position={[0, 1.44, 0.39]} scale={[0.62, 0.8, 0.08]}>
          <capsuleGeometry args={[0.27, 0.55, 8, 24]} />
          <meshStandardMaterial color={palette.suitDark} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.72, 0.46]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.1, 0.025, 10, 28]} />
          <meshStandardMaterial color={palette.accent} emissive={palette.accent} emissiveIntensity={0.22} />
        </mesh>
      </group>

      <group ref={head} position={[0, 2.27, 0.02]}>
        <mesh castShadow scale={[0.9, 1.04, 0.87]}>
          <sphereGeometry args={[0.47, 48, 48]} />
          <meshStandardMaterial color={palette.skinLight} roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 0.19, -0.11]} scale={[1.01, 0.65, 0.95]}>
          <sphereGeometry args={[0.49, 48, 48, 0, Math.PI * 2, 0, Math.PI * 0.64]} />
          <meshStandardMaterial color={palette.hair} roughness={0.54} />
        </mesh>
        <mesh castShadow position={[-0.39, -0.02, -0.08]} rotation={[0.08, 0, 0.17]} scale={[0.42, 1.08, 0.54]}>
          <capsuleGeometry args={[0.16, 0.58, 8, 22]} />
          <meshStandardMaterial color={palette.hair} roughness={0.54} />
        </mesh>
        <mesh castShadow position={[0.39, -0.02, -0.08]} rotation={[0.08, 0, -0.17]} scale={[0.42, 1.08, 0.54]}>
          <capsuleGeometry args={[0.16, 0.58, 8, 22]} />
          <meshStandardMaterial color={palette.hair} roughness={0.54} />
        </mesh>
        <mesh ref={leftEye} position={[-0.15, 0.025, 0.421]} scale={[1.2, 1, 0.55]}>
          <sphereGeometry args={[0.038, 18, 18]} />
          <meshStandardMaterial color={palette.eye} roughness={0.38} />
        </mesh>
        <mesh ref={rightEye} position={[0.15, 0.025, 0.421]} scale={[1.2, 1, 0.55]}>
          <sphereGeometry args={[0.038, 18, 18]} />
          <meshStandardMaterial color={palette.eye} roughness={0.38} />
        </mesh>
        <mesh position={[-0.15, 0.105, 0.417]} rotation={[0, 0, -0.08]} scale={[1.5, 0.36, 0.35]}>
          <capsuleGeometry args={[0.026, 0.09, 6, 14]} />
          <meshStandardMaterial color={palette.hair} />
        </mesh>
        <mesh position={[0.15, 0.105, 0.417]} rotation={[0, 0, 0.08]} scale={[1.5, 0.36, 0.35]}>
          <capsuleGeometry args={[0.026, 0.09, 6, 14]} />
          <meshStandardMaterial color={palette.hair} />
        </mesh>
        <mesh ref={mouth} position={[0, -0.175, 0.436]} scale={[1.8, 0.22, 0.45]}>
          <sphereGeometry args={[0.055, 20, 20]} />
          <meshStandardMaterial color="#7b4641" roughness={0.5} />
        </mesh>
        <mesh position={[-0.27, -0.11, 0.395]} scale={[1.8, 0.62, 0.2]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color="#dc806f" transparent opacity={0.3} />
        </mesh>
        <mesh position={[0.27, -0.11, 0.395]} scale={[1.8, 0.62, 0.2]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color="#dc806f" transparent opacity={0.3} />
        </mesh>
      </group>

      <group ref={rightArm} position={[0.5, 1.62, 0]} rotation={[0, 0, -0.12]}>
        <mesh castShadow position={[0.23, -0.3, 0]} rotation={[0, 0, -0.08]}><capsuleGeometry args={[0.105, 0.48, 8, 20]} /><meshStandardMaterial color={palette.suit} roughness={0.72} /></mesh>
        <group ref={rightForearm} position={[0.27, -0.58, 0]} rotation={[0, 0, -0.18]}>
          <mesh castShadow position={[0.17, -0.25, 0]}><capsuleGeometry args={[0.09, 0.4, 8, 20]} /><meshStandardMaterial color={palette.skin} roughness={0.78} /></mesh>
          <mesh castShadow position={[0.18, -0.53, 0]}><sphereGeometry args={[0.12, 20, 20]} /><meshStandardMaterial color={palette.skinLight} roughness={0.78} /></mesh>
        </group>
      </group>
      <group ref={leftArm} position={[-0.5, 1.62, 0]} rotation={[0, 0, 0.12]}>
        <mesh castShadow position={[-0.23, -0.3, 0]} rotation={[0, 0, 0.08]}><capsuleGeometry args={[0.105, 0.48, 8, 20]} /><meshStandardMaterial color={palette.suit} roughness={0.72} /></mesh>
        <group ref={leftForearm} position={[-0.27, -0.58, 0]} rotation={[0, 0, 0.18]}>
          <mesh castShadow position={[-0.17, -0.25, 0]}><capsuleGeometry args={[0.09, 0.4, 8, 20]} /><meshStandardMaterial color={palette.skin} roughness={0.78} /></mesh>
          <mesh castShadow position={[-0.18, -0.53, 0]}><sphereGeometry args={[0.12, 20, 20]} /><meshStandardMaterial color={palette.skinLight} roughness={0.78} /></mesh>
        </group>
      </group>

      <mesh castShadow position={[-0.22, 0.42, 0]} scale={[0.78, 1, 0.86]}><capsuleGeometry args={[0.16, 0.8, 8, 20]} /><meshStandardMaterial color={palette.suitDark} roughness={0.68} /></mesh>
      <mesh castShadow position={[0.22, 0.42, 0]} scale={[0.78, 1, 0.86]}><capsuleGeometry args={[0.16, 0.8, 8, 20]} /><meshStandardMaterial color={palette.suitDark} roughness={0.68} /></mesh>
      <mesh castShadow position={[-0.22, -0.29, 0.12]} rotation={[Math.PI / 2, 0, 0]} scale={[0.82, 1.45, 0.65]}><capsuleGeometry args={[0.16, 0.28, 8, 20]} /><meshStandardMaterial color="#202e2d" roughness={0.58} /></mesh>
      <mesh castShadow position={[0.22, -0.29, 0.12]} rotation={[Math.PI / 2, 0, 0]} scale={[0.82, 1.45, 0.65]}><capsuleGeometry args={[0.16, 0.28, 8, 20]} /><meshStandardMaterial color="#202e2d" roughness={0.58} /></mesh>
    </group>
  );
}

function VrmAvatar({ command, modelUrl, onReady }: { command: AvatarCommand; modelUrl: string; onReady?: () => void }) {
  const gltf = useLoader(GLTFLoader, modelUrl, (loader) => loader.register((parser) => new VRMLoaderPlugin(parser)));
  const vrm = gltf.userData.vrm as VRM | undefined;
  const displayRoot = useRef<Group>(null);
  const actionStart = useRef(0);
  const lastNonce = useRef(-1);
  const baseY = useRef(-1.45);
  const disposeTimer = useRef<number | undefined>(undefined);

  const fit = useMemo(() => {
    if (!vrm) return { scale: 1, x: 0, y: -1.45 };
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.updateMatrixWorld(true);
    const head = vrm.humanoid?.getRawBoneNode("head");
    const leftFoot = vrm.humanoid?.getRawBoneNode("leftFoot");
    const rightFoot = vrm.humanoid?.getRawBoneNode("rightFoot");
    const hips = vrm.humanoid?.getRawBoneNode("hips");
    const headPosition = head?.getWorldPosition(new Vector3());
    const leftFootPosition = leftFoot?.getWorldPosition(new Vector3());
    const rightFootPosition = rightFoot?.getWorldPosition(new Vector3());
    const hipsPosition = hips?.getWorldPosition(new Vector3());
    const footY = leftFootPosition && rightFootPosition ? (leftFootPosition.y + rightFootPosition.y) / 2 : undefined;
    const rigHeight = headPosition && footY !== undefined ? headPosition.y - footY : 0;
    const initialBounds = new Box3().setFromObject(vrm.scene);
    const meshHeight = Math.max(0.01, initialBounds.max.y - initialBounds.min.y);
    const scale = rigHeight > 0.5 ? 2.25 / rigHeight : 2.6 / meshHeight;
    const fittedScale = MathUtils.clamp(scale, 0.65, 2.4);
    return {
      scale: fittedScale,
      x: hipsPosition ? -hipsPosition.x * fittedScale : 0,
      y: -1.45 - initialBounds.min.y * fittedScale,
    };
  }, [vrm]);

  useEffect(() => {
    if (!vrm) return;
    if (disposeTimer.current !== undefined) {
      window.clearTimeout(disposeTimer.current);
      disposeTimer.current = undefined;
    }
    baseY.current = fit.y;
    onReady?.();
    return () => {
      disposeTimer.current = window.setTimeout(() => {
        useLoader.clear(GLTFLoader, modelUrl);
        VRMUtils.deepDispose(vrm.scene);
        disposeTimer.current = undefined;
      }, 0);
    };
  }, [fit.y, modelUrl, onReady, vrm]);

  useFrame(({ clock }, delta) => {
    if (!vrm) return;
    const t = clock.elapsedTime;
    if (lastNonce.current !== command.nonce) {
      lastNonce.current = command.nonce;
      actionStart.current = t;
    }
    const elapsed = t - actionStart.current;
    const damp = (current: number, target: number, speed = 8) => MathUtils.damp(current, target, speed, delta);
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    const rightUpperArm = vrm.humanoid?.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = vrm.humanoid?.getNormalizedBoneNode("rightLowerArm");
    const leftUpperArm = vrm.humanoid?.getNormalizedBoneNode("leftUpperArm");
    const leftLowerArm = vrm.humanoid?.getNormalizedBoneNode("leftLowerArm");
    const upperArmSign = vrm.meta?.metaVersion === "0" ? -1 : 1;

    let headX = Math.sin(t * 0.72) * 0.012;
    let headY = Math.sin(t * 0.48) * 0.02;
    let headZ = 0;
    let rightUpperZ = 1.12;
    let rightLowerZ = 0;
    let leftUpperZ = -1.12;
    let leftLowerZ = 0;

    if (command.action === "nod" && elapsed < 1.5) headX += Math.sin(elapsed * Math.PI * 3.2) * 0.18;
    if (command.action === "shakeHead" && elapsed < 1.5) headY += Math.sin(elapsed * Math.PI * 3.2) * 0.28;
    if (command.action === "thinking") {
      headY -= 0.12;
      headZ -= 0.06;
      rightUpperZ = 0.56;
      rightLowerZ = -0.92;
    }
    if (command.action === "listening") {
      headY += 0.08;
      headZ += 0.055;
    }
    if (command.action === "wave" && elapsed < 2.4) {
      rightUpperZ = -1.32;
      rightLowerZ = -0.72 + Math.sin(elapsed * 9) * 0.25;
    }
    if (command.action === "talk") {
      rightUpperZ = 0.78 + Math.sin(t * 1.7) * 0.08;
      rightLowerZ = -0.48 + Math.sin(t * 2.1) * 0.1;
      leftUpperZ = -0.78 + Math.sin(t * 1.5) * 0.06;
      leftLowerZ = 0.42;
    }
    if (command.action === "explain") {
      rightUpperZ = 0.62 + Math.sin(t * 1.7) * 0.05;
      rightLowerZ = -0.92 + Math.sin(t * 2.1) * 0.08;
      leftUpperZ = -0.98;
      leftLowerZ = 0.16;
      headY += 0.04;
    }
    if (command.action === "comfort") {
      headY += 0.08;
      headZ += 0.065;
      rightUpperZ = 0.76;
      rightLowerZ = -0.46;
      leftUpperZ = -0.76;
      leftLowerZ = 0.46;
    }
    if (command.action === "celebrate" && elapsed < 2.7) {
      rightUpperZ = -1.58;
      leftUpperZ = 1.58;
      rightLowerZ = -0.12;
      leftLowerZ = 0.12;
      headZ += Math.sin(elapsed * 5) * 0.03;
    }

    if (head) {
      head.rotation.x = damp(head.rotation.x, headX);
      head.rotation.y = damp(head.rotation.y, headY);
      head.rotation.z = damp(head.rotation.z, headZ);
    }
    if (rightUpperArm) rightUpperArm.rotation.z = damp(rightUpperArm.rotation.z, rightUpperZ * upperArmSign);
    if (rightLowerArm) rightLowerArm.rotation.z = damp(rightLowerArm.rotation.z, rightLowerZ);
    if (leftUpperArm) leftUpperArm.rotation.z = damp(leftUpperArm.rotation.z, leftUpperZ * upperArmSign);
    if (leftLowerArm) leftLowerArm.rotation.z = damp(leftLowerArm.rotation.z, leftLowerZ);

    const bounce = command.action === "celebrate" && elapsed < 2.7 ? Math.abs(Math.sin(elapsed * 4.5)) * 0.045 : 0;
    if (displayRoot.current) {
      displayRoot.current.position.y = damp(displayRoot.current.position.y, baseY.current + Math.sin(t * 1.45) * 0.008 + bounce, 7);
    }
    const blinkCycle = t % 4.8;
    const blink = blinkCycle > 4.55 ? Math.sin(((blinkCycle - 4.55) / 0.25) * Math.PI) : 0;
    const talking = command.speaking;
    vrm.expressionManager?.setValue("blink", Math.max(0, blink));
    vrm.expressionManager?.setValue("happy", command.emotion === "excited" ? 0.46 : command.emotion === "happy" ? 0.26 : 0);
    vrm.expressionManager?.setValue("relaxed", command.emotion === "thoughtful" ? 0.22 : 0);
    vrm.expressionManager?.setValue("sad", command.emotion === "concerned" ? 0.16 : 0);
    vrm.expressionManager?.setValue("surprised", command.emotion === "surprised" ? 0.24 : command.emotion === "excited" ? 0.12 : 0);
    vrm.expressionManager?.setValue("aa", talking ? Math.max(0, Math.sin(t * 12)) * 0.5 : 0);
    vrm.expressionManager?.setValue("ih", talking ? Math.max(0, Math.sin(t * 9 + 1.4)) * 0.22 : 0);
    vrm.expressionManager?.setValue("ou", talking ? Math.max(0, Math.sin(t * 7 + 2.1)) * 0.18 : 0);
    vrm.update(delta);
  });

  return vrm ? (
    <group ref={displayRoot} position={[fit.x, fit.y, 0]}>
      <primitive object={vrm.scene} scale={fit.scale} dispose={null} />
    </group>
  ) : null;
}

class AvatarLoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("VRM avatar loading failed", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function AvatarModel({ command, modelUrl, onReady }: Props) {
  return modelUrl ? (
    <AvatarLoadBoundary key={modelUrl} fallback={<ProceduralAvatar command={command} onReady={onReady} />}>
      <VrmAvatar command={command} modelUrl={modelUrl} onReady={onReady} />
    </AvatarLoadBoundary>
  ) : <ProceduralAvatar command={command} onReady={onReady} />;
}
