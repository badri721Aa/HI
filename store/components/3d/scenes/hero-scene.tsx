"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { SHOWCASE } from "@/content/showcase";
import { HERO_START_PROGRESS, usePrintState } from "@/lib/store/print";
import { useI18n } from "@/components/providers/i18n-provider";
import { ProductMesh } from "../product-mesh";
import { RIPPLE, rippleBase, ripplePerimeterRadius } from "../core/profiles";
import { BuildPlate } from "./build-plate";
import { damp, easeInCubic, easeInOutCubic, easeInOutSine, easeOutCubic, range } from "./easing";
import { mirrorRect, orbitDirection, solveFraming, type FrameRect, type Framing } from "./framing";
import { PRINT_HEAD_HEIGHT, PRINT_HEAD_REACH, PrintHead } from "./print-head";
import { SceneView, type SceneViewApi } from "./scene-view";
import { Studio } from "./studio";

/*
 * Hero: the Ripple vase printing on the build plate, on a loop.
 *
 *   print 11 s   → the cut rises (ease in-out) with the hot layer glowing under
 *                  a hotend that traces the wall (≈2.2 rev/s, tip on the wall)
 *   done 1.2 s   → the layer cools, the head lifts away and fades
 *   turn 3 s     → the finished piece turns a sixth of a revolution
 *   reset 0.9 s  → it un-prints from the top down, then the next print starts
 *
 * The first loop opens part-way through the print, so the first frame is a
 * half-built vase rather than an empty plate. The camera dollies with the
 * print: close on the first layers, pulling back as the piece grows.
 *
 * Framing keeps clear of the HUD overlaid on the box (hero.tsx passes it as
 * `avoid`): the whole composition, plate included, goes either beside it or
 * above it, whichever lets the piece be larger.
 *
 * The HUD reads usePrintState, written here at 10 Hz.
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
const T_RESET = 0.9;
const T1 = T_PRINT;
const T2 = T1 + T_DONE;
const T3 = T2 + T_TURN;
const LOOP = T3 + T_RESET;
/** Where the first loop starts: the time at which the eased print reaches HERO_START_PROGRESS. */
const T_START = (T_PRINT * Math.acos(1 - 2 * HERO_START_PROGRESS)) / Math.PI;
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

/*
 * Dolly: the camera frames the piece as printed so far (never less than the
 * first EARLY of it), coming at most MAX_DOLLY times closer than for the
 * finished piece, and looks a little lower while the print is low.
 */
const EARLY = 0.2;
const MAX_DOLLY = 1.45;
const targetY = (fit: number) => H * (0.1 + 0.35 * fit);

/* Composition margins, as fractions of the box (left-to-right layout; mirrored in RTL). */
const SIDE = 0.02;
const TOP = 0.03;
const BOTTOM = 0.96;
/** Gap kept between the HUD and the plate, in CSS px. */
const HUD_GAP_PX = 12;

/* Fit points for the piece printed up to `fit`, filled in place (no per-frame allocation). */
const RING = 12;
const RING_COS = Array.from({ length: RING }, (_, k) => Math.cos((k / RING) * Math.PI * 2));
const RING_SIN = Array.from({ length: RING }, (_, k) => Math.sin((k / RING) * Math.PI * 2));
const PLATE_POINTS = [
  [-1, 0, -1],
  [1, 0, -1],
  [-1, 0, 1],
  [1, 0, 1],
  [-1, -0.06, 1],
  [1, -0.06, 1],
].map(([x, y, z]) => new THREE.Vector3((x * PLATE) / 2, y, (z * PLATE) / 2));
const FIT_POINTS = Array.from({ length: RING * 4 + PLATE_POINTS.length }, () => new THREE.Vector3());

function fitPoints(fit: number): THREE.Vector3[] {
  let i = 0;
  const ringAt = (r: number, y: number) => {
    for (let k = 0; k < RING; k++) FIT_POINTS[i++].set(r * RING_COS[k], y, r * RING_SIN[k]);
  };
  const belly = Math.min(fit, 0.35);
  ringAt(R * rippleBase(0) * (1 + RIPPLE.amp), 0);
  ringAt(R * rippleBase(belly) * (1 + RIPPLE.amp), belly * H);
  ringAt(R * rippleBase(fit) * (1 + RIPPLE.amp), fit * H);
  ringAt(R * rippleBase(fit) + PRINT_HEAD_REACH * HEAD_SCALE, fit * H + PRINT_HEAD_HEIGHT * HEAD_SCALE);
  for (const p of PLATE_POINTS) FIT_POINTS[i++].copy(p);
  return FIT_POINTS;
}

/** Corner the HUD covers, measured from the box's bottom-start corner (CSS px). */
export interface HudZone {
  width: number;
  height: number;
}

/**
 * Where the composition may go: beside the HUD (towards the end side) or
 * above it. Scored over the whole print, finished piece and dolly together,
 * so a layout that leaves room to come closer on the first layers wins.
 */
function chooseRect(width: number, height: number, zone: HudZone, aspect: number): FrameRect {
  const zw = zone.width > 0 ? (zone.width + HUD_GAP_PX) / width : 0;
  const zh = zone.height > 0 ? (zone.height + HUD_GAP_PX) / height : 0;
  const options: FrameRect[] = [];
  if (zw < 0.62) options.push({ l: Math.max(SIDE, zw), r: 1 - SIDE, t: TOP, b: BOTTOM });
  if (zh < 0.62) options.push({ l: SIDE, r: 1 - SIDE, t: TOP, b: Math.min(BOTTOM, 1 - zh) });
  if (options.length === 0) return { l: SIDE, r: 1 - SIDE, t: TOP, b: BOTTOM };
  const probe: Framing = { distance: 0, offsetX: 0, offsetY: 0 };
  const full = new THREE.Vector3(0, targetY(1), 0);
  const early = new THREE.Vector3(0, targetY(EARLY), 0);
  let best = options[0];
  let bestScore = Infinity;
  for (const rect of options) {
    const d = solveFraming(fitPoints(1), full, AZIMUTH, ELEVATION, FOV, aspect, rect, probe).distance;
    const score = d + solveFraming(fitPoints(EARLY), early, AZIMUTH, ELEVATION, FOV, aspect, rect, probe, d / MAX_DOLLY).distance;
    if (score < bestScore) {
      bestScore = score;
      best = rect;
    }
  }
  return best;
}

