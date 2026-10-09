"use client";

import dynamic from "next/dynamic";
import { useSceneRequested } from "./scene-demand";
import { ThreeBoundary } from "./scenes/three-boundary";
import { markWebGLUnsupported, useWebGLSupport } from "./webgl-support";

/* three.js loads only on capable clients, after a scene has asked for it. */
const SceneCanvas = dynamic(() => import("./scene-root"), { ssr: false });

/**
 * Mounts the single shared, fixed WebGL canvas that every 3D view on the
 * page draws into. Renders nothing until a scene asks for it (so pages
 * without 3D never load three.js), on the server, on devices without a
 * capable WebGL2, and after the scene has failed (the views then show
 * their SVG silhouettes instead).
 */
export function SceneRoot() {
  const requested = useSceneRequested();
  return requested ? <SharedCanvas /> : null;
}

function SharedCanvas() {
  const supported = useWebGLSupport();
  if (!supported) return null;
  return (
    <ThreeBoundary onError={markWebGLUnsupported}>
      <SceneCanvas />
    </ThreeBoundary>
  );
}
