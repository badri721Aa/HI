"use client";
// Must be rendered inside an R3F <Canvas> / drei <View>.

import { useEffect, useLayoutEffect, useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ColorOption, MaterialId, ShowcaseProduct } from "@/types";
import { readLive as read, type Live } from "./core/live";
import { getGeometry, getModelInfo, getWireframeGeometry } from "./geometry";
import {
  createHotHaloMaterial,
  createPrintDepthMaterial,
  createPrintMaterial,
  hotRamp,
  setPrintClip,
  setPrintPattern,
  syncPrintColors,
  type PrintMaterial,
} from "./materials";

/* Mirrors of the CSS tokens (three.js can't read CSS variables). */
const SILVER = "#c8ccd2";
const PLATINUM = "#8f939c";
const GLOW = "#7de3ee";
/** ≈2700 K incandescent. */
const BULB = "#ffb46b";

/** Layer-line strength per material: resin is nearly smooth, PLA shows its layers. */
const LAYER_STRENGTH: Record<MaterialId, number> = {
  "pla-matte": 0.6,
  "pla-silk": 0.55,
  petg: 0.5,
  resin: 0.12,
  tpu: 0.45,
};

const FALLBACK_COLOR: ColorOption = { id: "silver", name: { en: "Silver", ar: "فضي" }, hex: SILVER, finish: "matte" };

/** Colour lerp time constant: ~95 % of the way in 200 ms. */
const COLOR_TAU = 0.066;
/** Bulb switch-on / off time constant. */
const GLOW_TAU = 0.14;
/** Hot-band emissive intensity at hot = 1. */
const HOT_INTENSITY = 2.4;
/** Peak opacity of the halo around the hot band (a soft cyan bloom stand-in). */
const HALO_STRENGTH = 0.32;

export type { Live };

function pickSize(product: ShowcaseProduct, sizeId?: string): ShowcaseProduct["sizes"][number] {
  return product.sizes.find((s) => s.id === sizeId) ?? product.sizes[0];
}

/** Height of the rendered model in model units (1 = 100 mm), for camera framing. */
export function getModelHeight(product: ShowcaseProduct, sizeId?: string): number {
  return getModelInfo(product.model, pickSize(product, sizeId).dims).height;
}

/** Bounding size of the rendered model in model units (coasters: the stack of three). */
export function getModelSize(product: ShowcaseProduct, sizeId?: string): { w: number; h: number; d: number } {
  return getModelInfo(product.model, pickSize(product, sizeId).dims).size;
}

export interface ProductMeshProps {
  product: ShowcaseProduct;
  colorId: string;
  sizeId?: string;
  /** 0–1 fraction of the model height that is "printed". Omit for a finished piece. */
  clipHeight?: number;
  /**
   * Per-frame alternative to clipHeight (read inside useFrame, no re-render),
   * e.g. a scroll-driven value. Returns a 0–1 fraction, or null for no clip.
   * Takes precedence over clipHeight when given.
   */
  clip?: { get(): number | null | undefined };
  /** 0–1+ multiplier of the glowing hot band at the cut. Default 1; 0 turns it off. */
  hot?: Live<number>;
  /**
   * Angle θ (object space, atan2(z, x)) of the nozzle laying the current
   * layer: the hot band then burns brightest just behind it. null = even glow.
   */
  hotTrail?: { get(): number | null };
  /** CAD-style hidden-line wireframe instead of the printed material. */
  wireframe?: boolean;
  /** Opacity multiplier for the wireframe lines (for cross-fades). Default 1. */
  wireOpacity?: Live<number>;
  /** Wireframe only: hide lines behind the solid (hidden-line). Default true. */
  occlude?: Live<boolean>;
  /** Default: true for quality "high", false for "low". */
  castShadow?: boolean;
  /** "low" for thumbnails (cheap materials), "high" for a close-up viewer. Default "low". */
  quality?: "low" | "high";
  /** 0–1 brightness of a lamp's bulb (lattice-lamp only). Default 1. Changes ease in ~0.4 s. */
  glow?: Live<number>;
  /** The root group (object space of the model: base on y = 0). */
  ref?: Ref<THREE.Group>;
}

