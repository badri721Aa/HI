"use client";

import { useSyncExternalStore } from "react";
import { trackEvent } from "@/lib/telemetry";

/*
 * Whether the shared WebGL scene should run on this device.
 *
 * - Probed once per page load: a WebGL2 context that the browser is willing
 *   to create without a "major performance caveat" (software rendering, a
 *   blocklisted GPU). On those devices the scenes show their SVG silhouettes
 *   instead of an animation that would crawl.
 * - Off when the visitor has asked to save data (Save-Data / Lite mode):
 *   the silhouettes cost nothing, three.js is ~250 KB.
 * - Flipped to false for the rest of the session when the scene fails
 *   (lost context, a render error): see markWebGLUnsupported().
 * Each fallback is reported once as a "webgl_fallback" analytics event.
 */

let probed: boolean | undefined;
let failed = false;
const listeners = new Set<() => void>();

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

function probe(): boolean {
  if (probed !== undefined) return probed;
  probed = false;
  if (saveData()) {
    trackEvent("webgl_fallback", { reason: "save-data" });
    return probed;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (gl) {
      probed = true;
      // Free the probe's context right away; the scene creates its own.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    probed = false;
  }
  if (!probed) trackEvent("webgl_fallback", { reason: "unsupported" });
  return probed;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => !failed && probe();
const getServerSnapshot = () => null;

/** true/false once checked on the client; null during SSR and hydration. */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Switches every scene to its fallback (e.g. after the WebGL context was lost). */
export function markWebGLUnsupported(reason = "failed"): void {
  if (failed) return;
  failed = true;
  trackEvent("webgl_fallback", { reason });
  for (const l of listeners) l();
}
