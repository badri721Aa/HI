"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/*
 * Which 3D views are on (or near) the screen. The shared canvas only runs its
 * frame loop while at least one view is active, and each scene skips its
 * per-frame work while its own view is away.
 */

const active = new Set<symbol>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export const viewActivity = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  count: () => active.size,
};

/** Starts a little before the view scrolls in, so its first frame is ready. */
const MARGIN = "25% 0px 25% 0px";

/**
 * Tracks whether the element is within (or near) the viewport and registers
 * it with the canvas. Returns the state for React (e.g. drei View `visible`)
 * and a ref for frame callbacks.
 */
export function useViewActivity(target: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  const onRef = useRef(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const id = Symbol("view");
    const set = (v: boolean) => {
      if (onRef.current === v) return;
      onRef.current = v;
      setOn(v);
      if (v) active.add(id);
      else active.delete(id);
      emit();
    };
    const io = new IntersectionObserver((entries) => set(entries[entries.length - 1]?.isIntersecting ?? false), {
      rootMargin: MARGIN,
    });
    io.observe(el);
    return () => {
      io.disconnect();
      onRef.current = false;
      if (active.delete(id)) emit();
    };
  }, [target]);

  return { active: on, activeRef: onRef };
}
