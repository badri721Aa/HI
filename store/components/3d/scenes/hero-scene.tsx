"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { SHOWCASE } from "@/content/showcase";
import { usePrintState } from "@/lib/store/print";
import { useI18n } from "@/components/providers/i18n-provider";
import { ProductMesh } from "../product-mesh";
import { RIPPLE, rippleBase, ripplePerimeterRadius } from "../core/profiles";
import { BuildPlate } from "./build-plate";
import { damp, easeInCubic, easeInOutCubic, easeInOutSine, easeOutCubic, range } from "./easing";
import { mirrorRect, orbitDirection, ring, solveFraming, type FrameRect, type Framing } from "./framing";
import { PRINT_HEAD_HEIGHT, PRINT_HEAD_REACH, PrintHead } from "./print-head";
import { SceneView, type SceneViewApi } from "./scene-view";
import { Studio } from "./studio";

/*
 * Hero: the Ripple vase printing on the build plate, on a loop.
 *
 *   print 11 s  → the cut rises (ease in-out) with the hot layer glowing under
 *                 a hotend that traces the wall (≈2.2 rev/s, tip on the wall)
 *   done 1.2 s  → the layer cools, the head lifts away and fades
 *   turn 3 s    → the finished piece turns a sixth of a revolution
 *   reset 0.6 s → it un-prints from the top down, then the next print starts
 *
 * The HUD beside it (hero-hud.tsx) reads usePrintState, written here at 10 Hz.
 * Reduced motion: the finished vase, still, and a "complete" readout.
 */

const PIECE = SHOWCASE.vase;
const COLOR = PIECE.colors[0].id;
const DIMS = PIECE.sizes[0].dims;
const H = DIMS.h / 100;
const R = Math.min(DIMS.w, DIMS.d) / 200;
const TOTAL_LAYERS = Math.round(DIMS.h / PIECE.layerHeight);
const PRINT_MINUTES = Math.round((PIECE.printHours ?? 7) * 60);

const T_PRINT = 11;
const T_DONE = 1.2;
const T_TURN = 3;
const T_RESET = 0.6;
const T1 = T_PRINT;
const T2 = T1 + T_DONE;
const T3 = T2 + T_TURN;
const LOOP = T3 + T_RESET;
/** Nozzle orbit speed: 2.2 revolutions per second. */
const SPIN = 2.2 * Math.PI * 2;
/** How far the finished piece turns before the reset. */
const TURN = Math.PI / 3;
/** Visual nozzle path: the wall's centre line. */
const NOZZLE_INSET = RIPPLE.wall / 2;

const PLATE = 2.0;
const FOV = 24;
const AZIMUTH = 0;
const ELEVATION = 0.24;
const HEAD_SCALE = 1.3;
const TARGET = new THREE.Vector3(0, H * 0.45, 0);

const plateCorner = (x: number, z: number, y: number) => new THREE.Vector3((x * PLATE) / 2, y, (z * PLATE) / 2);
/** The piece and the head's highest reach (end of the print). */
const FIT_PIECE: THREE.Vector3[] = [
  ...ring(R * rippleBase(0) * (1 + RIPPLE.amp), 0),
  ...ring(R * rippleBase(0.35) * (1 + RIPPLE.amp), 0.35 * H),
  ...ring(R * rippleBase(1) + PRINT_HEAD_REACH * HEAD_SCALE, H + PRINT_HEAD_HEIGHT * HEAD_SCALE),
  plateCorner(-1, -1, 0),
  plateCorner(1, -1, 0),
];
/** Everything, including the plate's front edge. */
const FIT_ALL: THREE.Vector3[] = [
  ...FIT_PIECE,
  ...[-1, 1].flatMap((x) => [plateCorner(x, 1, 0), plateCorner(x, 1, -0.06)]),
];

