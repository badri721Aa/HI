"use client";

import Lenis from "lenis";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { anchorTop, isScrollLocked as drawerLocked, scrollDriver, scrollToId, scrollToTop } from "@/lib/scroll";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

// The header and footer import it from here.
export { scrollToTop };

/**
 * While the 3D scene drives Lenis (`scrollDriver.external`), this loop still
 * steps in if the scene stops calling `raf` for this long (paused or
 * on-demand frameloop, lost WebGL context), so scrolling never freezes.
 */
const STALL_MS = 120;
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

const expoOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

function prefersReduced() {
  return window.matchMedia(REDUCED_QUERY).matches;
}

/** A drawer (or anything else) holds the page scroll lock. */
function isScrollLocked() {
  return drawerLocked() || document.documentElement.style.overflow === "hidden" || Boolean(scrollDriver.lenis?.isStopped);
}

/**
 * Calls `run(el)` once the element with `id` exists and the page can scroll
 * (e.g. after a menu drawer has closed and released its lock). Gives up
 * after ~2 s. Returns a cancel function.
 */
function whenScrollable(id: string, run: (el: HTMLElement) => void, maxFrames = 120): () => void {
  let frame = 0;
  let tries = 0;
  let cancelled = false;
  const tick = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (el && !isScrollLocked()) return run(el);
    if (++tries > maxFrames) return;
    frame = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/** Instantly puts `el` just below the fixed header (the html's scroll-padding-top, as scrollToId uses). */
function jumpTo(el: HTMLElement) {
  const top = anchorTop(el);
  const lenis = scrollDriver.lenis;
  if (lenis) lenis.scrollTo(top, { immediate: true, force: true });
  else window.scrollTo({ top, behavior: "instant" });
}

/**
 * Moves keyboard focus to an in-page target without scrolling, so the next
 * Tab continues from there (what a native anchor jump does). Non-focusable
 * targets get a temporary tabindex and no focus ring.
 */
function focusTarget(el: HTMLElement) {
  if (!el.hasAttribute("tabindex") && el.tabIndex < 0) {
    el.setAttribute("tabindex", "-1");
    el.style.outline = "none";
    el.addEventListener(
      "blur",
      () => {
        el.removeAttribute("tabindex");
        el.style.outline = "";
      },
      { once: true },
    );
  }
  el.focus({ preventScroll: true });
}

const trimSlash = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

/**
 * Smooth scrolling and in-page navigation for the whole site.
 *
 * - Lenis (autoRaf off) with an expo-out wheel curve; native touch scrolling
 *   on phones. Stored in `scrollDriver.lenis`. This component's rAF loop
 *   advances it only while `scrollDriver.external` is false; when the WebGL
 *   scene takes over it calls `lenis.raf` before rendering (scroll-sync
 *   contract), and the loop resumes as soon as the scene hands back.
 * - Reduced motion: no Lenis at all (native scroll).
 * - Same-page anchors (`#id`, `/{locale}#id` on `/{locale}`) scroll smoothly
 *   below the header and put the hash in the URL with replaceState.
 * - Route changes start at the top, or at the URL's #section when present.
 *   Back/forward keep the browser's scroll position.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const pathname = usePathname();
  const first = useRef(true);
  const pop = useRef<{ path: string; at: number } | null>(null);
  const pending = useRef<(() => void) | null>(null);

  // Lenis + the frame loop.
  useEffect(() => {
    if (reduced || prefersReduced()) return;

    const lenis = new Lenis({
      autoRaf: false,
      duration: 1.1,
      easing: expoOut,
      smoothWheel: true,
      syncTouch: false,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
    });

    // Note who advanced Lenis last, so the stall guard below knows whether the scene is still driving.
    const baseRaf = lenis.raf;
    let ownCall = false;
    let lastExternal = -Infinity;
    lenis.raf = (time: number) => {
      if (!ownCall) lastExternal = time;
      baseRaf(time);
    };
    scrollDriver.lenis = lenis;
    // A drawer can lock the page before this effect runs (child effects first, e.g. a menu still open
    // across a remount); a Lenis born unlocked would scroll behind it.
    if (scrollDriver.locks > 0) lenis.stop();

    let frame = 0;
    const loop = (time: number) => {
      if (!scrollDriver.external || time - lastExternal > STALL_MS) {
        ownCall = true;
        try {
          lenis.raf(time);
        } finally {
          ownCall = false;
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      if (scrollDriver.lenis === lenis) scrollDriver.lenis = null;
      lenis.destroy();
    };
  }, [reduced]);

  // Same-page anchor links. Capture phase on window runs before React's
  // handlers, so next/link sees defaultPrevented and doesn't navigate.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      if (!anchor.getAttribute("href")?.includes("#")) return;

      const url = new URL(anchor.href, window.location.href);
      const here = window.location;
      if (url.origin !== here.origin || url.search !== here.search) return;
      if (trimSlash(url.pathname) !== trimSlash(here.pathname)) return;
      let id: string;
      try {
        id = decodeURIComponent(url.hash.slice(1));
      } catch {
        return;
      }
      if (!id || !document.getElementById(id)) return;

      e.preventDefault();
      const keyboard = e.detail === 0;
      const next = id === "top" ? url.pathname + url.search : url.pathname + url.search + url.hash;
      // Keep Next's history state; only the URL changes.
      window.history.replaceState(window.history.state, "", next);

      pending.current?.();
      pending.current = whenScrollable(id, (el) => {
        pending.current = null;
        if (id === "top") scrollToTop();
        else scrollToId(id);
        if (keyboard) focusTarget(el);
      });
    };

    const onPopState = () => {
      pop.current = { path: window.location.pathname, at: performance.now() };
    };

    window.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      pending.current?.();
    };
  }, []);

  // Route changes.
  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    const popped = pop.current;
    pop.current = null;
    const isPop = !!popped && trimSlash(popped.path) === trimSlash(pathname) && performance.now() - popped.at < 10_000;

    let hash = "";
    try {
      hash = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      hash = "";
    }

    pending.current?.();
    pending.current = null;

    // Back/forward: the browser and Next restore the position; just re-measure.
    if (isPop) {
      scrollDriver.lenis?.resize();
      return;
    }

    if (hash) {
      if (isFirst) {
        // Reloads restore their own position; only fresh visits jump to the hash.
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (nav && nav.type !== "navigate") return;
      }
      pending.current = whenScrollable(hash, (el) => {
        pending.current = null;
        jumpTo(el);
      });
      return () => {
        pending.current?.();
        pending.current = null;
      };
    }

    if (!isFirst) {
      scrollDriver.lenis?.resize();
      scrollToTop({ immediate: true });
    }
  }, [pathname]);

  return <>{children}</>;
}