export function ProductMesh({
  product,
  colorId,
  sizeId,
  clipHeight,
  clip,
  hot = 1,
  hotTrail,
  wireframe = false,
  wireOpacity = 1,
  occlude = true,
  castShadow,
  quality = "low",
  glow = 1,
  ref,
}: ProductMeshProps) {
  const kind = product.model;
  const { w, d, h } = pickSize(product, sizeId).dims;
  const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0] ?? FALLBACK_COLOR;
  const finish = color.finish;
  const pattern = kind === "lattice-lamp" ? "mashrabiya" : "none";
  const layerStrength = LAYER_STRENGTH[product.material];
  const shadows = castShadow ?? quality === "high";

  // Geometry is cached module-wide by kind + dims: never dispose it here.
  const geometry = useMemo(() => getGeometry(kind, { w, d, h }), [kind, w, d, h]);
  const info = useMemo(() => getModelInfo(kind, { w, d, h }), [kind, w, d, h]);
  const wire = useMemo(() => (wireframe ? getWireframeGeometry(kind, { w, d, h }) : null), [wireframe, kind, w, d, h]);
  const lamp = info.lamp;

  const material = useMemo(
    () =>
      createPrintMaterial({
        color: SILVER,
        finish,
        layerHeight: product.layerHeight,
        pattern,
        quality,
        layerStrength,
      }),
    [finish, pattern, quality, product.layerHeight, layerStrength],
  );
  const depthMaterial = useMemo(() => createPrintDepthMaterial(material), [material]);
  const halo = useMemo(() => createHotHaloMaterial(material), [material]);
  useEffect(
    () => () => {
      material.dispose();
      depthMaterial.dispose();
      halo.dispose();
    },
    [material, depthMaterial, halo],
  );

  const lines = useMemo(() => {
    const make = (c: string) =>
      new THREE.LineBasicMaterial({ color: c, transparent: true, depthWrite: false, toneMapped: false });
    return {
      major: make(SILVER),
      minor: make(PLATINUM),
      accent: make(GLOW),
      // Depth-only copy of the solid so lines on the far side stay hidden.
      occluder: new THREE.MeshBasicMaterial({
        colorWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    };
  }, []);
  useEffect(
    () => () => {
      lines.major.dispose();
      lines.minor.dispose();
      lines.accent.dispose();
      lines.occluder.dispose();
    },
    [lines],
  );
  const bulb = useMemo(
    () =>
      lamp
        ? {
            geometry: new THREE.SphereGeometry(lamp.bulbRadius, 32, 16),
            material: new THREE.MeshStandardMaterial({
              color: "#efe9df",
              roughness: 0.4,
              emissive: BULB,
              emissiveIntensity: 0,
            }),
          }
        : null,
    [lamp],
  );
  useEffect(
    () => () => {
      bulb?.geometry.dispose();
      bulb?.material.dispose();
    },
    [bulb],
  );

  // Imperative handles. three.js objects are mutated only through refs (in
  // effects and frame callbacks), never during render.
  const live = useRef<{ material: PrintMaterial; bulb: typeof bulb; lines: typeof lines; halo: typeof halo } | null>(null);
  useLayoutEffect(() => {
    live.current = { material, bulb, lines, halo };
  }, [material, bulb, lines, halo]);

  // Colour: the material starts at whatever is on screen and eases to the target.
  const shown = useRef<THREE.Color | null>(null);
  const target = useRef<THREE.Color | null>(null);
  useLayoutEffect(() => {
    const m = live.current?.material;
    if (!m) return;
    target.current ??= new THREE.Color();
    target.current.set(color.hex);
    shown.current ??= target.current.clone();
    m.color.copy(shown.current);
    syncPrintColors(m);
  }, [material, color.hex]);

  useLayoutEffect(() => {
    const m = live.current?.material;
    if (m && lamp) setPrintPattern(m, lamp.pattern.repeat, lamp.pattern.range);
  }, [material, lamp]);

  const occluderRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const linesRef = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const bulbMesh = useRef<THREE.Mesh>(null);
  const glowNow = useRef(0);
  const warm = useRef<THREE.Color | null>(null);

  useFrame((state, delta) => {
    const r = live.current;
    if (!r) return;
    const m = r.material;
    const dt = Math.min(delta, 0.1);
    const u = m.userData.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    // Colour ease.
    const s = shown.current;
    const t = target.current;
    if (s && t && !s.equals(t)) {
      s.lerp(t, 1 - Math.exp(-dt / COLOR_TAU));
      if (Math.abs(s.r - t.r) + Math.abs(s.g - t.g) + Math.abs(s.b - t.b) < 1e-3) s.copy(t);
      m.color.copy(s);
      syncPrintColors(m);
    }

    // Print progress (object space; the hot band rides just under it, and comes up over the first millimetres).
    const frac = clip ? clip.get() : clipHeight;
    const clipping = frac !== null && frac !== undefined && Number.isFinite(frac) && frac < 1;
    setPrintClip(m, frac, info.height);
    const heat = Math.max(read(hot), 0) * (clipping ? hotRamp((frac as number) * info.height) : 1);
    u.uHotIntensity.value = HOT_INTENSITY * heat;
    const haloOn = clipping ? Math.min(heat, 1) : 0;
    r.halo.uniforms.uHaloStrength.value = HALO_STRENGTH * haloOn;
    if (haloRef.current) haloRef.current.visible = haloOn > 0.002;
    const trail = hotTrail ? hotTrail.get() : null;
    if (trail === null) u.uHotTrail.value.y = 0;
    else u.uHotTrail.value.set(trail, 1);

    // Wireframe opacity and hidden-line occluder.
    if (wire) {
      const o = Math.min(Math.max(read(wireOpacity), 0), 1);
      r.lines.major.opacity = 0.9 * o;
      r.lines.minor.opacity = 0.42 * o;
      r.lines.accent.opacity = 0.8 * o;
      if (linesRef.current) linesRef.current.visible = o > 0.002;
      if (occluderRef.current) occluderRef.current.visible = o > 0.002 && read(occlude);
    }

    // Lamp bulb: hidden until the print has passed it, eased on and off.
    if (lamp && r.bulb) {
      const passed = !clipping || (frac as number) * info.height >= lamp.bulbY + lamp.bulbRadius * 0.5;
      const want = wireframe || !passed ? 0 : Math.min(Math.max(read(glow), 0), 1);
      glowNow.current += (want - glowNow.current) * (1 - Math.exp(-dt / GLOW_TAU));
      if (Math.abs(want - glowNow.current) < 1e-3) glowNow.current = want;
      const g = glowNow.current;
      const scale = (info.size.w / 1.4) ** 2;
      if (light.current) light.current.intensity = 1.6 * scale * g;
      r.bulb.material.emissiveIntensity = 3.2 * g;
      if (bulbMesh.current) bulbMesh.current.visible = passed && !wireframe;
      warm.current ??= new THREE.Color(BULB);
      u.uInnerGlow.value.copy(warm.current).multiplyScalar(0.035 * g);
    }
  });

  return (
    <group ref={ref}>
      {wire ? (
        <>
          <mesh ref={occluderRef} geometry={geometry} material={lines.occluder} />
          <group ref={linesRef}>
            <lineSegments geometry={wire.minor} material={lines.minor} renderOrder={1} />
            <lineSegments geometry={wire.major} material={lines.major} renderOrder={2} />
            <lineSegments geometry={wire.accent} material={lines.accent} renderOrder={2} />
          </group>
        </>
      ) : (
        <>
          <mesh
            geometry={geometry}
            material={material}
            customDepthMaterial={shadows ? depthMaterial : undefined}
            castShadow={shadows}
            receiveShadow={quality === "high"}
          />
          {clip || clipHeight !== undefined ? (
            <mesh ref={haloRef} geometry={geometry} material={halo} renderOrder={5} visible={false} />
          ) : null}
        </>
      )}
      {lamp && bulb && !wireframe ? (
        <>
          <mesh ref={bulbMesh} geometry={bulb.geometry} material={bulb.material} position={[0, lamp.bulbY, 0]} />
          {/* Always mounted (intensity 0 when off) so switching never changes the light count and recompiles shaders. */}
          <pointLight
            ref={light}
            color={BULB}
            intensity={0}
            distance={info.height * 1.1}
            decay={2}
            castShadow={false}
            position={[0, lamp.bulbY, 0]}
          />
        </>
      ) : null}
    </group>
  );
}
