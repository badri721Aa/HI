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

type Mode = "hidden" | "rest" | "link" | "label";

/**
 * Desktop cursor ring: a thin circle that trails the pointer on a light
 * spring, next to the native cursor (which stays). Over `data-cursor="<key>"`
 * elements it grows and shows that key's label from `t.site.cursor` (view,
 * drag, open); over plain links and buttons it shrinks; it hides over text
 * fields and when the pointer leaves the window. Fine hovering pointers only,
 * and never under reduced motion. Driven by motion values: no React renders
 * while the pointer moves. Portals to <body>, so it can be mounted anywhere
 * inside the providers.
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
    let mode: Mode = "hidden";
    let label = "";
    let lastTarget: EventTarget | null = null;

    const apply = (next: Mode, nextLabel = "") => {
      if (next === mode && nextLabel === label) return;
      mode = next;
      label = nextLabel;
      if (next !== "hidden") size.set(SIZE[next]);
      opacity.set(next === "hidden" ? 0 : 1);
      if (labelRef.current && nextLabel) labelRef.current.textContent = nextLabel;
      labelOpacity.set(nextLabel ? 1 : 0);
    };

    const modeFor = (target: Element): [Mode, string?] => {
      if (target.closest(TEXT_ENTRY)) return ["hidden"];
      const tagged = target.closest<HTMLElement>("[data-cursor]");
      if (tagged) return ["label", labels[tagged.dataset.cursor ?? ""] ?? ""];
      if (target.closest(INTERACTIVE)) return ["link"];
      return ["rest"];
    };

    const retarget = (target: EventTarget | null) => {
      if (target === lastTarget) return;
      lastTarget = target;
      if (target instanceof Element) apply(...modeFor(target));
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
      retarget(e.target);
    };

    // Scrolling moves the page under a still pointer: re-read what it is over, once per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame || lastTarget === null) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (lastTarget !== null) retarget(document.elementFromPoint(x.get(), y.get()));
      });
    };

    const onLeave = () => {
      lastTarget = null;
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
