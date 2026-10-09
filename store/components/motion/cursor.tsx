"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useI18n } from "@/components/providers/i18n-provider";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useFinePointer } from "./shared";

/** Ring diameter (px): at rest, over a `data-cursor` element, and over plain links and buttons. */
const SIZE = { rest: 28, label: 76, link: 12 } as const;
const FOLLOW = { stiffness: 520, damping: 40, mass: 0.5 };
const MORPH = { stiffness: 320, damping: 30 };
const FADE = { stiffness: 400, damping: 40 };

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
const INTERACTIVE = 'a[href], button, [role="button"], label[for], summary';

export type CursorMode = "hidden" | "rest" | "link" | "label";

/** Whether a link's ::after is laid over a larger area (a card's stretched title link), per element. */
const stretchedCache = new WeakMap<Element, boolean>();

function isStretched(el: Element): boolean {
  let stretched = stretchedCache.get(el);
  if (stretched === undefined) {
    stretched = getComputedStyle(el, "::after").position === "absolute";
    stretchedCache.set(el, stretched);
  }
  return stretched;
}

/** The point is on the element's own boxes (a link's text), not on an overlay it stretches beyond them. */
function onOwnBox(el: Element, x: number, y: number): boolean {
  for (const r of el.getClientRects()) {
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

/**
 * What the ring shows with the pointer over `target` at (x, y): `key` is the
 * `data-cursor` label key in "label" mode. `byPoint` means the answer depends
 * on where in the target the pointer is (a stretched link: label over the
 * area it covers, link over its own text), so moves within it re-ask.
 */
export function cursorModeAt(target: Element, x: number, y: number): { mode: CursorMode; key?: string; byPoint: boolean } {
  if (target.closest(TEXT_ENTRY)) return { mode: "hidden", byPoint: false };
  const interactive = target.closest(INTERACTIVE);
  const tagged = target.closest<HTMLElement>("[data-cursor]");
  let byPoint = false;
  if (tagged) {
    // A link or button nested in the labelled area (the eye button on a photo) is a target of its own.
    const nested = !!interactive && interactive !== tagged && tagged.contains(interactive);
    byPoint = !nested && interactive === tagged && isStretched(tagged);
    if (!nested && !(byPoint && onOwnBox(tagged, x, y))) return { mode: "label", key: tagged.dataset.cursor ?? "", byPoint };
  }
  return { mode: interactive ? "link" : "rest", byPoint };
}

/**
 * Desktop cursor ring: a thin circle that trails the pointer on a light
 * spring, next to the native cursor (which stays). Over `data-cursor="<key>"`
 * elements it grows and shows that key's label from `t.site.cursor` (view,
 * drag, open); over plain links and buttons it shrinks, including a button
 * inside a labelled area (a photo's quick-view button) and a stretched link's
 * own text (a card's title), so the label never prints across them; it hides
 * over text fields and when the pointer leaves the window. Fine hovering
 * pointers only, and never under reduced motion. Driven by motion values: no
 * React renders while the pointer moves. Portals to <body>, so it can be
 * mounted anywhere inside the providers.
 */
export function Cursor() {
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  if (!fine || reduced) return null;
  return createPortal(<CursorRing />, document.body);
}

function CursorRing() {
  const { t } = useI18n();
  const labels: Record<string, string | undefined> = t.site.cursor;
  const labelRef = useRef<HTMLSpanElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const followX = useSpring(x, FOLLOW);
  const followY = useSpring(y, FOLLOW);
  const size = useSpring(SIZE.rest, MORPH);
  const opacity = useSpring(0, FADE);
  const labelOpacity = useSpring(0, FADE);

  useEffect(() => {
    let mode: CursorMode = "hidden";
    let label = "";
    let lastTarget: EventTarget | null = null;
    /** The mode depends on where in the target the pointer is, so moving within it re-checks. */
    let byPoint = false;

    const apply = (next: CursorMode, nextLabel = "") => {
      if (next === mode && nextLabel === label) return;
      mode = next;
      label = nextLabel;
      if (next !== "hidden") size.set(SIZE[next]);
      opacity.set(next === "hidden" ? 0 : 1);
      if (labelRef.current && nextLabel) labelRef.current.textContent = nextLabel;
      labelOpacity.set(nextLabel ? 1 : 0);
    };

    const retarget = (target: EventTarget | null, px: number, py: number) => {
      if (target === lastTarget && !byPoint) return;
      lastTarget = target;
      byPoint = false;
      if (!(target instanceof Element)) return;
      const next = cursorModeAt(target, px, py);
      byPoint = next.byPoint;
      apply(next.mode, next.mode === "label" ? (labels[next.key ?? ""] ?? "") : "");
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (mode === "hidden" && lastTarget === null) {
        // First move (or back from outside the window): appear at the pointer, not trailing in from elsewhere.
        followX.jump(e.clientX);
        followY.jump(e.clientY);
      }
      x.set(e.clientX);
      y.set(e.clientY);
      retarget(e.target, e.clientX, e.clientY);
    };

    // Scrolling moves the page under a still pointer: re-read what it is over, once per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame || lastTarget === null) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (lastTarget !== null) retarget(document.elementFromPoint(x.get(), y.get()), x.get(), y.get());
      });
    };

    const onLeave = () => {
      lastTarget = null;
      byPoint = false;
      apply("hidden");
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [labels, x, y, followX, followY, size, opacity, labelOpacity]);

  return (
    // Placed by viewport coordinates, so physical left/top are right in both directions.
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] mix-blend-difference"
      style={{ x: followX, y: followY, opacity }}
    >
      <motion.div
        className="flex items-center justify-center rounded-full border border-fg/40"
        style={{ width: size, height: size, x: "-50%", y: "-50%" }}
      >
        <motion.span
          ref={labelRef}
          className="whitespace-nowrap font-mono text-[0.625rem] uppercase leading-none tracking-[0.14em] text-fg"
          style={{ opacity: labelOpacity }}
        />
      </motion.div>
    </motion.div>
  );
}
