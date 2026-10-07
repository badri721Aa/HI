"use client";

import type { Ref } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import type * as THREE from "three";

/*
 * Product-studio lighting with no network assets: a tiny environment map
 * (64 px cube, rendered once) baked from a few emissive cards, plus one key
 * light for crisp form shading. Reads as a softbox above, a large key card on
 * the left, a thin cool rim strip behind on the right, and a dim bounce from
 * the floor, which is what makes matte PLA and brass look like photographs.
 */

// Module-level element: a stable identity, so the environment is captured once
// (drei re-renders the cube map whenever its children change).
const CARDS = (
  <>
    {/* Overhead softbox. */}
    <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[0, 5, 0.6]} scale={[5, 3, 1]} />
    {/* Key card, camera left. */}
    <Lightformer form="rect" intensity={2.2} color="#fff8ee" position={[-4.5, 1.8, 2.6]} scale={[2.2, 4.5, 1]} />
    {/* Rim strip, behind right: a cool edge on the silhouette. */}
    <Lightformer form="rect" intensity={1.6} color="#eaf4ff" position={[4, 1.6, -3.4]} scale={[0.7, 5, 1]} />
    {/* Fill, camera right, low. */}
    <Lightformer form="rect" intensity={0.45} color="#ffffff" position={[4.6, 0.8, 2.8]} scale={[2.5, 2, 1]} />
    {/* Floor bounce. */}
    <Lightformer form="circle" intensity={0.25} color="#ffffff" position={[0, -3, 0]} scale={[6, 6, 1]} />
  </>
);

/** Key light position for a camera on +Z (rotate it with an orbiting camera). */
export const KEY_POSITION = [-2.6, 4.2, 3.2] as const;

export function Studio({
  environment = 1,
  keyIntensity = 1.5,
  keyRef,
}: {
  /** scene.environmentIntensity. */
  environment?: number;
  keyIntensity?: number;
  keyRef?: Ref<THREE.DirectionalLight>;
}) {
  return (
    <>
      <Environment resolution={64} frames={1} environmentIntensity={environment}>
        {CARDS}
      </Environment>
      <directionalLight ref={keyRef} position={KEY_POSITION} intensity={keyIntensity} color="#fff6ea" />
    </>
  );
}