const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

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
  /** Layout the framing was solved for: box size, direction, HUD zone. */
  layout: [width: number, height: number, rtl: boolean, zoneWidth: number, zoneHeight: number];
  rect: FrameRect;
  fullDistance: number;
  /** Print fraction the current framing was solved for. */
  framed: number;
  target: THREE.Vector3;
  framing: Framing;
}

type Pointer = RefObject<{ x: number; y: number }>;

function HeroContent({
  api,
  reduced,
  rtl,
  pointer,
  zone,
}: {
  api: SceneViewApi;
  reduced: boolean;
  rtl: boolean;
  pointer: Pointer;
  zone: RefObject<HudZone>;
}) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const vase = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const sim = useRef<Sim>({
    t: T_START,
    turn: 0,
    angle: 0,
    clip: reduced ? null : HERO_START_PROGRESS,
    hot: 0,
    trail: null,
    head: 0,
    shadow: 1,
    hud: -1,
    hudClock: 1,
    px: 0,
    py: 0,
    layout: [0, 0, false, -1, -1],
    rect: { l: SIDE, r: 1 - SIDE, t: TOP, b: BOTTOM },
    fullDistance: 10,
    framed: -1,
    target: new THREE.Vector3(0, targetY(1), 0),
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

    // Timeline.
    let turn = s.turn;
    let lift = 0;
    if (reduced) {
      s.clip = null;
      s.hot = 0;
      s.head = 0;
      s.shadow = 1;
    } else {
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
        turn = s.turn;
      }
      const t = s.t;
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
    }

    // Framing: which part of the box to use is decided per layout; the
    // dolly re-solves as the print grows (it is continuous, reset included).
    const { width, height } = api.size.current;
    const aspect = width / height;
    const z = zone.current;
    const l = s.layout;
    const fit = reduced ? 1 : Math.max(s.clip ?? 1, EARLY);
    if (l[0] !== width || l[1] !== height || l[2] !== rtl || l[3] !== z.width || l[4] !== z.height) {
      s.layout = [width, height, rtl, z.width, z.height];
      _target.set(0, targetY(1), 0);
      s.rect = mirrorRect(chooseRect(width, height, z, aspect), rtl);
      solveFraming(fitPoints(1), _target, AZIMUTH, ELEVATION, FOV, aspect, s.rect, s.framing);
      s.fullDistance = s.framing.distance;
      s.framed = -1;
    }
    if (Math.abs(fit - s.framed) > 5e-4) {
      s.framed = fit;
      s.target.set(0, targetY(fit), 0);
      const min = s.fullDistance / MAX_DOLLY;
      solveFraming(fitPoints(fit), s.target, AZIMUTH, ELEVATION, FOV, aspect, s.rect, s.framing, min);
      // setViewOffset resets the aspect to fullWidth / fullHeight; put it back.
      cam.setViewOffset(1, 1, s.framing.offsetX, s.framing.offsetY, 1, 1);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }

    // Subtle pointer parallax around the piece.
    s.px = damp(s.px, reduced ? 0 : pointer.current.x, 0.5, dt);
    s.py = damp(s.py, reduced ? 0 : pointer.current.y, 0.5, dt);
    orbitDirection(AZIMUTH + s.px * 0.09, ELEVATION + s.py * 0.035, _dir);
    cam.position.copy(s.target).addScaledVector(_dir, s.framing.distance);
    cam.lookAt(s.target);

    if (vase.current) vase.current.rotation.y = reduced ? 0 : turn;

    // The nozzle orbits in world space; the vase may be turned, so its
    // profile is sampled at the matching angle in its own frame.
    const local = s.angle + turn;
    const printing = !reduced && s.t < T1;
    s.trail = printing ? local : null;
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

/**
 * DOM side: the tracked box, pointer input and the HUD's footprint.
 * `avoid` is an element overlaid on the box's bottom-start corner (the HUD,
 * absolutely positioned in the same container as the box) that the
 * composition must keep clear of.
 */
export function HeroScene({
  className,
  reduced,
  avoid,
}: {
  className?: string;
  reduced: boolean;
  avoid?: RefObject<HTMLElement | null>;
}) {
  const { dir } = useI18n();
  const rtl = dir === "rtl";
  const pointer = useRef({ x: 0, y: 0 });
  const zone = useRef<HudZone>({ width: 0, height: 0 });

  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  // Offsets (not bounding boxes), so the HUD's entrance transform doesn't count.
  useEffect(() => {
    const el = avoid?.current;
    const parent = el?.offsetParent;
    if (!el || !(parent instanceof HTMLElement)) return;
    const measure = () => {
      zone.current = {
        width: rtl ? parent.clientWidth - el.offsetLeft : el.offsetLeft + el.offsetWidth,
        height: parent.clientHeight - el.offsetTop,
      };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [avoid, rtl]);

  return (
    <SceneView className={className}>
      {(api) => <HeroContent api={api} reduced={reduced} rtl={rtl} pointer={pointer} zone={zone} />}
    </SceneView>
  );
}