/*
 * Where the composition sits in its box (fractions, left-to-right layout;
 * mirrored in RTL). The HUD overlays the box's bottom-start corner:
 * - wide boxes: everything fits, shifted towards the end side so the vase
 *   clears the HUD (the plate's front corner may pass under its glass);
 * - narrow (phone) boxes: the piece and the back of the plate sit above the
 *   HUD; the plate's front edge runs on beneath it.
 */
const WIDE = { rect: { l: 0.34, r: 0.98, t: 0.03, b: 0.93 } satisfies FrameRect, fit: FIT_ALL };
const NARROW = { rect: { l: 0.2, r: 0.98, t: 0.03, b: 0.665 } satisfies FrameRect, fit: FIT_PIECE };
const NARROW_PX = 560;

const _dir = new THREE.Vector3();

interface Sim {
  t: number;
  turn: number;
  angle: number;
  clip: number | null;
  hot: number;
  trail: number | null;
  head: number;
  shadow: number;
  hud: number;
  hudClock: number;
  px: number;
  py: number;
  aspect: number;
  narrow: boolean;
  rtl: boolean;
  framing: Framing;
}

type Pointer = RefObject<{ x: number; y: number }>;

function HeroContent({
  api,
  reduced,
  rtl,
  pointer,
}: {
  api: SceneViewApi;
  reduced: boolean;
  rtl: boolean;
  pointer: Pointer;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const vase = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const sim = useRef<Sim>({
    t: 0,
    turn: 0,
    angle: 0,
    clip: reduced ? null : 0,
    hot: 0,
    trail: null,
    head: 0,
    shadow: reduced ? 1 : 0,
    hud: -1,
    hudClock: 1,
    px: 0,
    py: 0,
    aspect: 0,
    narrow: false,
    rtl,
    framing: { distance: 10, offsetX: 0, offsetY: 0 },
  });

  // Stable sources the meshes read every frame.
  const sources = useMemo(
    () => ({
      clip: { get: () => sim.current.clip },
      hot: { get: () => sim.current.hot },
      trail: { get: () => sim.current.trail },
      head: { get: () => sim.current.head },
      shadow: { get: () => sim.current.shadow },
    }),
    [],
  );

  // Timeline first (negative priority), so the meshes read this frame's values.
  useFrame((_, delta) => {
    const s = sim.current;
    const cam = camera.current;
    if (!api.active.current || !cam) return;
    const dt = Math.min(delta, 1 / 20);

    // Framing: re-solved only when the box changes shape or direction.
    const { width, height } = api.size.current;
    const aspect = width / height;
    const narrow = width < NARROW_PX;
    if (Math.abs(aspect - s.aspect) > 1e-3 || narrow !== s.narrow || rtl !== s.rtl) {
      s.aspect = aspect;
      s.narrow = narrow;
      s.rtl = rtl;
      const layout = narrow ? NARROW : WIDE;
      solveFraming(layout.fit, TARGET, AZIMUTH, ELEVATION, FOV, aspect, mirrorRect(layout.rect, rtl), s.framing);
      cam.aspect = aspect;
      cam.setViewOffset(1, 1, s.framing.offsetX, s.framing.offsetY, 1, 1);
    }

    // Subtle pointer parallax around the piece.
    s.px = damp(s.px, reduced ? 0 : pointer.current.x, 0.5, dt);
    s.py = damp(s.py, reduced ? 0 : pointer.current.y, 0.5, dt);
    orbitDirection(AZIMUTH + s.px * 0.09, ELEVATION + s.py * 0.035, _dir);
    cam.position.copy(TARGET).addScaledVector(_dir, s.framing.distance);
    cam.lookAt(TARGET);

    if (reduced) {
      s.clip = null;
      s.hot = 0;
      s.head = 0;
      s.shadow = 1;
      if (head.current) head.current.visible = false;
      if (vase.current) vase.current.rotation.y = 0;
      return;
    }

    // Timeline.
    s.t += dt;
    if (process.env.NODE_ENV !== "production") {
      // Development only (compiled out of production): the visual test harness can jump the loop.
      const g = globalThis as { __heroSeek?: number };
      if (g.__heroSeek !== undefined) {
        s.t = g.__heroSeek;
        g.__heroSeek = undefined;
      }
    }
    if (s.t >= LOOP) {
      s.t -= LOOP;
      s.turn = (s.turn + TURN) % (Math.PI * 2);
    }
    const t = s.t;
    let turn = s.turn;
    let lift = 0;
    if (t < T1) {
      const print = easeInOutSine(t / T_PRINT);
      s.clip = Math.max(print, 0.0004);
      s.hot = range(t, 0, 0.35);
      s.head = range(t, 0, 0.45);
      lift = (1 - easeOutCubic(t / 0.7)) * 0.28;
      s.hud = print;
      s.angle = (s.angle + SPIN * dt) % (Math.PI * 2);
    } else if (t < T2) {
      const u = (t - T1) / T_DONE;
      s.clip = 0.99999;
      s.hot = 1 - range(u, 0, 0.5);
      s.head = 1 - range(u, 0.15, 0.8);
      lift = easeInOutCubic(u) * 0.34;
      s.hud = 1;
    } else if (t < T3) {
      s.clip = null;
      s.hot = 0;
      s.head = 0;
      turn += easeInOutSine((t - T2) / T_TURN) * TURN;
      s.hud = 1;
    } else {
      const u = (t - T3) / T_RESET;
      s.clip = 1 - easeInCubic(u);
      s.hot = 0;
      s.head = 0;
      turn += TURN;
      s.hud = 1;
    }
    s.shadow = s.clip === null ? 1 : range(s.clip, 0, 0.04);

    if (vase.current) vase.current.rotation.y = turn;

    // The nozzle orbits in world space; the vase may be turned, so its
    // profile is sampled at the matching angle in its own frame.
    const local = s.angle + turn;
    s.trail = t < T1 ? local : null;
    if (head.current) {
      const frac = s.clip ?? 1;
      const r = ripplePerimeterRadius(frac, local, DIMS) - NOZZLE_INSET;
      head.current.position.set(r * Math.cos(s.angle), frac * H + 0.0005 + lift, r * Math.sin(s.angle));
      head.current.visible = s.head > 0.002;
    }
  }, -1);

  // HUD readout at ~10 Hz (only when something changed).
  const written = useRef(-1);
  useFrame((_, delta) => {
    const s = sim.current;
    if (!api.active.current) return;
    s.hudClock += delta;
    if (s.hudClock < 0.1) return;
    s.hudClock = 0;
    const p = reduced ? 1 : Math.min(Math.max(s.hud, 0), 1);
    if (p === written.current) return;
    written.current = p;
    usePrintState.getState().set({
      progress: p,
      layer: Math.round(p * TOTAL_LAYERS),
      totalLayers: TOTAL_LAYERS,
      minutesLeft: Math.round((1 - p) * PRINT_MINUTES),
    });
  });

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={0.1} far={60} />
      <Studio />
      <BuildPlate size={PLATE} shadowRadius={R * rippleBase(0)} shadow={sources.shadow} />
      <group ref={vase}>
        <ProductMesh product={PIECE} colorId={COLOR} clip={sources.clip} hot={sources.hot} hotTrail={sources.trail} />
      </group>
      <PrintHead ref={head} scale={HEAD_SCALE} opacity={sources.head} light={sources.hot} />
    </>
  );
}

/** DOM side: the tracked box, pointer input and the reduced-motion readout. */
export function HeroScene({ className, reduced }: { className?: string; reduced: boolean }) {
  const { dir } = useI18n();
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  return (
    <SceneView className={className}>
      {(api) => <HeroContent api={api} reduced={reduced} rtl={dir === "rtl"} pointer={pointer} />}
    </SceneView>
  );
}
