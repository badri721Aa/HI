"use client";

import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";

/** ease-out-expo, the house curve. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Attribute that holds an element in its pre-reveal state until it scrolls into view. */
export const WAIT_ATTR = "data-motion-wait";

/*
 * Entrance animations run as CSS keyframes, not JS: they start on the first
 * paint of the server HTML (no waiting for hydration, so the hero's LCP text
 * shows immediately) and need no per-element animation runtime.
 * `useViewTrigger` then holds anything that is off screen at hydration in its
 * "from" state until it scrolls into view.
 *
 * Fill mode is `backwards` (not `both`): once finished, no animation effect
 * lingers, so revealed elements don't keep a stacking context or a
 * containing block for fixed descendants.
 */
const CSS = `
@keyframes infill-reveal {
  from { opacity: 0; transform: translate3d(0, var(--reveal-y, 16px), 0); filter: blur(6px); }
}
@keyframes infill-word {
  from { opacity: 0; transform: translate3d(0, 0.38em, 0); filter: blur(8px); }
}
.infill-reveal { animation: infill-reveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
.infill-word { display: inline-block; animation: infill-word 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
[${WAIT_ATTR}].infill-reveal, [${WAIT_ATTR}] .infill-word { animation: none; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .infill-reveal, .infill-word { animation: none !important; }
  [${WAIT_ATTR}].infill-reveal, [${WAIT_ATTR}] .infill-word { opacity: 1; }
}
`;

/** Keyframes for Reveal and SplitText. React hoists it into <head> once (deduped by href). */
export function MotionStyles() {
  return (
    <style href="infill-motion" precedence="infill-motion">
      {CSS}
    </style>
  );
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Holds an element in its pre-reveal state while it is off screen and
 * releases it (restarting its CSS entrance animation) once it enters the
 * viewport, shrunk by `margin`. Elements already on screen when this runs are
 * left alone: their animation started with the first paint.
 * With `once: false` the element re-hides on leaving and plays again on return.
 */
export function useViewTrigger(
  ref: RefObject<HTMLElement | null>,
  { once = true, margin = "-10% 0px -10% 0px", mode = "auto" }: { once?: boolean; margin?: string; mode?: "auto" | "mount" } = {},
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || mode === "mount" || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia(REDUCED_QUERY).matches) return;

    const rect = el.getBoundingClientRect();
    const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && (rect.width > 0 || rect.height > 0);
    if (onScreen && once) return;
    if (!onScreen) el.setAttribute(WAIT_ATTR, "");

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          el.removeAttribute(WAIT_ATTR);
          if (once) io.disconnect();
        } else if (!once) {
          // Fully out of the (unshrunk) viewport: re-arm so it plays again on the way back.
          const r = entry.boundingClientRect;
          if (r.bottom < 0 || r.top > window.innerHeight) el.setAttribute(WAIT_ATTR, "");
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.removeAttribute(WAIT_ATTR);
    };
  }, [ref, once, margin, mode]);
}

const FINE_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeFine(cb: () => void) {
  const mq = window.matchMedia(FINE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True on devices with a precise hovering pointer (mouse, trackpad). False during SSR. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFine,
    () => window.matchMedia(FINE_QUERY).matches,
    () => false,
  );
}
