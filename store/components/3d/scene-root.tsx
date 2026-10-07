"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, addEffect, useFrame } from "@react-three/fiber";
import { PerformanceMonitor, View } from "@react-three/drei";
import * as THREE from "three";
import { scrollDriver } from "@/lib/scroll";
import { disposeGeometryCache } from "./geometry";
import { viewActivity } from "./scenes/activity";
import { markWebGLUnsupported } from "./webgl-support";

/*
 * The single shared WebGL canvas. It is fixed over the whole viewport (above
 * page content, below the header and drawers, and transparent to pointer
 * events); every 3D scene on the page is a drei <View> whose DOM box decides
 * where it draws. One context, one set of compiled shaders, one frame loop.
 *
 * - Frame loop: runs only while a view is on (or near) the screen and the
 *   tab is visible; otherwise it stops completely.
 * - Scroll sync: while running, Lenis is advanced from R3F's addEffect, before
 *   the views measure their boxes, so 3D stays locked to the page with no
 *   one-frame lag. When the loop stops it hands Lenis back to SmoothScroll.
 * - Resolution: DPR adapts between 1 and 1.75 to hold the frame rate.
 * - A lost context switches every scene to its SVG fallback for the session.
 */

const MAX_DPR = 1.75;
/** Keep running briefly after the last view leaves, so the canvas is cleared. */
const LINGER_MS = 250;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isHidden = () => document.hidden;
const isHiddenOnServer = () => false;
const countOnServer = () => 0;

function useRunning(): boolean {
  const views = useSyncExternalStore(viewActivity.subscribe, viewActivity.count, countOnServer);
  const hidden = useSyncExternalStore(subscribeVisibility, isHidden, isHiddenOnServer);
  const want = views > 0 && !hidden;

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

export function SceneCanvas() {
  const running = useRunning();
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, MAX_DPR));
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  useEffect(() => () => disposeGeometryCache(), []);

  const deviceDpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);

  return (
    <Canvas
      ref={canvasRef}
      aria-hidden="true"
      frameloop={running ? "always" : "never"}
      dpr={dpr}
      resize={{ scroll: false }}
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        powerPreference: "high-performance",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = THREE.SRGBColorSpace;
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
      <View.Port />
    </Canvas>
  );
}

export default SceneCanvas;
