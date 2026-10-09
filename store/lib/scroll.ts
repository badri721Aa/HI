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

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Room the fixed header takes at the top of the viewport: the html's
 * scroll-padding-top (globals.css), which native focus and fragment
 * scrolling already honour, so anchors land where Tab would put them.
 */
export function headerOffset(): number {
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
  return Number.isFinite(padding) ? padding : 72;
}

/** Page offset that puts `el` just below the fixed header. A number, so Lenis doesn't add the scroll padding again. */
export function anchorTop(el: Element): number {
  return el.getBoundingClientRect().top + window.scrollY - headerOffset();
}

/** Instantly puts the page at `y`, keeping Lenis in step. */
export function jumpToY(y: number) {
  scrollDriver.lenis?.scrollTo(y, { immediate: true, force: true });
  // Lenis skips a target it already holds, even when the page has moved under it; its native scroll handler then catches up.
  if (Math.abs(window.scrollY - y) >= 1) window.scrollTo({ top: y, behavior: "instant" });
}

/** Smooth-scrolls to a section id (without "#"), accounting for the fixed header. */
export function scrollToId(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const top = anchorTop(target);
  const lenis = scrollDriver.lenis;
  if (lenis) lenis.scrollTo(top, { duration: 1.2 });
  // No Lenis means reduced motion (or not mounted yet): honour it, JS "smooth" ignores the CSS override.
  else window.scrollTo({ top, behavior: prefersReduced() ? "instant" : "smooth" });
}

/** Scrolls to the top of the page: smooth by default, instant with reduced motion or `immediate`. */
export function scrollToTop({ immediate = false }: { immediate?: boolean } = {}) {
  const instant = immediate || prefersReduced();
  const lenis = scrollDriver.lenis;
  if (lenis) lenis.scrollTo(0, { immediate: instant, force: true, duration: 1.2 });
  else window.scrollTo({ top: 0, behavior: instant ? "instant" : "smooth" });
}
