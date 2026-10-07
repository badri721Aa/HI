"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { View } from "@react-three/drei";
import { useViewActivity } from "./activity";

/** What a scene's frame callbacks can read about their DOM box. */
export interface SceneViewApi {
  /** True while the box is on (or near) the screen. Skip per-frame work otherwise. */
  active: RefObject<boolean>;
  /** The box size in CSS px (kept current by a ResizeObserver). */
  size: RefObject<{ width: number; height: number }>;
}

/**
 * A DOM box whose contents render into the shared canvas (drei <View>, which
 * tunnels its children into <View.Port /> in SceneRoot). Safe to render
 * before the canvas exists: the children simply wait in the tunnel.
 *
 * The box is pointer-transparent; scenes are decorative, so their parents
 * mark them aria-hidden.
 */
export function SceneView({
  className,
  children,
}: {
  className?: string;
  children: (api: SceneViewApi) => ReactNode;
}) {
  const box = useRef<HTMLElement | null>(null);
  const { active, activeRef } = useViewActivity(box);
  const size = useRef({ width: 1, height: 1 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      size.current = { width: Math.max(el.clientWidth, 1), height: Math.max(el.clientHeight, 1) };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [api] = useState<SceneViewApi>(() => ({ active: activeRef, size }));

  return (
    <View
      ref={box as RefObject<HTMLElement>}
      className={className}
      style={{ pointerEvents: "none" }}
      visible={active}
    >
      {children(api)}
    </View>
  );
}
