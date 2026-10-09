"use client";

import type Lenis from "lenis";

/**
 * Shared smooth-scroll handle.
 *
 * Lenis is created with `autoRaf: false`. Exactly one driver advances it each
 * frame: the SmoothScroll provider runs its own rAF loop, unless the WebGL
 * scene has taken over (`driver.external = true`), in which case the scene
 * calls `lenis.raf(t)` from R3F's `addEffect` *before* rendering. That keeps
 * DOM-tracked 3D views locked to the page with no one-frame lag.
 */
export const scrollDriver: { lenis: Lenis | null; external: boolean; locks: number } = {
  lenis: null,
  external: false,
  /** Open drawers holding the page still. A Lenis created while this is > 0 must start stopped. */
  locks: 0,
};

/** Freezes page scrolling (native and Lenis). Nested calls share one lock; pair each with unlockScroll(). */
export function lockScroll() {
  if (scrollDriver.locks++ > 0) return;
  scrollDriver.lenis?.stop();
  document.documentElement.style.overflow = "hidden";
}

export function unlockScroll() {
  scrollDriver.locks = Math.max(0, scrollDriver.locks - 1);
  if (scrollDriver.locks > 0) return;
  scrollDriver.lenis?.start();
  document.documentElement.style.overflow = "";
}

export function isScrollLocked() {
  return scrollDriver.locks > 0;
}

export function getLenis(): Lenis | null {
  return scrollDriver.lenis;
}

/** Smooth-scrolls to a section id (without "#"), accounting for the fixed header. */
export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const offset = -72;
  const lenis = scrollDriver.lenis;
  if (lenis) lenis.scrollTo(target, { offset, duration: 1.2 });
  else {
    // No Lenis means reduced motion (or not mounted yet): honour it, JS "smooth" ignores the CSS override.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reduced ? "instant" : "smooth" });
  }
}
