"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { SHOWCASE } from "@/content/showcase";
import { useI18n } from "@/components/providers/i18n-provider";
import { ProductMesh } from "../product-mesh";
import { RIPPLE, rippleBase } from "../core/profiles";
import { BuildPlate } from "./build-plate";
import { mirrorRect, orbitDirection, ring, solveFraming, type FrameRect, type Framing } from "./framing";
import { PRINT_HEAD_HEIGHT, PrintHead } from "./print-head";
import { FAILED_CLIP, FAILED_TANGLE } from "./failed-tangle";
import { SceneView, type SceneViewApi } from "./scene-view";
import { Studio } from "./studio";

/*
 * 404: a print that came loose. The Ripple vase stopped at 42 %, its last
 * layer cold; the hotend parked above, still trailing a strand that balled
 * up into a nest of "spaghetti" over the rim. The tangle drifts gently.
 */

const PIECE = SHOWCASE.vase;
const COLOR = PIECE.colors[0].id;
const DIMS = PIECE.sizes[0].dims;
const H = DIMS.h / 100;
const R = Math.min(DIMS.w, DIMS.d) / 200;
const BONE = PIECE.colors[0].hex;

const PLATE = 2.2;
const FOV = 26;
const AZIMUTH = 0.25;
const ELEVATION = 0.3;
const HEAD_SCALE = 1.3;
const TARGET = new THREE.Vector3(0, H * 0.48, 0);
const { tip, centre, radii, points } = FAILED_TANGLE;

const FIT: THREE.Vector3[] = [
  ...[-1, 1].flatMap((x) =>
    [-1, 1].flatMap((z) => [
      new THREE.Vector3((x * PLATE) / 2, 0, (z * PLATE) / 2),
      new THREE.Vector3((x * PLATE) / 2, -0.06, (z * PLATE) / 2),
    ]),
  ),
  ...ring(R * rippleBase(0.35) * (1 + RIPPLE.amp), 0.35 * H),
  ...ring(Math.max(radii[0], radii[2]) + 0.03, centre[1] + radii[1]).map((p) => p.add(new THREE.Vector3(centre[0], 0, centre[2]))),
  new THREE.Vector3(tip[0], tip[1] + PRINT_HEAD_HEIGHT * HEAD_SCALE, tip[2]),
];
const RECT: FrameRect = { l: 0.06, r: 0.94, t: 0.04, b: 0.95 };

const SWAY_VERT_DECL = /* glsl */ `
uniform float uTime;
attribute float aSway;
`;
const SWAY_VERT = /* glsl */ `
transformed += aSway * vec3(
  sin( uTime * 0.55 + position.y * 4.0 + position.z * 2.0 ) * 0.02,
  sin( uTime * 0.42 + position.x * 5.0 ) * 0.012,
  cos( uTime * 0.5 + position.z * 4.0 + position.x * 1.5 ) * 0.02
);
`;

function buildStrand() {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    "centripetal",
  );
  const tubular = points.length * 6;
  const radial = 6;
  const geometry = new THREE.TubeGeometry(curve, tubular, 0.0095, radial, false);
  // Sway weight along the strand: pinned at the nozzle and at the rim.
  const count = geometry.getAttribute("position").count;
  const sway = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.floor(i / (radial + 1)) / tubular;
    const a = Math.min(u / 0.1, 1);
    const b = Math.min((1 - u) / 0.12, 1);
    sway[i] = a * a * (3 - 2 * a) * b * b * (3 - 2 * b);
  }
  geometry.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));

  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.42, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${SWAY_VERT_DECL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${SWAY_VERT}`);
  };
  material.customProgramCacheKey = () => "spaghetti-v1";
  return { geometry, material, uniforms };
}

const _dir = new THREE.Vector3();

function FailedContent({ api, reduced, rtl }: { api: SceneViewApi; reduced: boolean; rtl: boolean }) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const strand = useMemo(() => buildStrand(), []);
  useEffect(
    () => () => {
      strand.geometry.dispose();
      strand.material.dispose();
    },
    [strand],
  );
  const live = useRef<typeof strand | null>(null);
  useLayoutEffect(() => {
    live.current = strand;
  }, [strand]);

  const sim = useRef<{ time: number; aspect: number; framing: Framing }>({
    time: 0,
    aspect: 0,
    framing: { distance: 10, offsetX: 0, offsetY: 0 },
  });

  useFrame((_, delta) => {
    const s = sim.current;
    const cam = camera.current;
    if (!api.active.current || !cam) return;
    if (!reduced) s.time += Math.min(delta, 1 / 20);

    const { width, height } = api.size.current;
    const aspect = width / height;
    if (Math.abs(aspect - s.aspect) > 1e-3) {
      s.aspect = aspect;
      solveFraming(FIT, TARGET, AZIMUTH, ELEVATION, FOV, aspect, mirrorRect(RECT, rtl), s.framing);
      cam.aspect = aspect;
      cam.setViewOffset(1, 1, s.framing.offsetX, s.framing.offsetY, 1, 1);
    }
    // A slow sway of the camera, like someone walking past the printer.
    orbitDirection(AZIMUTH + Math.sin(s.time * 0.16) * 0.05, ELEVATION + Math.sin(s.time * 0.11) * 0.015, _dir);
    cam.position.copy(TARGET).addScaledVector(_dir, s.framing.distance);
    cam.lookAt(TARGET);

    const st = live.current;
    if (st) st.uniforms.uTime.value = s.time;
  });

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={0.1} far={60} />
      <Studio />
      <BuildPlate size={PLATE} shadowRadius={R * rippleBase(0)} />
      <ProductMesh product={PIECE} colorId={COLOR} clipHeight={FAILED_CLIP} hot={0} />
      <mesh geometry={strand.geometry} material={strand.material} />
      <PrintHead position={tip} scale={HEAD_SCALE} light={0} />
    </>
  );
}

/** DOM side: the tracked box. */
export function FailedView({ reduced, className }: { reduced: boolean; className?: string }) {
  const { dir } = useI18n();
  return (
    <SceneView className={className}>
      {(api) => <FailedContent api={api} reduced={reduced} rtl={dir === "rtl"} />}
    </SceneView>
  );
}
