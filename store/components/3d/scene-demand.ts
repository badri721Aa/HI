"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * Whether any 3D scene has asked for the shared canvas. Deliberately free of
 * three.js: SceneRoot mounts the canvas (and downloads three.js) only after a
 * scene wrapper (HeroPrint, ProcessScene, FailedPrint) has mounted, so pages
 * without 3D never pay for it. Once asked for, the canvas stays mounted for
 * the rest of the session (its frame loop stops whenever no view is on screen).
 */

let requested = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => requested;
const getServerSnapshot = () => false;

export function requestScene(): void {
  if (requested) return;
  requested = true;
  for (const l of listeners) l();
}

/** For SceneRoot: true once a scene has asked for the canvas. */
export function useSceneRequested(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** For scene wrappers: asks for the shared canvas once `enabled` (WebGL is usable). */
export function useSceneDemand(enabled: boolean): void {
  useEffect(() => {
    if (enabled) requestScene();
  }, [enabled]);
}
