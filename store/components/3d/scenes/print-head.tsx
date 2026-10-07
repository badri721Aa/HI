"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { readLive, type Live } from "../core/live";

/*
 * A compact hotend, modelled in millimetres and scaled to model units
 * (1 = 100 mm): brass nozzle (cone + hex), heater block in a dark silicone
 * sock, a steel heat break, a finned aluminium heat sink and a fan on its
 * back. The group's origin is the nozzle tip; it never rotates (a printer
 * head translates), so its orientation stays fixed while it orbits a part.
 * A tiny cyan-white point light at the tip lights the fresh layer.
 */

const MM = 0.01;
/** Fin layout of the heat sink (mm): core radius, fin radius, fin thickness, pitch, count. */
const FINS = { core: 4.2, fin: 10.5, t: 1.1, pitch: 2.6, n: 6 };

/** Height of the head above its tip (model units), for framing. */
export const PRINT_HEAD_HEIGHT = (2.8 + 3 + 12 + 4.5 + FINS.n * FINS.pitch + 1.5) * MM;
/** Largest horizontal reach from the tip (model units). */
export const PRINT_HEAD_REACH = 16 * MM;

function finProfile(): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(FINS.core, 0)];
  for (let i = 0; i < FINS.n; i++) {
    const y = i * FINS.pitch;
    pts.push(new THREE.Vector2(FINS.core, y + 0.35));
    pts.push(new THREE.Vector2(FINS.fin - 0.3, y + 0.4));
    pts.push(new THREE.Vector2(FINS.fin, y + 0.4 + FINS.t / 2));
    pts.push(new THREE.Vector2(FINS.fin - 0.3, y + 0.4 + FINS.t));
    pts.push(new THREE.Vector2(FINS.core, y + 0.45 + FINS.t));
  }
  const top = FINS.n * FINS.pitch + 1.5;
  pts.push(new THREE.Vector2(FINS.core, top - 0.4), new THREE.Vector2(FINS.core - 0.4, top), new THREE.Vector2(0, top));
  return pts.map((p) => p.multiplyScalar(MM));
}

function setOpacity(materials: readonly THREE.Material[], o: number) {
  for (const m of materials) m.opacity = o;
}

export interface PrintHeadProps {
  ref?: Ref<THREE.Group>;
  /** Where the tip is (when not driven by a frame callback). */
  position?: readonly [number, number, number];
  /** Uniform scale about the tip (a touch larger than life reads better at hero size). */
  scale?: number;
  /** 0–1 opacity (fade in/out while moving away). Default 1. */
  opacity?: Live<number>;
  /** 0–1 brightness of the tip light. Default 1. */
  light?: Live<number>;
}

export function PrintHead({ ref, position, scale = 1, opacity = 1, light = 1 }: PrintHeadProps) {
  const parts = useMemo(() => {
    const brass = new THREE.MeshStandardMaterial({ color: "#c49a58", metalness: 1, roughness: 0.3 });
    const sock = new THREE.MeshStandardMaterial({ color: "#2f3037", metalness: 0, roughness: 0.74 });
    const steel = new THREE.MeshStandardMaterial({ color: "#b7bcc4", metalness: 1, roughness: 0.28 });
    const alu = new THREE.MeshStandardMaterial({ color: "#a9aeb6", metalness: 0.85, roughness: 0.36 });
    const fan = new THREE.MeshStandardMaterial({ color: "#121216", metalness: 0.2, roughness: 0.55 });
    const tip = new THREE.MeshBasicMaterial({ color: "#bff6fb", toneMapped: false });
    const materials = [brass, sock, steel, alu, fan, tip];
    for (const m of materials) m.transparent = true;

    const sockY = 2.8 + 3 + 6;
    const breakY = 2.8 + 3 + 12;
    const sinkY = breakY + 4.5;
    const sinkH = FINS.n * FINS.pitch + 1.5;
    const meshes: { geometry: THREE.BufferGeometry; material: THREE.Material; position: [number, number, number] }[] = [
      // Nozzle: cone, then the hex nut.
      { geometry: new THREE.CylinderGeometry(2.6 * MM, 0.55 * MM, 2.8 * MM, 28), material: brass, position: [0, 1.4 * MM, 0] },
      { geometry: new THREE.CylinderGeometry(4 * MM, 4 * MM, 3 * MM, 6), material: brass, position: [0, 4.3 * MM, 0] },
      // Heater block in its silicone sock; the nozzle sits near one end.
      {
        geometry: new RoundedBoxGeometry(23 * MM, 12 * MM, 16 * MM, 3, 2.6 * MM),
        material: sock,
        position: [4.5 * MM, sockY * MM, 0],
      },
      // Heat break.
      { geometry: new THREE.CylinderGeometry(2.1 * MM, 2.1 * MM, 4.5 * MM, 20), material: steel, position: [0, (breakY + 2.25) * MM, 0] },
      // Finned heat sink.
      { geometry: new THREE.LatheGeometry(finProfile(), 40), material: alu, position: [0, sinkY * MM, 0] },
      // Fan on the back of the heat sink.
      {
        geometry: new RoundedBoxGeometry(24 * MM, sinkH * MM, 7 * MM, 2, 1.6 * MM),
        material: fan,
        position: [0, (sinkY + sinkH / 2) * MM, -14.5 * MM],
      },
      // The molten bead at the tip.
      { geometry: new THREE.SphereGeometry(0.65 * MM, 12, 8), material: tip, position: [0, 0.1 * MM, 0] },
    ];
    return { meshes, materials, tip };
  }, []);

  useEffect(
    () => () => {
      for (const m of parts.meshes) m.geometry.dispose();
      for (const m of parts.materials) m.dispose();
    },
    [parts],
  );

  const live = useRef<typeof parts | null>(null);
  useLayoutEffect(() => {
    live.current = parts;
  }, [parts]);
  const tipLight = useRef<THREE.PointLight>(null);
  const shown = useRef(-1);

  useFrame((state) => {
    const p = live.current;
    if (!p) return;
    const o = Math.min(Math.max(readLive(opacity), 0), 1);
    if (o !== shown.current) {
      shown.current = o;
      // Always "transparent" (blended, still depth-writing): toggling the flag would recompile shaders.
      setOpacity(p.materials, o);
    }
    const l = Math.min(Math.max(readLive(light), 0), 1) * o;
    if (tipLight.current) {
      const flicker = 0.92 + 0.08 * Math.sin(state.clock.elapsedTime * 37) * Math.sin(state.clock.elapsedTime * 13);
      tipLight.current.intensity = 0.5 * l * flicker;
    }
  });

  return (
    <group ref={ref} position={position as [number, number, number] | undefined}>
      <group scale={scale}>
        {parts.meshes.map((m, i) => (
          <mesh key={i} geometry={m.geometry} material={m.material} position={m.position} />
        ))}
      </group>
      <pointLight ref={tipLight} color="#c8f6fb" intensity={0} distance={0.32} decay={2} position={[0, 0.6 * MM, 0]} />
    </group>
  );
}
