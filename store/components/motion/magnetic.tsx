"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useFinePointer } from "./shared";

const SPRING = { stiffness: 150, damping: 15, mass: 0.1 };

/**
 * Pulls its children toward the cursor while it hovers the element (desktop,
 * fine pointers only), springing back on leave. `strength` is the fraction of
 * the cursor's offset from the centre that the content follows.
 */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fine = useFinePointer();
  const reduced = useReducedMotion();
  const enabled = fine && !reduced;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, SPRING);
  const y = useSpring(my, SPRING);

  const onPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!enabled || !el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * strength);
    my.set((e.clientY - (r.top + r.height / 2)) * strength);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.span
      ref={ref}
      className={cn("inline-block", className)}
      style={enabled ? { x, y } : undefined}
      onPointerMove={enabled ? onPointerMove : undefined}
      onPointerLeave={enabled ? reset : undefined}
      onPointerCancel={enabled ? reset : undefined}
    >
      {children}
    </motion.span>
  );
}
