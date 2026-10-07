"use client";

import { useSyncExternalStore } from "react";
import { scrollDriver } from "@/lib/scroll";

/** Current page scroll progress, 0 at the top and 1 at the bottom. */
export function getScrollProgress(): number {
  const lenis = scrollDriver.lenis;
  if (lenis && lenis.limit > 0) return clamp01(lenis.animatedScroll / lenis.limit);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

function clamp01(v: number) {
  // Rounded so the store only reports meaningful changes.
  return Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
}

/**
 * Calls `onChange` at most once per animation frame while the page scrolls
 * or resizes. Listens to Lenis (when smooth scroll is on) and to native
 * scroll, which also covers Lenis being created or destroyed later.
 */
export function subscribeScrollProgress(onChange: () => void): () => void {
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onChange();
    });
  };
  const offLenis = scrollDriver.lenis?.on("scroll", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    offLenis?.();
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  };
}

/** Page scroll progress 0 → 1, updated from Lenis when available. 0 during SSR. */
export function useScrollProgress(): number {
  return useSyncExternalStore(subscribeScrollProgress, getScrollProgress, () => 0);
}
