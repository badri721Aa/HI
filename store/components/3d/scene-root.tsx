"use client";

import { useEffect, useInsertionEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, addEffect, useFrame, type RootState } from "@react-three/fiber";
import { PerformanceMonitor, View } from "@react-three/drei";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { scrollDriver } from "@/lib/scroll";
import { useUI } from "@/lib/store/ui";
import { disposeGeometryCache } from "./geometry";
import { printPointer } from "./materials";
import { damp } from "./scenes/easing";
import { viewActivity } from "./scenes/activity";
import { markWebGLUnsupported } from "./webgl-support";

/*
 * The single shared WebGL canvas. It is fixed over the whole viewport (above
 * page content, below the header and drawers, and transparent to pointer
 * events); every 3D scene on the page is a drei <View> whose DOM box decides
 * where it draws. One context, one set of compiled shaders, one frame loop.
 *
 * - Frame loop: runs only while a view is on (or near) the screen, the tab is
 *   visible and no drawer covers the page; otherwise it stops completely (the
 *   last frame stays on screen behind the drawer's backdrop).
 * - Scroll sync: while running, Lenis is advanced from R3F's addEffect, before
 *   the views measure their boxes, so 3D stays locked to the page with no
 *   one-frame lag. When the loop stops it hands Lenis back to SmoothScroll.
 * - Resolution: DPR adapts between 1 and 1.75 to hold the frame rate.
 * - A lost context switches every scene to its SVG fallback for the session.
 */

const MAX_DPR = 1.75;
/** Keep running briefly after the last view leaves, so the canvas is cleared. */
const LINGER_MS = 250;
/** Pointer smoothing for the print material's light response (s). */
const POINTER_TAU = 0.35;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isHidden = () => document.hidden;
const isHiddenOnServer = () => false;
const countOnServer = () => 0;
const selectCovered = (s: { cartOpen: boolean; navOpen: boolean; quickView: string | null }) =>
  s.cartOpen || s.navOpen || s.quickView !== null;

/** Canvases mounted right now (two can overlap while a route transition keeps the old page). */
let liveCanvases = 0;

function useRunning(): boolean {
  const views = useSyncExternalStore(viewActivity.subscribe, viewActivity.count, countOnServer);
  const hidden = useSyncExternalStore(subscribeVisibility, isHidden, isHiddenOnServer);
  const covered = useUI(selectCovered);
  const want = views > 0 && !hidden && !covered;

  // Stop LINGER_MS after the last view leaves; start at once when one arrives.
  const [prevWant, setPrevWant] = useState(want);
  const [stopped, setStopped] = useState(!want);
  if (want !== prevWant) {
    setPrevWant(want);
    setStopped(false);
  }
  useEffect(() => {
    if (want) return;
    const id = window.setTimeout(() => setStopped(true), LINGER_MS);
    return () => window.clearTimeout(id);
  }, [want]);

  return want || !stopped;
}

/**
 * Views render with scissor and autoClear off, so nothing else clears what
 * they leave behind (a view that just scrolled out, a closed page). Clearing
 * the whole drawing buffer first costs next to nothing and keeps it clean.
 */
function ClearEachFrame() {
  useFrame(({ gl }) => {
    gl.setRenderTarget(null);
    gl.setScissorTest(false);
    gl.clear(true, true, false);
  }, -100);
  return null;
}

/**
 * Feeds the print material's uMouse (the light follows the cursor a little).
 * The canvas ignores pointer events, so this listens on the window; fine
 * pointers only, and never with reduced motion.
 */
function PointerLight() {
  const reduced = useReducedMotion();
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    target.current.x = 0;
    target.current.y = 0;
    if (reduced || !window.matchMedia("(pointer: fine)").matches) {
      printPointer.value.set(0, 0);
      return;
    }
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  useFrame((_, delta) => {
    const m = printPointer.value;
    const dt = Math.min(delta, 0.1);
    m.set(damp(m.x, target.current.x, POINTER_TAU, dt), damp(m.y, target.current.y, POINTER_TAU, dt));
  }, -90);
  return null;
}

export function SceneCanvas() {
  const running = useRunning();
  const frameloop = running ? "always" : "never";
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, MAX_DPR));
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const root = useRef<RootState | null>(null);

  // Lenis follows the scene's frame loop while it runs.
  useEffect(() => {
    if (!running) return;
    scrollDriver.external = true;
    const remove = addEffect((time) => {
      scrollDriver.lenis?.raf(time);
    });
    return () => {
      remove();
      scrollDriver.external = false;
    };
  }, [running]);

  // A hidden <Activity> (Next keeps recent routes mounted but hidden) runs
  // this cleanup but keeps R3F's root alive, frozen on frameloop="always":
  // stop the loop here, and restore it when the canvas is shown again.
  useLayoutEffect(() => {
    const state = root.current?.get();
    if (state && state.frameloop !== frameloop) state.setFrameloop(frameloop);
    return () => {
      const current = root.current?.get();
      if (current && current.frameloop !== "never") current.setFrameloop("never");
    };
  }, [frameloop]);

  // Insertion effects survive an <Activity> hiding the canvas (R3F keeps its
  // root by the same rule), so the shared geometry is freed only on a real
  // unmount of the last canvas.
  useInsertionEffect(() => {
    liveCanvases++;
    return () => {
      if (--liveCanvases === 0) disposeGeometryCache();
    };
  }, []);

  // A lost context (GPU reset, too many contexts) ends the 3D layer for this
  // session. Layout cleanup runs before R3F's own teardown, whose
  // forceContextLoss() must not be mistaken for a failure.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = () => markWebGLUnsupported();
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, []);

  const deviceDpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);

  return (
    <Canvas
      ref={canvasRef}
      aria-hidden="true"
      frameloop={frameloop}
      dpr={dpr}
      resize={{ scroll: false }}
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        powerPreference: "high-performance",
      }}
      onCreated={(state) => {
        root.current = state;
        state.gl.setClearColor(0x000000, 0);
        state.gl.toneMapping = THREE.ACESFilmicToneMapping;
        state.gl.toneMappingExposure = 1;
        state.gl.outputColorSpace = THREE.SRGBColorSpace;
        // Fade the layer in once the first frame is on screen.
        requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
      }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 5,
        pointerEvents: "none",
        opacity: ready ? 1 : 0,
        transition: "opacity 900ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <PerformanceMonitor
        factor={0.85}
        flipflops={3}
        onChange={({ factor }) => setDpr(Math.min(deviceDpr, Math.round((1 + (MAX_DPR - 1) * factor) * 8) / 8))}
        onFallback={() => setDpr(1)}
      />
      <ClearEachFrame />
      <PointerLight />
      <View.Port />
    </Canvas>
  );
}

export default SceneCanvas;
