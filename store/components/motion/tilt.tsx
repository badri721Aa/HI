"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { useFinePointer } from "./shared";

const SPRING = { stiffness: 170, damping: 22, mass: 0.6 };

/**
 * Tilts its content toward the cursor in 3D (perspective 900px): the side
 * under the pointer dips away, at most `max` degrees. Fine pointers only;
 * eases back flat on leave. Static on touch and with reduced motion.
 */
export function Tilt({
  children,
  max = 6,
  className,
}: {
  children: ReactNode;
  /** Maximum rotation in degrees. */
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, SPRING);
  const rotateY = useSpring(ry, SPRING);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!enabled || !el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) - 0.5;
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) - 0.5;
    ry.set(px * 2 * max);
    rx.set(-py * 2 * max);
  };

  const reset = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={enabled ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerLeave={enabled ? reset : undefined}
      onPointerCancel={enabled ? reset : undefined}
    >
      {children}
    </motion.div>
  );
}
