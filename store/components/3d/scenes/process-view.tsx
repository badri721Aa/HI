"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { SHOWCASE } from "@/content/showcase";
import { useI18n } from "@/components/providers/i18n-provider";
import { ProductMesh } from "../product-mesh";
import { lampLayout, lampOuterRadius } from "../core/profiles";
import { BuildPlate } from "./build-plate";
import { damp, easeInOutCubic, range, window4 } from "./easing";
import { mirrorRect, orbitDirection, ring, solveFraming, type FrameRect, type Framing } from "./framing";
import { buildBoundingBox, buildSliceContours, sliceIndexAt } from "./lamp-guides";
import { PRINT_HEAD_HEIGHT, PRINT_HEAD_REACH, PrintHead } from "./print-head";
import { SceneView, type SceneViewApi } from "./scene-view";
import { KEY_POSITION, Studio } from "./studio";

/*
 * "How it's made", driven by scroll progress 0–1 (read every frame, never
 * through React state), with the Lattice lamp:
 *
 *   0.00–0.25  Model   CAD hidden-line wireframe in a dimensioned bounding box
 *   0.25–0.50  Slice   contours stack up, layer by layer, under a sweeping plane
 *   0.50–0.75  Print   the part rises under the hotend, hot layer glowing
 *   0.75–1.00  Finish  a light sweeps across, then the bulb comes on
 *
 * Stages cross-fade; the camera orbits slowly.
 */

const PIECE = SHOWCASE.lamp;
const COLOR = "bone";
const DIMS = PIECE.sizes[0].dims;
const H = DIMS.h / 100;
const R = Math.min(DIMS.w, DIMS.d) / 200;
const PIECE_LAYOUT = lampLayout(DIMS);

/* Mirrors of the CSS tokens. */
const PLATINUM = "#8f939c";
const SILVER = "#c8ccd2";
const GLOW = "#7de3ee";

const PLATE = 1.7;
const FOV = 26;
const ELEVATION = 0.3;
const HEAD_SCALE = 1.15;
const SPIN = 1.6 * Math.PI * 2;
const TARGET = new THREE.Vector3(0, H * 0.46, 0);

// Rotation-invariant proxies (the camera orbits): the box corners and plate
// corners sweep circles.
const FIT: THREE.Vector3[] = [
  ...ring(R * Math.SQRT2 + 0.05, 0),
  ...ring(R * Math.SQRT2 + 0.05, H),
  ...ring((PLATE / 2) * Math.SQRT2, -0.06),
  ...ring(R + PRINT_HEAD_REACH * HEAD_SCALE, H + PRINT_HEAD_HEIGHT * HEAD_SCALE * 0.6),
];
const RECT: FrameRect = { l: 0.05, r: 0.95, t: 0.05, b: 0.95 };

const _dir = new THREE.Vector3();
const _sweep = new THREE.Vector3();

interface Sim {
  clip: number | null;
  hot: number;
  trail: number | null;
  wire: number;
  glow: number;
  head: number;
  angle: number;
  time: number;
  env: number;
  key: number;
  aspect: number;
  framing: Framing;
}

