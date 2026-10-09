"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { readLive as read, type Live } from "../core/live";

/*
 * The printer's build plate: a dark satin slab whose bevelled edge catches
 * the studio light (the "rim"), with a faint 10 mm / 50 mm grid printed on
 * its top that fades out towards the edges, and a soft contact shadow under
 * the piece. The plate's top surface is y = 0.
 */

const PLATE_VERT_DECL = /* glsl */ `
varying vec3 vPlatePos;
varying float vPlateNy;
`;
const PLATE_VERT = /* glsl */ `
vPlatePos = position;
vPlateNy = normal.y;
`;
const PLATE_FRAG_DECL = /* glsl */ `
uniform float uPlateHalf;
uniform float uPlateCell;
uniform vec3 uPlateLine;
varying vec3 vPlatePos;
varying float vPlateNy;
float plateGrid( vec2 p, float cell, float width ) {
  vec2 g = p / cell;
  vec2 fw = max( fwidth( g ), vec2( 1.0e-5 ) );
  vec2 d = abs( fract( g - 0.5 ) - 0.5 ) / fw;
  float line = 1.0 - min( min( d.x, d.y ) / width, 1.0 );
  // Fade lines out before they get denser than ~3 px (no moiré at grazing angles).
  float dens = max( fw.x, fw.y );
  return line * ( 1.0 - smoothstep( 0.12, 0.35, dens ) );
}
`;
const PLATE_FRAG = /* glsl */ `
{
  float top = smoothstep( 0.6, 0.95, vPlateNy );
  vec2 q = abs( vPlatePos.xz ) / uPlateHalf;
  float r = length( vPlatePos.xz ) / uPlateHalf;
  float fade = ( 1.0 - smoothstep( 0.25, 0.95, r ) ) * ( 1.0 - smoothstep( 0.86, 0.97, max( q.x, q.y ) ) );
  float minor = plateGrid( vPlatePos.xz, uPlateCell, 1.0 );
  float major = plateGrid( vPlatePos.xz, uPlateCell * 5.0, 1.2 );
  totalEmissiveRadiance += uPlateLine * ( 0.03 * minor + 0.085 * major ) * fade * top;
}
`;

function plateMaterial(half: number) {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#16161b",
    roughness: 0.42,
    metalness: 0.15,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.9,
    // A piece's base sits exactly on y = 0: push the plate back in depth so
    // the first layer always wins instead of z-fighting into a starburst.
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const uniforms = {
    uPlateHalf: { value: half },
    uPlateCell: { value: 0.1 },
    uPlateLine: { value: new THREE.Color("#c8ccd2") },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${PLATE_VERT_DECL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${PLATE_VERT}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${PLATE_FRAG_DECL}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${PLATE_FRAG}`);
  };
  m.customProgramCacheKey = () => "build-plate-v1";
  return m;
}

/* Contact shadow: a radial falloff under the footprint plus a tight dark core. */
const SHADOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const SHADOW_FRAG = /* glsl */ `
uniform float uInner;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float r = length( vUv );
  float soft = 1.0 - smoothstep( uInner * 0.6, 1.0, r );
  float core = 1.0 - smoothstep( uInner * 0.92, uInner * 1.12, r );
  float a = ( soft * soft * 0.55 + core * 0.35 ) * uOpacity;
  gl_FragColor = vec4( 0.0, 0.0, 0.0, a );
}
`;

export interface BuildPlateProps {
  /** Plate width/depth in model units (1 = 100 mm). */
  size: number;
  /** Slab thickness. */
  thickness?: number;
  /** Footprint radius of the piece (model units) for the contact shadow; 0 = no shadow. */
  shadowRadius?: number;
  /** 0–1 strength of the contact shadow (e.g. grows with the first layers). */
  shadow?: Live<number>;
}

export function BuildPlate({ size, thickness = 0.06, shadowRadius = 0, shadow = 1 }: BuildPlateProps) {
  const half = size / 2;
  const geometry = useMemo(
    () => new RoundedBoxGeometry(size, thickness, size, 4, Math.min(0.035, thickness * 0.45)),
    [size, thickness],
  );
  const material = useMemo(() => plateMaterial(half), [half]);

  const shadowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const shadowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        uniforms: { uInner: { value: 0.5 }, uOpacity: { value: 1 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
    },
    [geometry, material, shadowGeo, shadowMat],
  );

  // Frame callbacks reach the material through a ref (never mutate memoised values directly).
  const live = useRef<THREE.ShaderMaterial | null>(null);
  useLayoutEffect(() => {
    live.current = shadowMat;
  }, [shadowMat]);

  const outer = shadowRadius * 1.9;
  useFrame(() => {
    const m = live.current;
    if (!m || !shadowRadius) return;
    m.uniforms.uInner.value = shadowRadius / outer;
    m.uniforms.uOpacity.value = Math.min(Math.max(read(shadow), 0), 1);
  });

  return (
    <group>
      <mesh geometry={geometry} material={material} position={[0, -thickness / 2, 0]} renderOrder={-2} />
      {shadowRadius > 0 ? (
        <mesh
          geometry={shadowGeo}
          material={shadowMat}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.0008, 0]}
          scale={[outer * 2, outer * 2, 1]}
          renderOrder={-1}
        />
      ) : null}
    </group>
  );
}