function ProcessContent({
  api,
  progress,
  reduced,
  rtl,
}: {
  api: SceneViewApi;
  progress: { get(): number };
  reduced: boolean;
  rtl: boolean;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const head = useRef<THREE.Group>(null);
  const solid = useRef<THREE.Group>(null);
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const sweepLight = useRef<THREE.DirectionalLight>(null);
  const rings = useRef<THREE.LineSegments>(null);
  const activeRing = useRef<THREE.LineSegments>(null);
  const plane = useRef<THREE.Group>(null);
  const box = useRef<THREE.LineSegments>(null);

  const guides = useMemo(() => {
    const contours = buildSliceContours(DIMS);
    // The active layer shares the contour vertices with its own draw range.
    const active = new THREE.BufferGeometry();
    active.setAttribute("position", contours.geometry.getAttribute("position"));
    active.boundingSphere = contours.geometry.boundingSphere;
    const line = (color: string, opacity: number) =>
      new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
    const planeSize = R * 2.5;
    return {
      contours,
      active,
      box: buildBoundingBox(DIMS),
      planeGeo: new THREE.PlaneGeometry(planeSize, planeSize),
      planeEdge: new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeSize, planeSize)),
      ringMat: line(SILVER, 0.5),
      activeMat: line(GLOW, 0.95),
      boxMat: line(PLATINUM, 0.5),
      planeMat: new THREE.MeshBasicMaterial({
        color: SILVER,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      planeEdgeMat: line(SILVER, 0.4),
    };
  }, []);
  useEffect(
    () => () => {
      guides.contours.geometry.dispose();
      guides.active.dispose();
      guides.box.dispose();
      guides.planeGeo.dispose();
      guides.planeEdge.dispose();
      guides.ringMat.dispose();
      guides.activeMat.dispose();
      guides.boxMat.dispose();
      guides.planeMat.dispose();
      guides.planeEdgeMat.dispose();
    },
    [guides],
  );
  const live = useRef<typeof guides | null>(null);
  useLayoutEffect(() => {
    live.current = guides;
  }, [guides]);

  const sim = useRef<Sim>({
    clip: null,
    hot: 0,
    trail: null,
    wire: 0,
    glow: 0,
    head: 0,
    angle: 0,
    time: 0,
    env: 1,
    key: 1.5,
    aspect: 0,
    framing: { distance: 10, offsetX: 0, offsetY: 0 },
  });
  const sources = useMemo(
    () => ({
      clip: { get: () => sim.current.clip },
      hot: { get: () => sim.current.hot },
      trail: { get: () => sim.current.trail },
      wire: { get: () => sim.current.wire },
      glow: { get: () => sim.current.glow },
      head: { get: () => sim.current.head },
    }),
    [],
  );

  useFrame((state, delta) => {
    const s = sim.current;
    const g = live.current;
    const cam = camera.current;
    if (!api.active.current || !cam || !g) return;
    const dt = Math.min(delta, 1 / 20);
    const p = Math.min(Math.max(progress.get(), 0), 1);
    if (!reduced) s.time += dt;

    // Framing (rotation-invariant, so solved only when the box changes shape).
    const { width, height } = api.size.current;
    const aspect = width / height;
    if (Math.abs(aspect - s.aspect) > 1e-3) {
      s.aspect = aspect;
      solveFraming(FIT, TARGET, 0, ELEVATION, FOV, aspect, mirrorRect(RECT, rtl), s.framing);
      cam.aspect = aspect;
      cam.setViewOffset(1, 1, s.framing.offsetX, s.framing.offsetY, 1, 1);
    }
    const azimuth = reduced ? 0.55 : 0.35 + p * 1.5 + s.time * 0.05;
    orbitDirection(azimuth, ELEVATION, _dir);
    cam.position.copy(TARGET).addScaledVector(_dir, s.framing.distance);
    cam.lookAt(TARGET);
    // The studio turns with the camera, so the piece is always lit from the viewer's front-left.
    const ca = Math.cos(azimuth);
    const sa = Math.sin(azimuth);
    keyLight.current?.position.set(
      KEY_POSITION[0] * ca + KEY_POSITION[2] * sa,
      KEY_POSITION[1],
      -KEY_POSITION[0] * sa + KEY_POSITION[2] * ca,
    );
    state.scene.environmentRotation.y = azimuth;

    // 1 · Model: wireframe and dimensioned box.
    s.wire = 1 - range(p, 0.19, 0.27);
    g.boxMat.opacity = 0.5 * (1 - range(p, 0.16, 0.25));
    if (box.current) box.current.visible = g.boxMat.opacity > 0.002;

    // 2 · Slice: contours stack up under the plane; 3 · they stay ahead of the print as a preview.
    const sliceY = range(p, 0.27, 0.48) * H;
    const printP = range(p, 0.5, 0.74);
    const printing = p >= 0.5 && p < 0.75;
    const c = g.contours;
    const top = sliceIndexAt(c, sliceY);
    const from = printing ? sliceIndexAt(c, printP * H) : 0;
    const ringsOn = p > 0.26 && p < 0.75;
    c.geometry.setDrawRange(c.starts[from], Math.max(0, c.starts[top] - c.starts[from]));
    g.ringMat.opacity = 0.5 * range(p, 0.26, 0.29) * (1 - range(p, 0.66, 0.74));
    if (rings.current) rings.current.visible = ringsOn && top > from;
    const cur = Math.max(top - 1, 0);
    g.active.setDrawRange(c.starts[cur], c.starts[cur + 1] - c.starts[cur]);
    const sweeping = window4(p, 0.255, 0.28, 0.47, 0.5);
    g.activeMat.opacity = 0.95 * sweeping;
    g.planeMat.opacity = 0.055 * sweeping;
    g.planeEdgeMat.opacity = 0.4 * sweeping;
    if (activeRing.current) activeRing.current.visible = sweeping > 0.002 && top > 0;
    if (plane.current) {
      plane.current.visible = sweeping > 0.002;
      plane.current.position.y = sliceY;
    }

    // 3 · Print: the part rises under the hotend.
    if (p < 0.5) s.clip = 0;
    else if (p < 0.75) s.clip = Math.max(printP, 0.0004);
    else s.clip = null;
    if (solid.current) solid.current.visible = p >= 0.5;
    s.hot = window4(p, 0.5, 0.515, 0.73, 0.75);
    s.head = window4(p, 0.48, 0.515, 0.735, 0.77);
    if (!reduced) s.angle = (s.angle + SPIN * dt) % (Math.PI * 2);
    s.trail = printing ? s.angle : null;
    if (head.current) {
      const y = (s.clip ?? 1) * H;
      const r = lampOuterRadius(PIECE_LAYOUT, y) - 0.008;
      const lift = (1 - easeInOutCubic(range(p, 0.48, 0.515))) * 0.25 + easeInOutCubic(range(p, 0.735, 0.77)) * 0.25;
      head.current.position.set(r * Math.cos(s.angle), y + 0.0005 + lift, r * Math.sin(s.angle));
      head.current.visible = s.head > 0.002;
    }

    // 4 · Finish: a soft light sweeps across the piece, then the bulb comes on.
    const sweep = window4(p, 0.75, 0.8, 0.86, 0.93);
    if (sweepLight.current) {
      const a = azimuth + (range(p, 0.75, 0.93) - 0.5) * 2.6;
      _sweep.set(Math.sin(a) * 4, 1.5, Math.cos(a) * 4);
      sweepLight.current.position.copy(_sweep);
      sweepLight.current.intensity = 1.5 * sweep;
    }
    s.glow = p >= 0.86 ? 1 : 0;
    // Dim the room as the lamp comes on, so the lattice glows.
    s.env = damp(s.env, 1 - 0.5 * s.glow, 0.25, dt);
    s.key = damp(s.key, 1.5 * (1 - 0.45 * s.glow), 0.25, dt);
    state.scene.environmentIntensity = s.env;
    if (keyLight.current) keyLight.current.intensity = s.key;
  }, -1);

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={0.1} far={60} />
      <Studio keyRef={keyLight} />
      <directionalLight ref={sweepLight} intensity={0} color="#ffffff" />
      <BuildPlate size={PLATE} shadowRadius={PIECE_LAYOUT.ringR} />

      <ProductMesh product={PIECE} colorId={COLOR} wireframe wireOpacity={sources.wire} />
      <lineSegments ref={box} geometry={guides.box} material={guides.boxMat} renderOrder={3} />
      <lineSegments ref={rings} geometry={guides.contours.geometry} material={guides.ringMat} renderOrder={3} />
      <lineSegments ref={activeRing} geometry={guides.active} material={guides.activeMat} renderOrder={4} />
      <group ref={plane}>
        <mesh geometry={guides.planeGeo} material={guides.planeMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} />
        <lineSegments geometry={guides.planeEdge} material={guides.planeEdgeMat} rotation={[-Math.PI / 2, 0, 0]} />
      </group>

      <group ref={solid} visible={false}>
        <ProductMesh
          product={PIECE}
          colorId={COLOR}
          clip={sources.clip}
          hot={sources.hot}
          hotTrail={sources.trail}
          glow={sources.glow}
        />
      </group>
      <PrintHead ref={head} scale={HEAD_SCALE} opacity={sources.head} light={sources.hot} />
    </>
  );
}

/** DOM side: the tracked box. */
export function ProcessView({
  progress,
  reduced,
  className,
}: {
  progress: { get(): number };
  reduced: boolean;
  className?: string;
}) {
  const { dir } = useI18n();
  return (
    <SceneView className={className}>
      {(api) => <ProcessContent api={api} progress={progress} reduced={reduced} rtl={dir === "rtl"} />}
    </SceneView>
  );
}
